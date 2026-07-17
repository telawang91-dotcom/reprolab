import uuid
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.workbench import ArtifactLibraryState, ArtifactLibraryUpdate, ArtifactListResponse, EvidenceResponse, ProjectQualityReport, ReviewResponse, RunCompare, RunReport, TimelineResponse
from app.services import workbench
from app.services.lineage.bundle import build_reproducibility_bundle


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


@router.get("/projects/{project_id}/quality-report", response_model=ProjectQualityReport)
def quality_report(project_id: uuid.UUID, db: Session = Depends(get_db)) -> ProjectQualityReport:
    return guarded(lambda: workbench.project_quality_report(db, project_id))


@router.get("/projects/{project_id}/artifacts", response_model=ArtifactListResponse)
def artifacts(project_id: uuid.UUID, limit: int = 50, view: str = "saved", db: Session = Depends(get_db)) -> ArtifactListResponse:
    try:
        return workbench.project_artifacts(db, project_id, min(max(limit, 1), 100), view)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/artifacts/{artifact_id}/library", response_model=ArtifactLibraryState)
def artifact_library(artifact_id: uuid.UUID, project_id: uuid.UUID, db: Session = Depends(get_db)) -> ArtifactLibraryState:
    return guarded(lambda: workbench.artifact_library_state(db, project_id, artifact_id))


@router.put("/artifacts/{artifact_id}/library", response_model=ArtifactLibraryState)
def update_artifact_library(
    artifact_id: uuid.UUID, request: ArtifactLibraryUpdate, db: Session = Depends(get_db)
) -> ArtifactLibraryState:
    return guarded(lambda: workbench.set_artifact_library_state(db, request.project_id, artifact_id, request.saved))


@router.get("/runs/{run_id}/report", response_model=RunReport)
def report(run_id: uuid.UUID, project_id: uuid.UUID, db: Session = Depends(get_db)) -> RunReport:
    return guarded(lambda: workbench.run_report(db, project_id, run_id))


@router.get("/runs/{run_id}/bundle")
def bundle(run_id: uuid.UUID, project_id: uuid.UUID, db: Session = Depends(get_db)) -> StreamingResponse:
    try:
        filename, payload = build_reproducibility_bundle(db, project_id, run_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return StreamingResponse(
        io.BytesIO(payload),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/runs/{run_id}/compare", response_model=RunCompare)
def compare(run_id: uuid.UUID, project_id: uuid.UUID, other_run_id: uuid.UUID, db: Session = Depends(get_db)) -> RunCompare:
    return guarded(lambda: workbench.run_compare(db, project_id, run_id, other_run_id))


@router.get("/documents/{document_id}/evidence", response_model=EvidenceResponse)
def evidence(document_id: uuid.UUID, project_id: uuid.UUID, db: Session = Depends(get_db)) -> EvidenceResponse:
    return guarded(lambda: workbench.document_evidence(db, project_id, document_id))
