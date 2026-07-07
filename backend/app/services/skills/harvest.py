import json
import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.knowledge import Artifact, Dataset, Memory, Run
from app.schemas.skills import SkillCreate
from app.services.agents.model_adapter import ModelAdapter, model_adapter


def _json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, re.DOTALL | re.IGNORECASE)
    if fenced:
        stripped = fenced.group(1)
    start, end = stripped.find("{"), stripped.rfind("}")
    if start < 0 or end < start:
        raise ValueError("model did not return a JSON object")
    payload = json.loads(stripped[start : end + 1])
    if not isinstance(payload, dict):
        raise ValueError("model response must be an object")
    return payload


def _source_datasets(db: Session, run: Run) -> list[Dataset]:
    if not run.input_hashes:
        return []
    rows = list(db.scalars(select(Dataset).where(Dataset.storage_hash.in_(run.input_hashes))))
    by_hash = {item.storage_hash: item for item in rows}
    return [by_hash[item] for item in run.input_hashes if item in by_hash]


def from_run(
    db: Session,
    run_id: uuid.UUID,
    name: str | None = None,
    discipline: str = "general",
) -> SkillCreate:
    run = db.get(Run, run_id)
    if run is None:
        raise LookupError("run not found")
    if run.status != "success":
        raise ValueError("only successful runs can be harvested")
    candidates = list(db.scalars(
        select(Memory).where(Memory.project_id == run.project_id, Memory.layer == "skill").limit(10)
    ))
    return SkillCreate(
        project_id=run.project_id,
        name=name or f"固化流程 {str(run.id)[:8]}",
        discipline=discipline,
        template=run.code,
        meta={
            "source_run_id": str(run.id),
            "lang": run.lang,
            "seed": run.seed,
            "renderer": "auto",
            "tools": ["sandbox", "emit_artifact"],
            "candidate_memory_ids": [str(item.id) for item in candidates],
        },
    )


def from_artifact(
    db: Session,
    artifact_id: uuid.UUID,
    name: str,
    intent: str,
    discipline: str = "general",
    adapter: ModelAdapter = model_adapter,
) -> SkillCreate:
    artifact = db.get(Artifact, artifact_id)
    if artifact is None:
        raise LookupError("artifact not found")
    if artifact.run_id is None:
        raise ValueError("artifact has no source run")
    run = db.get(Run, artifact.run_id)
    if run is None or run.status != "success":
        raise ValueError("artifact source run must exist and be successful")
    datasets = _source_datasets(db, run)
    context = [
        {"index": index, "name": item.name, "schema": item.schema_json or {}}
        for index, item in enumerate(datasets)
    ]
    response = adapter.chat({
        "model": settings.executor_model,
        "temperature": 0,
        "messages": [
            {
                "role": "system",
                "content": (
                    "你把已成功运行的科研 Python 代码固化为可复用技能。只返回 JSON；"
                    "保留分析逻辑、emit_artifact 和 DATASET_PATHS，不运行代码。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"技能意图：{intent}\n数据集 schema：{json.dumps(context, ensure_ascii=False)}\n"
                    f"成功代码：\n{run.code}\n\n"
                    "识别代码依赖的语义字段角色，把每个列名替换为未加引号的 {{role_name}} 占位符。"
                    "返回 {\"template\":\"完整Python代码\",\"input_roles\":{"
                    "\"role_name\":{\"description\":\"语义\",\"original_column\":\"原列名\","
                    "\"dtype\":\"类型提示\",\"required\":true}},"
                    "\"estimated_from_scratch_tokens\":整数}。角色名仅用小写字母数字下划线。"
                ),
            },
        ],
    })
    payload = _json_object(response.content)
    template = payload.get("template")
    roles = payload.get("input_roles")
    if not isinstance(template, str) or not template.strip():
        raise ValueError("model returned an empty skill template")
    if not isinstance(roles, dict):
        raise ValueError("model returned invalid input roles")
    normalized: dict[str, dict[str, Any]] = {}
    for role, spec in roles.items():
        if not isinstance(role, str) or not re.fullmatch(r"[a-z][a-z0-9_]*", role):
            raise ValueError("model returned an invalid role name")
        if not isinstance(spec, dict) or not isinstance(spec.get("description"), str):
            raise ValueError(f"model returned an invalid role contract: {role}")
        if f"{{{{{role}}}}}" not in template:
            raise ValueError(f"template is missing role placeholder: {role}")
        normalized[role] = {
            "description": spec["description"],
            "original_column": str(spec.get("original_column") or ""),
            "dtype": str(spec.get("dtype") or "unknown"),
            "required": bool(spec.get("required", True)),
        }
    baseline = payload.get("estimated_from_scratch_tokens", 1800)
    if not isinstance(baseline, int) or baseline < 1:
        baseline = 1800
    return SkillCreate(
        project_id=run.project_id,
        name=name,
        discipline=discipline,
        template=template,
        intent=intent,
        input_roles=normalized,
        origin="local",
        meta={
            "source_run_id": str(run.id),
            "source_artifact_id": str(artifact.id),
            "lang": run.lang,
            "seed": run.seed,
            "renderer": artifact.kind,
            "tools": ["sandbox", "emit_artifact"],
            "estimated_from_scratch_tokens": baseline,
            "harvest_tokens": response.usage.get("total_tokens", 0),
        },
    )
