import logging
import time
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.agent import AgentInvokeRequest, AgentInvokeResponse, AgentJobAccepted, AgentJobRead
from app.services.agents.headless import invoke_agent
from app.services.agents.jobs import cancel_job, create_job, get_job, run_job
from app.services.agents.platform_auth import require_agent_access

router = APIRouter(prefix="/agent", tags=["platform"])
logger = logging.getLogger("reprolab.agent.invoke")


@router.post("/invoke", response_model=AgentInvokeResponse)
async def invoke(
    request: AgentInvokeRequest,
    http_request: Request,
    db: Session = Depends(get_db),
    source: str = Depends(require_agent_access),
) -> AgentInvokeResponse:
    request_id = getattr(http_request.state, "request_id", uuid.uuid4().hex[:12])
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


@router.post("/jobs", response_model=AgentJobAccepted, status_code=202)
def enqueue(
    request: AgentInvokeRequest,
    background_tasks: BackgroundTasks,
    source: str = Depends(require_agent_access),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> AgentJobAccepted:
    try:
        accepted, created = create_job(source, request, idempotency_key)
    except PermissionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if created:
        background_tasks.add_task(run_job, accepted.job_id)
    return accepted


@router.get("/jobs/{job_id}", response_model=AgentJobRead)
def job_status(job_id: uuid.UUID, source: str = Depends(require_agent_access)) -> AgentJobRead:
    try:
        return get_job(source, job_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/jobs/{job_id}", response_model=AgentJobRead)
def job_cancel(job_id: uuid.UUID, source: str = Depends(require_agent_access)) -> AgentJobRead:
    try:
        return cancel_job(source, job_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
