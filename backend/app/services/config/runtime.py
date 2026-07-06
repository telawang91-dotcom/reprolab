import os
import time
from pathlib import Path

from app.core.config import BACKEND_DIR, settings
from app.schemas.settings import ModelConfigRead, ModelConfigUpdate, ModelTestResult
from app.services.agents.model_adapter import ModelAdapterError, model_adapter


ENV_PATH = BACKEND_DIR.parent / ".env"


def _provider_from_route(route: str) -> str:
    provider = route.split(":", 1)[0] if ":" in route else "deepseek"
    return provider if provider in {"deepseek", "hunyuan", "custom"} else "custom"


def _model_from_route(route: str) -> str:
    return route.split(":", 1)[1] if ":" in route else route


def _provider_values(provider: str) -> tuple[str, str]:
    if provider == "deepseek":
        return settings.deepseek_base_url or settings.llm_base_url, settings.deepseek_api_key or settings.llm_api_key
    if provider == "hunyuan":
        return settings.hunyuan_base_url, settings.hunyuan_api_key
    return settings.llm_base_url, settings.llm_api_key


def _key_hint(key: str) -> str | None:
    if not key:
        return None
    return f"••••{key[-4:]}"


def get_model_config() -> ModelConfigRead:
    provider = _provider_from_route(settings.executor_model)
    base_url, api_key = _provider_values(provider)
    return ModelConfigRead(
        provider=provider,
        base_url=base_url,
        analysis_model=_model_from_route(settings.executor_model),
        review_model=_model_from_route(settings.critic_model),
        api_key_configured=bool(api_key),
        api_key_hint=_key_hint(api_key),
    )


def _write_env(values: dict[str, str]) -> None:
    lines = ENV_PATH.read_text(encoding="utf-8").splitlines() if ENV_PATH.exists() else []
    pending = dict(values)
    output: list[str] = []
    for line in lines:
        if not line or line.lstrip().startswith("#") or "=" not in line:
            output.append(line)
            continue
        name = line.split("=", 1)[0].strip()
        if name in pending:
            output.append(f"{name}={pending.pop(name)}")
        else:
            output.append(line)
    if pending and output and output[-1] != "":
        output.append("")
    output.extend(f"{name}={value}" for name, value in pending.items())
    temporary = ENV_PATH.with_suffix(".env.tmp")
    temporary.write_text("\n".join(output).rstrip() + "\n", encoding="utf-8")
    os.replace(temporary, ENV_PATH)


def save_model_config(request: ModelConfigUpdate) -> ModelConfigRead:
    route = f"{request.provider}:{request.analysis_model}"
    review_route = f"{request.provider}:{request.review_model}"
    env_values = {
        "PLANNER_MODEL": route,
        "EXECUTOR_MODEL": route,
        "CRITIC_MODEL": review_route,
    }
    if request.provider == "deepseek":
        settings.deepseek_base_url = request.base_url
        env_values["DEEPSEEK_BASE_URL"] = request.base_url
        if request.api_key:
            settings.deepseek_api_key = request.api_key
            env_values["DEEPSEEK_API_KEY"] = request.api_key
    elif request.provider == "hunyuan":
        settings.hunyuan_base_url = request.base_url
        env_values["HUNYUAN_BASE_URL"] = request.base_url
        if request.api_key:
            settings.hunyuan_api_key = request.api_key
            env_values["HUNYUAN_API_KEY"] = request.api_key
    else:
        settings.llm_base_url = request.base_url
        env_values["LLM_BASE_URL"] = request.base_url
        if request.api_key:
            settings.llm_api_key = request.api_key
            env_values["LLM_API_KEY"] = request.api_key
    settings.planner_model = route
    settings.executor_model = route
    settings.critic_model = review_route
    _write_env(env_values)
    model_adapter.clear_clients()
    return get_model_config()


def test_model_connection() -> ModelTestResult:
    started = time.perf_counter()
    config = get_model_config()
    try:
        response = model_adapter.chat({
            "model": settings.executor_model,
            "messages": [{"role": "user", "content": "只回复 OK"}],
            "temperature": 0,
            "max_tokens": 8,
        })
        ok = bool(response.content.strip())
        message = "连接成功，模型可以正常响应。" if ok else "模型已连接，但没有返回内容。"
    except (ModelAdapterError, NotImplementedError) as exc:
        ok = False
        message = str(exc)
    return ModelTestResult(
        ok=ok,
        message=message,
        model=config.analysis_model,
        latency_ms=round((time.perf_counter() - started) * 1000),
    )
