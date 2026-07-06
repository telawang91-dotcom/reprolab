from app.core.config import settings
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
