from __future__ import annotations

import hashlib
import json
import logging
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.db import SessionLocal
from app.schemas.agent import AgentInvokeRequest, AgentInvokeResponse, AgentJobAccepted, AgentJobRead, AgentJobStatus
from app.services.agents.headless import invoke_agent


logger = logging.getLogger("reprolab.agent.jobs")


@dataclass
class JobRecord:
    job_id: uuid.UUID
    source: str
    request_hash: str
    request: AgentInvokeRequest
    status: AgentJobStatus
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    result: AgentInvokeResponse | None = None
    error: str | None = None


_lock = threading.Lock()
_jobs: dict[uuid.UUID, JobRecord] = {}
_idempotency: dict[tuple[str, str], uuid.UUID] = {}
_MAX_JOBS = 1000


def _hash_request(request: AgentInvokeRequest) -> str:
    payload = json.dumps(request.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _read(record: JobRecord) -> AgentJobRead:
    return AgentJobRead(
        job_id=record.job_id,
        status=record.status,
        created_at=record.created_at,
        started_at=record.started_at,
        finished_at=record.finished_at,
        result=record.result,
        error=record.error,
    )


def create_job(source: str, request: AgentInvokeRequest, idempotency_key: str | None) -> tuple[AgentJobAccepted, bool]:
    request_hash = _hash_request(request)
    clean_key = (idempotency_key or "").strip()
    if len(clean_key) > 200:
        raise ValueError("Idempotency-Key must be at most 200 characters")
    with _lock:
        if clean_key:
            existing_id = _idempotency.get((source, clean_key))
            if existing_id is not None:
                existing = _jobs[existing_id]
                if existing.request_hash != request_hash:
                    raise PermissionError("Idempotency-Key was already used with a different request")
                return AgentJobAccepted(
                    job_id=existing.job_id,
                    status=existing.status,
                    status_url=f"/api/v1/agent/jobs/{existing.job_id}",
                    created_at=existing.created_at,
                ), False
        if len(_jobs) >= _MAX_JOBS:
            terminal = sorted(
                (item for item in _jobs.values() if item.status in {"succeeded", "failed", "cancelled"}),
                key=lambda item: item.finished_at or item.created_at,
            )
            for item in terminal[: max(1, len(_jobs) - _MAX_JOBS + 1)]:
                _jobs.pop(item.job_id, None)
                for key, value in list(_idempotency.items()):
                    if value == item.job_id:
                        _idempotency.pop(key, None)
            if len(_jobs) >= _MAX_JOBS:
                raise RuntimeError("agent job capacity reached")
        now = datetime.now(timezone.utc)
        job_id = uuid.uuid4()
        record = JobRecord(job_id, source, request_hash, request, "queued", now)
        _jobs[job_id] = record
        if clean_key:
            _idempotency[(source, clean_key)] = job_id
        return AgentJobAccepted(
            job_id=job_id,
            status="queued",
            status_url=f"/api/v1/agent/jobs/{job_id}",
            created_at=now,
        ), True


def get_job(source: str, job_id: uuid.UUID) -> AgentJobRead:
    with _lock:
        record = _jobs.get(job_id)
        if record is None or record.source != source:
            raise LookupError("agent job not found")
        return _read(record)


def cancel_job(source: str, job_id: uuid.UUID) -> AgentJobRead:
    with _lock:
        record = _jobs.get(job_id)
        if record is None or record.source != source:
            raise LookupError("agent job not found")
        now = datetime.now(timezone.utc)
        if record.status == "queued":
            record.status = "cancelled"
            record.finished_at = now
        elif record.status == "running":
            record.status = "cancelling"
        return _read(record)


async def run_job(job_id: uuid.UUID) -> None:
    with _lock:
        record = _jobs.get(job_id)
        if record is None or record.status == "cancelled":
            return
        record.status = "running"
        record.started_at = datetime.now(timezone.utc)
        request = record.request
    try:
        with SessionLocal() as db:
            result = await invoke_agent(db, request)
        with _lock:
            record = _jobs[job_id]
            record.finished_at = datetime.now(timezone.utc)
            if record.status == "cancelling":
                record.status = "cancelled"
                record.result = None
            else:
                record.status = "succeeded"
                record.result = result
    except (LookupError, ValueError, PermissionError) as exc:
        with _lock:
            record = _jobs[job_id]
            record.status = "cancelled" if record.status == "cancelling" else "failed"
            record.error = None if record.status == "cancelled" else str(exc)
            record.finished_at = datetime.now(timezone.utc)
    except Exception:
        logger.exception("agent background job failed job_id=%s", job_id)
        with _lock:
            record = _jobs[job_id]
            record.status = "cancelled" if record.status == "cancelling" else "failed"
            record.error = None if record.status == "cancelled" else "agent job failed; inspect server logs using the request id"
            record.finished_at = datetime.now(timezone.utc)


def reset_for_tests() -> None:
    with _lock:
        _jobs.clear()
        _idempotency.clear()
