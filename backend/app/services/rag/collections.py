import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.knowledge import Collection, Document, Project
from app.schemas.collections import CollectionCreate, CollectionRead, CollectionUpdate


def _read(collection: Collection, document_count: int = 0) -> CollectionRead:
    return CollectionRead(
        id=collection.id,
        project_id=collection.project_id,
        name=collection.name,
        description=collection.description,
        document_count=document_count,
        created_at=collection.created_at,
    )


def require_collection(db: Session, collection_id: uuid.UUID, project_id: uuid.UUID) -> Collection:
    collection = db.get(Collection, collection_id)
    if collection is None:
        raise LookupError("collection not found")
    if collection.project_id != project_id:
        raise PermissionError("collection belongs to another project")
    return collection


def create_collection(db: Session, request: CollectionCreate) -> CollectionRead:
    if db.get(Project, request.project_id) is None:
        raise ValueError("project not found")
    name = request.name.strip()
    duplicate = db.scalar(select(Collection.id).where(
        Collection.project_id == request.project_id,
        func.lower(Collection.name) == name.lower(),
    ))
    if duplicate is not None:
        raise ValueError("collection name already exists in this project")
    collection = Collection(
        project_id=request.project_id,
        name=name,
        description=request.description.strip() if request.description else None,
    )
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return _read(collection)


def list_collections(db: Session, project_id: uuid.UUID) -> list[CollectionRead]:
    rows = db.execute(
        select(Collection, func.count(Document.id).label("document_count"))
        .outerjoin(Document, Document.collection_id == Collection.id)
        .where(Collection.project_id == project_id)
        .group_by(Collection.id)
        .order_by(Collection.created_at, Collection.id)
    )
    return [_read(collection, int(document_count)) for collection, document_count in rows]


def update_collection(
    db: Session, collection_id: uuid.UUID, request: CollectionUpdate
) -> CollectionRead:
    collection = db.get(Collection, collection_id)
    if collection is None:
        raise LookupError("collection not found")
    if request.name is not None:
        name = request.name.strip()
        duplicate = db.scalar(select(Collection.id).where(
            Collection.project_id == collection.project_id,
            Collection.id != collection.id,
            func.lower(Collection.name) == name.lower(),
        ))
        if duplicate is not None:
            raise ValueError("collection name already exists in this project")
        collection.name = name
    if "description" in request.model_fields_set:
        collection.description = request.description.strip() if request.description else None
    db.commit()
    db.refresh(collection)
    count = db.scalar(select(func.count(Document.id)).where(Document.collection_id == collection.id)) or 0
    return _read(collection, count)


def delete_collection(db: Session, collection_id: uuid.UUID) -> bool:
    collection = db.get(Collection, collection_id)
    if collection is None:
        return False
    db.delete(collection)
    db.commit()
    return True
