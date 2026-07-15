import asyncio
import uuid

import pytest

from app.schemas.agent import AgentInvokeRequest
from app.services.agents import jobs


def request() -> AgentInvokeRequest:
    return AgentInvokeRequest(project_id=uuid.uuid4(), task="计算均值")


def test_idempotency_reuses_same_job_and_rejects_changed_payload():
    jobs.reset_for_tests()
    first, created = jobs.create_job("source", request(), "same-key")
    repeated, repeated_created = jobs.create_job("source", jobs.get_job("source", first.job_id) and jobs._jobs[first.job_id].request, "same-key")
    assert created is True and repeated_created is False
    assert repeated.job_id == first.job_id
    with pytest.raises(PermissionError):
        jobs.create_job("source", AgentInvokeRequest(project_id=uuid.uuid4(), task="另一任务"), "same-key")


def test_queued_job_can_be_cancelled_and_is_source_scoped():
    jobs.reset_for_tests()
    accepted, _ = jobs.create_job("owner", request(), None)
    cancelled = jobs.cancel_job("owner", accepted.job_id)
    assert cancelled.status == "cancelled" and cancelled.finished_at is not None
    with pytest.raises(LookupError):
        jobs.get_job("other", accepted.job_id)


def test_background_job_success_and_cooperative_cancel(monkeypatch):
    jobs.reset_for_tests()

    class FakeSession:
        def __enter__(self): return self
        def __exit__(self, *_): return None

    async def fake_invoke(_db, _request):
        from app.schemas.agent import AgentInvokeResponse
        from app.schemas.verify import VerifyResponse
        return AgentInvokeResponse(result="done", artifacts=[], lineage={}, verify_report=VerifyResponse(verdict="pass", items=[]))

    monkeypatch.setattr(jobs, "SessionLocal", FakeSession)
    monkeypatch.setattr(jobs, "invoke_agent", fake_invoke)
    accepted, _ = jobs.create_job("owner", request(), None)
    asyncio.run(jobs.run_job(accepted.job_id))
    completed = jobs.get_job("owner", accepted.job_id)
    assert completed.status == "succeeded" and completed.result.result == "done"
