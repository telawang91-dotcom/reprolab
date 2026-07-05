import json
import re
import uuid
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.knowledge import Artifact, Document
from app.models.suggestions import Suggestion
from app.schemas.suggest import Evidence, SuggestionCandidate
from app.services.agents.model_adapter import ModelAdapter, model_adapter
from app.services.memory.recall import memory_context, recall_memories


def _json_array(text: str) -> list[dict[str, Any]]:
    stripped = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, re.DOTALL | re.IGNORECASE)
    if fenced:
        stripped = fenced.group(1)
    start, end = stripped.find("["), stripped.rfind("]")
    if start < 0 or end < start:
        raise ValueError("model did not return a JSON array")
    value = json.loads(stripped[start : end + 1])
    if not isinstance(value, list):
        raise ValueError("suggestions must be an array")
    return value


def gather_context(db: Session, project_id: uuid.UUID) -> dict[str, Any]:
    documents = list(db.scalars(
        select(Document)
        .where(Document.project_id == project_id, Document.type == "paper")
        .order_by(Document.created_at.desc())
        .limit(20)
    ))
    artifacts = list(db.scalars(
        select(Artifact)
        .where(Artifact.project_id == project_id)
        .order_by(Artifact.created_at.desc())
        .limit(20)
    ))
    memories = []
    try:
        memories = recall_memories(db, project_id, "当前科研进展与下一步研究建议", k=6)
    except SQLAlchemyError:
        db.rollback()
    return {
        "documents": [
            {"id": str(item.id), "title": item.title or item.filename, "year": item.year}
            for item in documents
        ],
        "artifacts": [
            {"id": str(item.id), "kind": item.kind, "title": item.title, "value": item.value_json}
            for item in artifacts
        ],
        "memories": memory_context(memories),
    }


def build_prompt(context: dict[str, Any]) -> str:
    return (
        "基于以下真实科研上下文生成2到3条建议。只返回JSON数组；type只能是"
        "hypothesis/literature/next_step。每条evidence必须非空，kind只能是document/artifact，"
        "id必须逐字复制上下文中的完整UUID；不要输出anchor，不得虚构证据。\n"
        + json.dumps(context, ensure_ascii=False, default=str)
    )


def generate_suggestions(
    db: Session,
    project_id: uuid.UUID,
    adapter: ModelAdapter | None = None,
) -> list[Suggestion]:
    context = gather_context(db, project_id)
    if not context["documents"] and not context["artifacts"]:
        return []
    try:
        response = (adapter or model_adapter).chat({
            "model": settings.agent_model_route["critic"],
            "messages": [
                {"role": "system", "content": "你是谨慎的科研建议助手，只能使用给定证据。"},
                {"role": "user", "content": build_prompt(context)},
            ]
        })
        raw_candidates = _json_array(response.content)
    except (RuntimeError, ValueError, json.JSONDecodeError):
        return []

    allowed = {
        "document": {item["id"] for item in context["documents"]},
        "artifact": {item["id"] for item in context["artifacts"]},
    }
    suggestions: list[Suggestion] = []
    for raw in raw_candidates[:3]:
        try:
            candidate = SuggestionCandidate.model_validate(raw)
            evidence: list[Evidence] = []
            for item in candidate.evidence:
                kind = item.get("kind")
                identifier = str(uuid.UUID(str(item.get("id"))))
                if kind not in allowed or identifier not in allowed[kind]:
                    raise ValueError("evidence is not in the supplied context")
                prefix = "src" if kind == "document" else "art"
                evidence.append(Evidence(
                    kind=kind, id=uuid.UUID(identifier), anchor=f"⟦{prefix}_{identifier[:4]}⟧"
                ))
        except (ValidationError, ValueError, TypeError, AttributeError):
            continue
        suggestion = Suggestion(
            project_id=project_id,
            type=candidate.type,
            content=candidate.content,
            evidence=[item.model_dump(mode="json") for item in evidence],
            status="new",
        )
        db.add(suggestion)
        suggestions.append(suggestion)
    if suggestions:
        db.commit()
        for item in suggestions:
            db.refresh(item)
    return suggestions
