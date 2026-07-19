import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.skills import Skill
from app.schemas.skills import (
    SkillApplyRequest,
    SkillApplyResponse,
    SkillCreate,
    SkillFromArtifact,
    SkillHubImport,
    SkillHubItem,
    SkillPackageImport,
    SkillRead,
)
from app.services.skills.apply import apply_skill
from app.services.skills.exchange import export_skill, import_skill
from app.services.skills.harvest import from_artifact
from app.services.skills.hub import import_from_hub, list_hub
from app.services.skills.store import create_skill, list_skills

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=list[SkillRead])
def get_skills(
    project_id: uuid.UUID | None = None,
    discipline: str | None = None,
    db: Session = Depends(get_db),
) -> list[Skill]:
    return list_skills(db, project_id, discipline)


@router.post("", response_model=SkillRead, status_code=status.HTTP_201_CREATED)
def post_skill(request: SkillCreate, db: Session = Depends(get_db)) -> Skill:
    try:
        return create_skill(db, request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/from-artifact", response_model=SkillRead, status_code=status.HTTP_201_CREATED)
def post_skill_from_artifact(request: SkillFromArtifact, db: Session = Depends(get_db)) -> Skill:
    try:
        skill = from_artifact(
            db, request.artifact_id, request.name, request.intent, request.discipline
        )
        return create_skill(db, skill)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/import", response_model=SkillRead, status_code=status.HTTP_201_CREATED)
def post_skill_import(request: SkillPackageImport, db: Session = Depends(get_db)) -> Skill:
    try:
        return import_skill(db, request.project_id, request.package)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/hub", response_model=list[SkillHubItem])
def get_skill_hub(
    project_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
) -> list[SkillHubItem]:
    return list_hub(db, project_id)


@router.post("/hub/{hub_id}/import", response_model=SkillRead, status_code=status.HTTP_201_CREATED)
def post_skill_hub_import(
    hub_id: str, request: SkillHubImport, db: Session = Depends(get_db)
) -> Skill:
    try:
        return import_from_hub(db, request.project_id, hub_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/{skill_id}/export")
def get_skill_export(skill_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="skill not found")
    return export_skill(skill)


@router.post("/{skill_id}/apply", response_model=SkillApplyResponse)
async def post_skill_apply(
    skill_id: uuid.UUID, request: SkillApplyRequest, db: Session = Depends(get_db)
) -> SkillApplyResponse:
    try:
        return await apply_skill(db, skill_id, request)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
