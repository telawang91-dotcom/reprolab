from app.core.config import settings
from app.schemas.settings import ModelConfigRead
from app.services.config import runtime


def test_runtime_status_explains_each_blocking_dependency(monkeypatch):
    monkeypatch.setattr(runtime, "database_online", lambda: False)
    monkeypatch.setattr(runtime, "get_model_config", lambda: ModelConfigRead(
        provider="deepseek", base_url="https://api.deepseek.com/v1",
        analysis_model="deepseek-chat", review_model="deepseek-reasoner",
        api_key_configured=False,
    ))
    monkeypatch.setattr(runtime, "docker_daemon_available", lambda: False)
    monkeypatch.setattr(settings, "sandbox_backend", "docker")

    result = runtime.get_runtime_status()

    assert result.state == "degraded"
    assert {item.key for item in result.components} == {"database", "model", "sandbox"}
    assert all(item.state != "ready" and item.action for item in result.components)


def test_runtime_status_reports_ready_when_local_dependencies_are_configured(monkeypatch):
    monkeypatch.setattr(runtime, "database_online", lambda: True)
    monkeypatch.setattr(runtime, "get_model_config", lambda: ModelConfigRead(
        provider="deepseek", base_url="https://api.deepseek.com/v1",
        analysis_model="deepseek-chat", review_model="deepseek-reasoner",
        api_key_configured=True,
    ))
    monkeypatch.setattr(runtime, "docker_daemon_available", lambda: True)
    monkeypatch.setattr(settings, "sandbox_backend", "docker")

    result = runtime.get_runtime_status()

    assert result.state == "ready"
    assert all(item.state == "ready" for item in result.components)
