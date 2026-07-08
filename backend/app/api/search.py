from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.search import QARequest, QAResponse, SearchRequest, SearchResponse
from app.services.rag.qa import answer_question
from app.services.rag.retrieval import complex_retrieve

router = APIRouter(tags=["retrieval"])


@router.post("/search", response_model=SearchResponse)
def search(request: SearchRequest, db: Session = Depends(get_db)) -> SearchResponse:
    return SearchResponse(
        hits=complex_retrieve(
            db,
            request.project_id,
            request.query,
            request.mode,
            request.filters,
            request.k,
            request.collection_id,
        )
    )


@router.post("/qa", response_model=QAResponse)
def qa(request: QARequest, db: Session = Depends(get_db)) -> QAResponse:
    try:
        return answer_question(
            db, request.project_id, request.query, collection_id=request.collection_id
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
