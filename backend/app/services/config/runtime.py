import os
import shutil
import subprocess
import time
from pathlib import Path

from app.core.config import RUNTIME_ENV_PATH, settings
from app.core.db import SessionLocal
from app.schemas.settings import ModelConfigRead, ModelConfigUpdate, ModelTestResult, RuntimeComponent, RuntimeStatusRead
from app.services.agents.model_adapter import ModelAdapterError, model_adapter
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError


ENV_PATH = RUNTIME_ENV_PATH


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
    ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
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
    temporary.chmod(0o600)
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


def database_online() -> bool:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return True
    except SQLAlchemyError:
        return False


def docker_daemon_available() -> bool:
    executable = shutil.which("docker")
    if executable is None:
        return False
    try:
        probe = subprocess.run(
            [executable, "version", "--format", "{{.Server.Version}}"],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return probe.returncode == 0 and bool(probe.stdout.strip())


def get_runtime_status() -> RuntimeStatusRead:
    """Return actionable local readiness without testing remote model credentials."""
    database_ready = database_online()
    model_ready = get_model_config().api_key_configured
    sandbox_ready = settings.sandbox_backend != "docker" or docker_daemon_available()
    isolated_sandbox = settings.sandbox_backend == "docker"
    components = [
        RuntimeComponent(
            key="database",
            title="数据与向量库",
            state="ready" if database_ready else "offline",
            message="PostgreSQL 与 pgvector 可以使用。" if database_ready else "无法连接本地 PostgreSQL；资料、血缘与结论暂不能读取或保存。",
            action=None if database_ready else "启动 PostgreSQL 后重试",
        ),
        RuntimeComponent(
            key="model",
            title="分析模型",
            state="ready" if model_ready else "action_required",
            message="模型密钥已配置，可用于分析和校验。" if model_ready else "尚未配置模型密钥；仍可管理资料，但不能生成分析或运行语义校验。",
            action=None if model_ready else "前往设置配置模型",
        ),
        RuntimeComponent(
            key="sandbox",
            title="可信运行环境",
            state="ready" if sandbox_ready else "action_required",
            message=("Docker 沙箱可用，分析会固定环境和随机种子。" if isolated_sandbox else "当前使用应用内持久 Jupyter 环境，适合本机与受信任部署；不应开放给不受信任的任意代码。") if sandbox_ready else "Docker 沙箱暂不可连接，无法以隔离环境执行可复现分析。",
            action=None if sandbox_ready else "启动 Docker Desktop 后重试",
        ),
    ]
    ready = all(item.state == "ready" for item in components)
    if ready and isolated_sandbox:
        summary = "工作台已具备完整可信分析条件。"
    elif ready:
        summary = "工作台核心能力可用；当前执行环境仅面向本机与受信任使用者。"
    else:
        summary = "部分能力暂不可用；请按下方提示完成配置。"
    return RuntimeStatusRead(
        state="ready" if ready else "degraded",
        summary=summary,
        components=components,
    )
