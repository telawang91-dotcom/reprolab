from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.main import app
from app.services.agents import platform_auth


def test_conversation_and_agent_routes_are_published():
    paths = app.openapi()["paths"]
    assert "get" in paths["/api/v1/conversations"]
    assert "get" in paths["/api/v1/conversations/{conversation_id}"]
    assert "post" in paths["/api/v1/agent/invoke"]


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
