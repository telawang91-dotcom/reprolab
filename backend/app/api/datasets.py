import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.datasets import DatasetCatalogItem, DatasetQueryRequest, DatasetQueryResponse
from app.services.rag.datasets import list_datasets, query_datasets


router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("", response_model=list[DatasetCatalogItem])
def catalog(
    project_id: uuid.UUID,
    collection_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return list_datasets(db, project_id, collection_id)


@router.post("/query", response_model=DatasetQueryResponse)
def structured_query(request: DatasetQueryRequest, db: Session = Depends(get_db)):
    try:
        return DatasetQueryResponse(results=query_datasets(db, request.project_id, request.queries))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
