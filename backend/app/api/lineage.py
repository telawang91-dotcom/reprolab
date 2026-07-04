import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.lineage import LineageResponse, ReproduceRequest, ReproduceResponse
from app.services.lineage.ledger import get_lineage
from app.services.lineage.reproduce import reproduce

router = APIRouter(tags=["lineage"])


@router.get("/artifacts/{artifact_id}/lineage", response_model=LineageResponse)
def artifact_lineage(artifact_id: uuid.UUID, db: Session = Depends(get_db)) -> LineageResponse:
    result = get_lineage(db, artifact_id)
    if result is None:
        raise HTTPException(status_code=404, detail="artifact not found")
    return result


@router.post("/runs/{run_id}/reproduce", response_model=ReproduceResponse)
def reproduce_run(run_id: uuid.UUID, request: ReproduceRequest, db: Session = Depends(get_db)) -> ReproduceResponse:
    try:
        return reproduce(db, run_id, request.dataset_overrides)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

