import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.suggestions import Suggestion
from app.schemas.suggest import RefreshRequest, RefreshResponse, SuggestionOut
from app.services.suggest.generator import generate_suggestions

router = APIRouter(prefix="/suggestions", tags=["suggestions"])


@router.get("", response_model=list[SuggestionOut])
def list_suggestions(project_id: uuid.UUID, db: Session = Depends(get_db)) -> list[Suggestion]:
    return list(db.scalars(
        select(Suggestion)
        .where(Suggestion.project_id == project_id, Suggestion.status != "dismissed")
        .order_by(Suggestion.created_at.desc(), Suggestion.id)
        .limit(3)
    ))


@router.post("/refresh", response_model=RefreshResponse)
def refresh_suggestions(request: RefreshRequest, db: Session = Depends(get_db)) -> RefreshResponse:
    items = generate_suggestions(db, request.project_id)
    return RefreshResponse(
        generated=len(items), items=[SuggestionOut.model_validate(item) for item in items]
    )
