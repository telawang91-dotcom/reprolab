import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.collections import (
    CollectionCreate,
    CollectionDelete,
    CollectionRead,
    CollectionUpdate,
)
from app.services.rag import collections as collection_service

router = APIRouter(prefix="/collections", tags=["collections"])


@router.post("", response_model=CollectionRead, status_code=status.HTTP_201_CREATED)
def post_collection(request: CollectionCreate, db: Session = Depends(get_db)) -> CollectionRead:
    try:
        return collection_service.create_collection(db, request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("", response_model=list[CollectionRead])
def get_collections(project_id: uuid.UUID, db: Session = Depends(get_db)) -> list[CollectionRead]:
    return collection_service.list_collections(db, project_id)


@router.patch("/{collection_id}", response_model=CollectionRead)
def patch_collection(
    collection_id: uuid.UUID, request: CollectionUpdate, db: Session = Depends(get_db)
) -> CollectionRead:
    try:
        return collection_service.update_collection(db, collection_id, request)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/{collection_id}", response_model=CollectionDelete)
def remove_collection(
    collection_id: uuid.UUID, db: Session = Depends(get_db)
) -> CollectionDelete:
    if not collection_service.delete_collection(db, collection_id):
        raise HTTPException(status_code=404, detail="collection not found")
    return CollectionDelete(id=collection_id, deleted=True)
