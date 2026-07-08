import re
import uuid

from sqlalchemy.orm import Session

from app.core.config import settings
from app.schemas.search import Citation, QAResponse
from app.services.agents.model_adapter import ModelAdapter, model_adapter
from app.services.rag.retrieval import complex_retrieve

ANCHOR_PATTERN = re.compile(r"⟦src_([0-9a-fA-F]{4})⟧")


def source_anchor(document_id: uuid.UUID) -> str:
    return f"⟦src_{str(document_id)[:4]}⟧"


def extract_citations(answer: str, lookup: dict[str, Citation]) -> list[Citation]:
    ordered: list[Citation] = []
    seen: set[str] = set()
    for short_code in ANCHOR_PATTERN.findall(answer):
        anchor = f"⟦src_{short_code.lower()}⟧"
        if anchor in lookup and anchor not in seen:
            ordered.append(lookup[anchor])
            seen.add(anchor)
    return ordered


def answer_question(
    db: Session,
    project_id: uuid.UUID,
    query: str,
    adapter: ModelAdapter = model_adapter,
    collection_id: uuid.UUID | None = None,
) -> QAResponse:
    hits = complex_retrieve(
        db, project_id, query, mode="hybrid", k=8, collection_id=collection_id
    )
    if not hits:
        raise LookupError("no knowledge-base evidence found")
    lookup: dict[str, Citation] = {}
    context_parts: list[str] = []
    for hit in hits:
        anchor = source_anchor(hit.document_id)
        lookup.setdefault(
            anchor,
            Citation(document_id=hit.document_id, chunk_id=hit.chunk_id, anchor=anchor),
        )
        context_parts.append(f"{anchor}\n{hit.content}")
    response = adapter.chat(
        {
            "model": settings.agent_model_route["critic"],
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "你是严谨的科研助手。只能依据给定证据回答；每个事实后必须原样插入对应的"
                        "⟦src_xxxx⟧锚点。证据不足时明确说明，不得编造来源。"
                    ),
                },
                {"role": "user", "content": f"问题：{query}\n\n证据：\n" + "\n\n".join(context_parts)},
            ],
            "tools": [],
        }
    )
    citations = extract_citations(response.content, lookup)
    if not citations:
        raise RuntimeError("LLM answer contains no valid source anchor")
    return QAResponse(answer=response.content, citations=citations)
