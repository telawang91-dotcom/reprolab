from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.conclusions import ConclusionCreate, ConclusionOut
from app.services.memory.conclusions import write_back_conclusion

router = APIRouter(prefix="/conclusions", tags=["writing"])


@router.post("", response_model=ConclusionOut)
def create_conclusion(request: ConclusionCreate, db: Session = Depends(get_db)) -> ConclusionOut:
    try:
        document_id = write_back_conclusion(
            db, request.project_id, request.claim_text, request.anchors, request.status
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return ConclusionOut(document_id=document_id)

