from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.telemetry import reset_for_tests, snapshot
from app.main import app
from app.services.agents import platform_auth


def test_conversation_and_agent_routes_are_published():
    paths = app.openapi()["paths"]
    assert "get" in paths["/api/v1/conversations"]
    assert "get" in paths["/api/v1/conversations/{conversation_id}"]
    assert "delete" in paths["/api/v1/conversations/{conversation_id}"]
    assert "post" in paths["/api/v1/agent/invoke"]
    assert "post" in paths["/api/v1/agent/jobs"]
    assert "get" in paths["/api/v1/agent/jobs/{job_id}"]
    assert "delete" in paths["/api/v1/agent/jobs/{job_id}"]
    assert "get" in paths["/api/v1/settings/metrics"]


def test_agent_token_is_optional_but_enforced_when_configured(monkeypatch):
    request = SimpleNamespace(client=SimpleNamespace(host="contract-test"))
    monkeypatch.setattr(settings, "agent_api_token", "secret")
    monkeypatch.setattr(settings, "agent_rate_limit_per_minute", 20)
    platform_auth._requests.clear()

    with pytest.raises(HTTPException) as error:
        platform_auth.require_agent_access(request, None)
    assert error.value.status_code == 401
    assert platform_auth.require_agent_access(request, "Bearer secret") == "contract-test"


def test_agent_rate_limit_is_per_source(monkeypatch):
    request = SimpleNamespace(client=SimpleNamespace(host="rate-test"))
    monkeypatch.setattr(settings, "agent_api_token", "")
    monkeypatch.setattr(settings, "agent_rate_limit_per_minute", 1)
    platform_auth._requests.clear()

    assert platform_auth.require_agent_access(request, None) == "rate-test"
    with pytest.raises(HTTPException) as error:
        platform_auth.require_agent_access(request, None)
    assert error.value.status_code == 429


def test_unmatched_routes_share_one_bounded_metrics_bucket():
    from fastapi.testclient import TestClient

    reset_for_tests()
    client = TestClient(app)
    assert client.get("/missing-one").status_code == 404
    assert client.get("/missing-two").status_code == 404

    routes = snapshot()["routes"]
    unmatched = [item for item in routes if item["path"] == "__unmatched__"]
    assert len(unmatched) == 1
    assert unmatched[0]["requests"] == 2
