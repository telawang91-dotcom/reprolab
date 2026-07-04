from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.runs import RunRequest, RunResponse
from app.services.sandbox.runner import run_with_retry

router = APIRouter(prefix="/runs", tags=["runs"])


@router.post("", response_model=RunResponse)
def create_run(request: RunRequest, db: Session = Depends(get_db)) -> RunResponse:
    try:
        return run_with_retry(
            db,
            project_id=request.project_id,
            conversation_id=request.conversation_id,
            code=request.code,
            lang=request.lang,
            dataset_ids=request.dataset_ids,
            seed=request.seed,
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc

