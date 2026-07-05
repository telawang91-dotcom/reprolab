import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.knowledge import Project, Run
from app.models.skills import Skill
from app.schemas.skills import SkillCreate
from app.services.skills.builtin import BUILTIN_PACKS
from app.services.skills.registry import registry


def ensure_builtins(db: Session) -> None:
    for pack in BUILTIN_PACKS:
        registry.register(pack)
        skill = db.get(Skill, pack.id)
        meta = {
            "tools": list(pack.tools),
            "prompt_template": pack.prompt_template,
            "renderer": pack.renderer,
            "builtin": True,
        }
        if skill is None:
            db.add(Skill(
                id=pack.id, project_id=None, name=pack.name, discipline=pack.discipline,
                template=pack.code_template, meta=meta,
            ))
        else:
            skill.name = pack.name
            skill.discipline = pack.discipline
            skill.template = pack.code_template
            skill.meta = meta
    db.commit()


def list_skills(
    db: Session, project_id: uuid.UUID | None = None, discipline: str | None = None
) -> list[Skill]:
    ensure_builtins(db)
    statement = select(Skill)
    if project_id is None:
        statement = statement.where(Skill.project_id.is_(None))
    else:
        statement = statement.where(or_(Skill.project_id.is_(None), Skill.project_id == project_id))
    if discipline is not None:
        statement = statement.where(Skill.discipline == discipline)
    return list(db.scalars(statement.order_by(Skill.discipline, Skill.name, Skill.id)))


def create_skill(db: Session, request: SkillCreate) -> Skill:
    if request.project_id is not None and db.get(Project, request.project_id) is None:
        raise ValueError("project not found")
    meta = dict(request.meta or {})
    source_run_id = meta.get("source_run_id")
    if source_run_id:
        try:
            run_id = uuid.UUID(str(source_run_id))
        except ValueError as exc:
            raise ValueError("meta.source_run_id must be a UUID") from exc
        run = db.get(Run, run_id)
        if run is None or run.status != "success":
            raise ValueError("source run must exist and be successful")
        if request.project_id is not None and run.project_id != request.project_id:
            raise ValueError("source run belongs to another project")
        meta["source_run_id"] = str(run_id)
    skill = Skill(
        project_id=request.project_id,
        name=request.name,
        discipline=request.discipline,
        template=request.template,
        meta=meta or None,
    )
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill
