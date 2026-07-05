import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.skills import Skill
from app.schemas.skills import SkillCreate, SkillRead
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
