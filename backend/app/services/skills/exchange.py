import hashlib
import json
import re
from typing import Any

from sqlalchemy.orm import Session

from app.models.knowledge import Project
from app.models.skills import Skill
from app.schemas.skills import SkillCreate
from app.services.skills.store import create_skill

FORMAT = "reprolab.skill"
PACKAGE_VERSION = 1


def _canonical(value: dict[str, Any]) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def package_hash(payload: dict[str, Any]) -> str:
    unsigned = dict(payload)
    unsigned.pop("package_hash", None)
    return hashlib.sha256(_canonical(unsigned)).hexdigest()


def export_skill(skill: Skill) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "format": FORMAT,
        "package_version": PACKAGE_VERSION,
        "skill": {
            "name": skill.name,
            "discipline": skill.discipline,
            "intent": skill.intent,
            "template": skill.template,
            "input_roles": skill.input_roles or {},
            "version": skill.version,
            "meta": {
                key: value for key, value in (skill.meta or {}).items()
                if key not in {"candidate_memory_ids"}
            },
        },
    }
    payload["package_hash"] = package_hash(payload)
    return payload


def validate_package(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("format") != FORMAT or payload.get("package_version") != PACKAGE_VERSION:
        raise ValueError("unsupported skill package format or version")
    digest = payload.get("package_hash")
    if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ValueError("skill package hash is missing or invalid")
    if package_hash(payload) != digest:
        raise ValueError("skill package hash mismatch")
    skill = payload.get("skill")
    if not isinstance(skill, dict):
        raise ValueError("skill package has no skill payload")
    template = skill.get("template")
    roles = skill.get("input_roles", {})
    if not isinstance(template, str) or not template.strip() or not isinstance(roles, dict):
        raise ValueError("skill package template or roles are invalid")
    for role in roles:
        if not isinstance(role, str) or f"{{{{{role}}}}}" not in template:
            raise ValueError(f"skill package template is missing role: {role}")
    return skill


def import_skill(db: Session, project_id, payload: dict[str, Any], origin: str = "imported") -> Skill:
    if db.get(Project, project_id) is None:
        raise ValueError("project not found")
    skill = validate_package(payload)
    meta = dict(skill.get("meta") or {})
    if "source_run_id" in meta:
        meta["upstream_source_run_id"] = meta.pop("source_run_id")
    if "source_artifact_id" in meta:
        meta["upstream_source_artifact_id"] = meta.pop("source_artifact_id")
    return create_skill(db, SkillCreate(
        project_id=project_id,
        name=skill.get("name", "导入技能"),
        discipline=skill.get("discipline"),
        intent=skill.get("intent", ""),
        template=skill["template"],
        input_roles=skill.get("input_roles", {}),
        version=skill.get("version", 1),
        origin=origin,
        package_hash=payload["package_hash"],
        meta=meta,
    ))
