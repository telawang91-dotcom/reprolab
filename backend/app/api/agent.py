from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.agent import AgentInvokeRequest, AgentInvokeResponse
from app.services.agents.headless import invoke_agent

router = APIRouter(prefix="/agent", tags=["platform"])


@router.post("/invoke", response_model=AgentInvokeResponse)
async def invoke(request: AgentInvokeRequest, db: Session = Depends(get_db)) -> AgentInvokeResponse:
    try:
        return await invoke_agent(db, request)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, PermissionError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
