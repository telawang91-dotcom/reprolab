from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.verify import VerifyRequest, VerifyResponse
from app.services.agents.verifier import verify

router = APIRouter(tags=["verification"])


@router.post("/verify", response_model=VerifyResponse)
def verify_text(request: VerifyRequest, db: Session = Depends(get_db)) -> VerifyResponse:
    try:
        return verify(db, request.project_id, request.text, request.doc_id, request.checks)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

