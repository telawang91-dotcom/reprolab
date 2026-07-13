import logging
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.agent import AgentInvokeRequest, AgentInvokeResponse
from app.services.agents.headless import invoke_agent
from app.services.agents.platform_auth import require_agent_access

router = APIRouter(prefix="/agent", tags=["platform"])
logger = logging.getLogger("reprolab.agent.invoke")


@router.post("/invoke", response_model=AgentInvokeResponse)
async def invoke(
    request: AgentInvokeRequest,
    db: Session = Depends(get_db),
    source: str = Depends(require_agent_access),
) -> AgentInvokeResponse:
    request_id = uuid.uuid4().hex[:12]
    started = time.perf_counter()
    try:
        response = await invoke_agent(db, request)
        logger.info(
            "agent.invoke id=%s project=%s source=%s status=success duration_ms=%d artifacts=%d",
            request_id, request.project_id, source,
            int((time.perf_counter() - started) * 1000), len(response.artifacts),
        )
        return response
    except LookupError as exc:
        logger.warning("agent.invoke id=%s project=%s source=%s status=not_found", request_id, request.project_id, source)
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, PermissionError) as exc:
        logger.warning("agent.invoke id=%s project=%s source=%s status=rejected", request_id, request.project_id, source)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
