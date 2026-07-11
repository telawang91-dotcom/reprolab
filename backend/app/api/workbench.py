import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.workbench import EvidenceResponse, ReviewResponse, RunCompare, RunReport, TimelineResponse
from app.services import workbench


router = APIRouter(tags=["workbench"])


def guarded(call):
    try: return call()
    except LookupError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/projects/{project_id}/timeline", response_model=TimelineResponse)
def timeline(project_id: uuid.UUID, db: Session = Depends(get_db)) -> TimelineResponse:
    return guarded(lambda: workbench.project_timeline(db, project_id))


@router.get("/projects/{project_id}/review", response_model=ReviewResponse)
def review(project_id: uuid.UUID, db: Session = Depends(get_db)) -> ReviewResponse:
    return guarded(lambda: workbench.project_review(db, project_id))


@router.get("/runs/{run_id}/report", response_model=RunReport)
def report(run_id: uuid.UUID, project_id: uuid.UUID, db: Session = Depends(get_db)) -> RunReport:
    return guarded(lambda: workbench.run_report(db, project_id, run_id))


@router.get("/runs/{run_id}/compare", response_model=RunCompare)
def compare(run_id: uuid.UUID, project_id: uuid.UUID, other_run_id: uuid.UUID, db: Session = Depends(get_db)) -> RunCompare:
    return guarded(lambda: workbench.run_compare(db, project_id, run_id, other_run_id))


@router.get("/documents/{document_id}/evidence", response_model=EvidenceResponse)
def evidence(document_id: uuid.UUID, project_id: uuid.UUID, db: Session = Depends(get_db)) -> EvidenceResponse:
    return guarded(lambda: workbench.document_evidence(db, project_id, document_id))
