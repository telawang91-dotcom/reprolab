import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.knowledge import Project
from app.schemas.documents import BatchStatus, DeleteResponse, DocumentDetail, DocumentListItem, DocumentUploadResponse
from app.services.rag import ingest as ingest_service
from app.services.rag import batch_ingest
from app.services.rag.collections import require_collection
from app.services.workbench import project_document

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
def upload_document(
    file: UploadFile = File(...),
    project_id: uuid.UUID = Form(...),
    type: str | None = Form(None),
    collection_id: uuid.UUID | None = Form(None),
    db: Session = Depends(get_db),
) -> DocumentUploadResponse:
    raw = file.file.read()
    if not raw:
        raise HTTPException(status_code=422, detail="uploaded file is empty")
    try:
        result = ingest_service.ingest(
            db, file.filename or "upload", raw, project_id, type, collection_id
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return DocumentUploadResponse(
        id=result.document_id,
        type=result.document_type,
        filename=result.filename,
        storage_hash=result.storage_hash,
        chunks_count=result.chunks_count,
        dataset_id=result.dataset_id,
        collection_id=collection_id,
    )


@router.post("/batch", response_model=BatchStatus, status_code=status.HTTP_202_ACCEPTED)
def upload_batch(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    project_id: uuid.UUID = Form(...),
    type: str | None = Form(None),
    collection_id: uuid.UUID | None = Form(None),
    db: Session = Depends(get_db),
) -> BatchStatus:
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=422, detail="project not found")
    if type is not None and type not in {"paper", "note", "code", "other"}:
        raise HTTPException(status_code=422, detail="type must be paper, note, code, or other")
    if collection_id is not None:
        try:
            require_collection(db, collection_id, project_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
    try:
        prepared = batch_ingest.prepare_files([
            (file.filename or "upload", file.file.read()) for file in files
        ])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    job = batch_ingest.create_job(project_id, collection_id, prepared)
    background_tasks.add_task(
        batch_ingest.process_job,
        job.batch_id,
        project_id,
        collection_id,
        type,
        prepared,
    )
    return job


@router.get("/batch/{batch_id}", response_model=BatchStatus)
def get_batch(batch_id: uuid.UUID, project_id: uuid.UUID) -> BatchStatus:
    job = batch_ingest.get_job(batch_id)
    if job is None:
        raise HTTPException(status_code=404, detail="batch not found")
    if job.project_id != project_id:
        raise HTTPException(status_code=404, detail="batch not found")
    return job


@router.get("", response_model=list[DocumentListItem])
def get_documents(
    project_id: uuid.UUID,
    type: str | None = Query(None),
    tag: str | None = Query(None),
    q: str | None = Query(None),
    collection_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
) -> list[DocumentListItem]:
    return [DocumentListItem.model_validate(item) for item in ingest_service.list_documents(
        db, project_id, type, tag, q, collection_id
    )]


@router.get("/{document_id}", response_model=DocumentDetail)
def get_document(document_id: uuid.UUID, project_id: uuid.UUID, db: Session = Depends(get_db)) -> DocumentDetail:
    result = ingest_service.document_detail(db, document_id)
    if result is None:
        raise HTTPException(status_code=404, detail="document not found")
    document, chunks_count, dataset = result
    if document.project_id != project_id:
        raise HTTPException(status_code=404, detail="document not found")
    return DocumentDetail(
        id=document.id,
        project_id=document.project_id,
        type=document.type,
        filename=document.filename,
        storage_hash=document.storage_hash,
        title=document.title,
        authors=document.authors,
        year=document.year,
        doi=document.doi,
        source_url=document.source_url,
        metadata=document.extra_metadata,
        created_at=document.created_at,
        chunks_count=chunks_count,
        dataset_id=dataset.id if dataset else None,
        schema_json=dataset.schema_json if dataset else None,
        collection_id=document.collection_id,
    )


@router.delete("/{document_id}", response_model=DeleteResponse)
def delete_document(document_id: uuid.UUID, project_id: uuid.UUID, db: Session = Depends(get_db)) -> DeleteResponse:
    try:
        project_document(db, project_id, document_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not ingest_service.delete_document(db, document_id):
        raise HTTPException(status_code=404, detail="document not found")
    return DeleteResponse(id=document_id, deleted=True)
