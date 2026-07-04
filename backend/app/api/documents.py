import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.documents import DeleteResponse, DocumentDetail, DocumentListItem, DocumentUploadResponse
from app.services.rag import ingest as ingest_service

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
def upload_document(
    file: UploadFile = File(...),
    project_id: uuid.UUID = Form(...),
    type: str | None = Form(None),
    db: Session = Depends(get_db),
) -> DocumentUploadResponse:
    raw = file.file.read()
    if not raw:
        raise HTTPException(status_code=422, detail="uploaded file is empty")
    try:
        result = ingest_service.ingest(db, file.filename or "upload", raw, project_id, type)
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
    )


@router.get("", response_model=list[DocumentListItem])
def get_documents(
    project_id: uuid.UUID,
    type: str | None = Query(None),
    tag: str | None = Query(None),
    q: str | None = Query(None),
    db: Session = Depends(get_db),
) -> list[DocumentListItem]:
    return [DocumentListItem.model_validate(item) for item in ingest_service.list_documents(db, project_id, type, tag, q)]


@router.get("/{document_id}", response_model=DocumentDetail)
def get_document(document_id: uuid.UUID, db: Session = Depends(get_db)) -> DocumentDetail:
    result = ingest_service.document_detail(db, document_id)
    if result is None:
        raise HTTPException(status_code=404, detail="document not found")
    document, chunks_count, dataset = result
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
    )


@router.delete("/{document_id}", response_model=DeleteResponse)
def delete_document(document_id: uuid.UUID, db: Session = Depends(get_db)) -> DeleteResponse:
    if not ingest_service.delete_document(db, document_id):
        raise HTTPException(status_code=404, detail="document not found")
    return DeleteResponse(id=document_id, deleted=True)

