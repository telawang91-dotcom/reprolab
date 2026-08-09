from app.core.config import Settings, _with_runtime_model_overrides, settings
from app.schemas.settings import ModelConfigUpdate
from app.services.config import runtime


def test_model_config_is_persisted_without_exposing_key(tmp_path, monkeypatch):
    env_path = tmp_path / ".env"
    env_path.write_text("APP_NAME=ReproLab\nDEEPSEEK_API_KEY=old-key\n", encoding="utf-8")
    monkeypatch.setattr(runtime, "ENV_PATH", env_path)

    previous = (
        settings.deepseek_base_url,
        settings.deepseek_api_key,
        settings.planner_model,
        settings.executor_model,
        settings.critic_model,
    )
    try:
        result = runtime.save_model_config(ModelConfigUpdate(
            provider="deepseek",
            base_url="https://api.deepseek.com/v1/",
            analysis_model="deepseek-chat",
            review_model="deepseek-reasoner",
            api_key="new-secret-key",
        ))
        stored = env_path.read_text(encoding="utf-8")

        assert result.provider == "deepseek"
        assert result.api_key_configured is True
        assert result.api_key_hint == "••••-key"
        assert not hasattr(result, "api_key")
        assert "DEEPSEEK_API_KEY=new-secret-key" in stored
        assert "EXECUTOR_MODEL=deepseek:deepseek-chat" in stored
        assert stored.count("DEEPSEEK_API_KEY=") == 1
    finally:
        (
            settings.deepseek_base_url,
            settings.deepseek_api_key,
            settings.planner_model,
            settings.executor_model,
            settings.critic_model,
        ) = previous


def test_blank_key_keeps_existing_secret(tmp_path, monkeypatch):
    env_path = tmp_path / ".env"
    env_path.write_text("DEEPSEEK_API_KEY=keep-me\n", encoding="utf-8")
    monkeypatch.setattr(runtime, "ENV_PATH", env_path)
    monkeypatch.setattr(settings, "deepseek_api_key", "keep-me")
    monkeypatch.setattr(settings, "planner_model", "deepseek:old")
    monkeypatch.setattr(settings, "executor_model", "deepseek:old")
    monkeypatch.setattr(settings, "critic_model", "deepseek:old")

    runtime.save_model_config(ModelConfigUpdate(
        provider="deepseek",
        base_url="https://api.deepseek.com/v1",
        analysis_model="deepseek-chat",
        review_model="deepseek-chat",
    ))

    assert "DEEPSEEK_API_KEY=keep-me" in env_path.read_text(encoding="utf-8")


def test_runtime_model_file_overrides_container_environment(tmp_path):
    runtime_env = tmp_path / "runtime.env"
    runtime_env.write_text(
        "DEEPSEEK_API_KEY=persisted-key\n"
        "EXECUTOR_MODEL=deepseek:persisted-model\n"
        "DATABASE_URL=postgresql://must-not-override\n",
        encoding="utf-8",
    )
    base = Settings.model_validate({
        "deepseek_api_key": "compose-key",
        "executor_model": "deepseek:compose-model",
    })
    merged = _with_runtime_model_overrides(base, runtime_env)

    assert merged.deepseek_api_key == "persisted-key"
    assert merged.executor_model == "deepseek:persisted-model"
    assert merged.database_url == base.database_url


def test_host_runtime_status_is_available_but_describes_security_boundary(monkeypatch):
    monkeypatch.setattr(runtime, "database_online", lambda: True)
    monkeypatch.setattr(settings, "sandbox_backend", "host")
    monkeypatch.setattr(settings, "deepseek_api_key", "configured")
    monkeypatch.setattr(settings, "executor_model", "deepseek:model")

    status = runtime.get_runtime_status()
    sandbox = next(item for item in status.components if item.key == "sandbox")

    assert status.state == "ready"
    assert "本机与受信任使用者" in status.summary
    assert "不应开放给不受信任的任意代码" in sandbox.message
