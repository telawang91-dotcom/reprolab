import json
import re
import uuid
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.knowledge import Dataset
from app.models.skills import Skill
from app.schemas.chat import ChatRequest
from app.schemas.skills import SkillApplyRequest, SkillApplyResponse, SkillTokenUsage
from app.services.agents.model_adapter import ModelAdapter, model_adapter
from app.services.agents.orchestrator import run_chat
from app.services.sandbox.runner import run_with_retry


class RoleMappingError(ValueError):
    def __init__(self, message: str, tokens: int = 0):
        self.tokens = tokens
        super().__init__(message)


def _json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, re.DOTALL | re.IGNORECASE)
    if fenced:
        stripped = fenced.group(1)
    start, end = stripped.find("{"), stripped.rfind("}")
    if start < 0 or end < start:
        raise ValueError("model did not return a JSON object")
    value = json.loads(stripped[start : end + 1])
    if not isinstance(value, dict):
        raise ValueError("model response must be an object")
    return value


def _datasets(db: Session, request: SkillApplyRequest) -> list[Dataset]:
    rows = list(db.scalars(select(Dataset).where(Dataset.id.in_(request.dataset_ids))))
    by_id = {item.id: item for item in rows}
    if any(item not in by_id for item in request.dataset_ids):
        raise ValueError("dataset not found")
    ordered = [by_id[item] for item in request.dataset_ids]
    if any(item.project_id not in {None, request.project_id} for item in ordered):
        raise ValueError("dataset belongs to another project")
    return ordered


def _available_columns(datasets: list[Dataset]) -> set[str]:
    columns: set[str] = set()
    for dataset in datasets:
        for item in (dataset.schema_json or {}).get("columns", []):
            if isinstance(item, dict) and isinstance(item.get("name"), str):
                columns.add(item["name"])
            elif isinstance(item, str):
                columns.add(item)
    return columns


def map_roles(
    skill: Skill, datasets: list[Dataset], adapter: ModelAdapter = model_adapter
) -> tuple[dict[str, str], str, int]:
    roles = skill.input_roles or {}
    if not roles:
        return {}, "技能无需字段映射", 0
    available = _available_columns(datasets)
    by_normalized = {column.casefold(): column for column in available}
    deterministic: dict[str, str] = {}
    for role, spec in roles.items():
        preferred = spec.get("preferred_columns") or []
        candidates = [role, *preferred] if isinstance(preferred, list) else [role]
        selected = next(
            (by_normalized[str(candidate).casefold()] for candidate in candidates
             if str(candidate).casefold() in by_normalized),
            None,
        )
        if selected is not None:
            deterministic[role] = selected
    required = {name for name, spec in roles.items() if spec.get("required", True)}
    if required.issubset(deterministic):
        return deterministic, "根据字段名与技能首选字段完成确定性映射", 0
    schemas = [
        {"index": index, "name": item.name, "schema": item.schema_json or {}}
        for index, item in enumerate(datasets)
    ]
    response = adapter.chat({
        "model": settings.planner_model,
        "temperature": 0,
        "messages": [
            {
                "role": "system",
                "content": "你只负责把技能语义字段角色映射到新数据的真实列名。只返回 JSON，不生成分析代码。",
            },
            {
                "role": "user",
                "content": (
                    f"技能意图：{skill.intent}\n角色契约：{json.dumps(roles, ensure_ascii=False)}\n"
                    f"新数据 schema：{json.dumps(schemas, ensure_ascii=False)}\n"
                    "返回 {\"mapping\":{\"role\":\"column\"},\"confidence\":0到1,\"reason\":\"说明\"}。"
                    "必填角色不确定时不要猜，令其值为空字符串。"
                ),
            },
        ],
    })
    payload = _json_object(response.content)
    raw_mapping = payload.get("mapping")
    confidence = payload.get("confidence", 0)
    if not isinstance(raw_mapping, dict) or not isinstance(confidence, (int, float)):
        raise RoleMappingError(
            "model returned an invalid field mapping", response.usage.get("total_tokens", 0)
        )
    mapping = {str(role): str(column) for role, column in raw_mapping.items() if column}
    if confidence < 0.6 or not required.issubset(mapping) or any(column not in available for column in mapping.values()):
        raise RoleMappingError(
            str(payload.get("reason") or "字段角色无法可靠映射"),
            response.usage.get("total_tokens", 0),
        )
    unknown_roles = set(mapping) - set(roles)
    if unknown_roles:
        raise RoleMappingError(
            "model mapped unknown skill roles", response.usage.get("total_tokens", 0)
        )
    return mapping, str(payload.get("reason") or "字段映射完成"), response.usage.get("total_tokens", 0)


def render_template(template: str, roles: dict[str, dict[str, Any]], mapping: dict[str, str]) -> str:
    code = template
    for role in roles:
        if role in mapping:
            code = code.replace(f"{{{{{role}}}}}", repr(mapping[role]))
    unresolved = re.findall(r"\{\{([a-z][a-z0-9_]*)\}\}", code)
    if unresolved:
        raise ValueError("unresolved skill roles: " + ", ".join(sorted(set(unresolved))))
    return code


async def _fallback(
    db: Session,
    skill: Skill,
    request: SkillApplyRequest,
    reason: str,
    mapping_tokens: int,
    adapter: ModelAdapter,
) -> SkillApplyResponse:
    intent = request.intent_override or skill.intent or skill.name
    events = []
    async for event in run_chat(db, ChatRequest(
        project_id=request.project_id,
        conversation_id=request.conversation_id,
        message=f"{intent}\n技能字段无法可靠映射，请根据当前数据动态完成同类分析。",
        dataset_ids=request.dataset_ids,
    ), adapter):
        events.append(event.model_dump(mode="json"))
    run_events = [item for item in events if item["event"] == "run"]
    artifact_events = [item["data"] for item in events if item["event"] == "artifact"]
    done_events = [item for item in events if item["event"] == "done"]
    run_id = uuid.UUID(run_events[-1]["data"]["run_id"]) if run_events else None
    conversation_id = uuid.UUID(done_events[-1]["data"]["conversation_id"]) if done_events else None
    return SkillApplyResponse(
        skill_id=skill.id,
        fallback_used=True,
        mapping_reason=reason,
        run_id=run_id,
        status="success" if run_events and run_events[-1]["data"]["status"] == "success" else "error",
        artifacts=artifact_events,
        conversation_id=conversation_id,
        events=events,
        token_usage=SkillTokenUsage(mapping_tokens=mapping_tokens),
    )


async def apply_skill(
    db: Session,
    skill_id: uuid.UUID,
    request: SkillApplyRequest,
    adapter: ModelAdapter = model_adapter,
) -> SkillApplyResponse:
    skill = db.scalar(select(Skill).where(
        Skill.id == skill_id,
        or_(Skill.project_id.is_(None), Skill.project_id == request.project_id),
    ))
    if skill is None:
        raise LookupError("skill not found or unavailable to project")
    datasets = _datasets(db, request)
    mapping_tokens = 0
    try:
        mapping, reason, mapping_tokens = map_roles(skill, datasets, adapter)
        code = render_template(skill.template, skill.input_roles or {}, mapping)
    except (ValueError, json.JSONDecodeError) as exc:
        consumed = exc.tokens if isinstance(exc, RoleMappingError) else mapping_tokens
        return await _fallback(db, skill, request, str(exc), consumed, adapter)
    run = run_with_retry(
        db,
        project_id=request.project_id,
        conversation_id=request.conversation_id,
        code=code,
        dataset_ids=request.dataset_ids,
        seed=int((skill.meta or {}).get("seed") or 42),
    )
    baseline = int((skill.meta or {}).get("estimated_from_scratch_tokens") or 1800)
    artifacts = [
        {
            "artifact_id": str(item.artifact_id),
            "kind": item.kind,
            "value_json": item.value,
            "figure_url": (
                f"/api/v1/artifacts/{item.artifact_id}/content" if item.storage_hash else None
            ),
            "anchor": f"⟦art_{str(item.artifact_id)[:4]}⟧",
            "title": item.title,
        }
        for item in run.artifacts if item.artifact_id is not None
    ]
    return SkillApplyResponse(
        skill_id=skill.id,
        fallback_used=False,
        mapping=mapping,
        mapping_reason=reason,
        run_id=run.run_id,
        status=run.status,
        code=code,
        artifacts=artifacts,
        conversation_id=request.conversation_id,
        token_usage=SkillTokenUsage(
            mapping_tokens=mapping_tokens,
            estimated_from_scratch_tokens=baseline,
            saved_tokens=max(0, baseline - mapping_tokens),
        ),
    )
