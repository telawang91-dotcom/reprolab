import json
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from openai import OpenAI

from app.core.config import settings


class ModelAdapterError(RuntimeError):
    def __init__(self, provider: str, message: str):
        self.provider = provider
        super().__init__(f"{provider} model request failed: {message}")


@dataclass(frozen=True, slots=True)
class ToolCall:
    id: str
    name: str
    args: dict[str, Any]


@dataclass(slots=True)
class ModelResponse:
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage: dict[str, int] = field(default_factory=dict)
    provider: str | None = None
    model: str | None = None


class ModelAdapter:
    def __init__(
        self,
        client_factory: Callable[..., Any] = OpenAI,
        sleep_fn: Callable[[float], None] = time.sleep,
    ) -> None:
        self._client_factory = client_factory
        self._sleep = sleep_fn
        self._clients: dict[tuple[str, str], Any] = {}

    def _route(self, route: str | None) -> tuple[str, str, str, str]:
        value = route or settings.executor_model
        if ":" in value:
            provider, model = value.split(":", 1)
        else:
            provider, model = "deepseek", value
        if provider == "deepseek":
            return provider, model, settings.deepseek_base_url or settings.llm_base_url, settings.deepseek_api_key or settings.llm_api_key
        if provider == "hunyuan":
            return provider, model, settings.hunyuan_base_url, settings.hunyuan_api_key
        if provider == "custom":
            return provider, model, settings.llm_base_url, settings.llm_api_key
        if provider == "claude":
            if not settings.claude_api_key:
                raise ModelAdapterError(provider, "CLAUDE_API_KEY is not configured")
            raise NotImplementedError("Claude tool_use adapter is reserved but not enabled in this demo")
        raise ModelAdapterError(provider, f"unsupported provider: {provider}")

    def _client(self, provider: str, base_url: str, api_key: str):
        if not api_key:
            raise ModelAdapterError(provider, f"{provider.upper()} API key is not configured")
        key = (provider, base_url)
        if key not in self._clients:
            self._clients[key] = self._client_factory(api_key=api_key, base_url=base_url)
        return self._clients[key]

    def clear_clients(self) -> None:
        self._clients.clear()

    def chat(self, request: dict[str, Any]) -> ModelResponse:
        provider, model, base_url, api_key = self._route(request.get("model"))
        client = self._client(provider, base_url, api_key)
        last_error: Exception | None = None
        for attempt in range(settings.model_max_retries + 1):
            try:
                options: dict[str, Any] = {
                    "temperature": request.get("temperature", settings.llm_temperature),
                    "max_tokens": request.get("max_tokens", settings.llm_max_tokens),
                }
                if "siliconflow.cn" in base_url:
                    options["extra_body"] = {
                        "enable_thinking": request.get(
                            "enable_thinking", settings.siliconflow_enable_thinking
                        )
                    }
                elif "api.deepseek.com" in base_url and model.startswith("deepseek-v4-"):
                    thinking = request.get(
                        "thinking", "disabled"
                    )
                    options["extra_body"] = {"thinking": {"type": thinking}}
                response = client.chat.completions.create(
                    model=model,
                    messages=request["messages"],
                    tools=request.get("tools") or None,
                    **options,
                )
                message = response.choices[0].message
                calls: list[ToolCall] = []
                for raw in list(message.tool_calls or []):
                    try:
                        arguments = json.loads(raw.function.arguments or "{}")
                    except json.JSONDecodeError as exc:
                        raise ModelAdapterError(provider, f"invalid tool arguments for {raw.function.name}") from exc
                    if not isinstance(arguments, dict):
                        raise ModelAdapterError(provider, "tool arguments must be a JSON object")
                    calls.append(ToolCall(id=str(raw.id), name=str(raw.function.name), args=arguments))
                usage = getattr(response, "usage", None)
                usage_data = {
                    "prompt_tokens": int(getattr(usage, "prompt_tokens", 0) or 0),
                    "completion_tokens": int(getattr(usage, "completion_tokens", 0) or 0),
                    "total_tokens": int(getattr(usage, "total_tokens", 0) or 0),
                }
                return ModelResponse(
                    content=message.content or "",
                    tool_calls=calls,
                    usage=usage_data,
                    provider=provider,
                    model=model,
                )
            except ModelAdapterError:
                raise
            except Exception as exc:
                last_error = exc
                if attempt >= settings.model_max_retries:
                    break
                self._sleep(0.25 * (2 ** attempt))
        raise ModelAdapterError(provider, str(last_error or "unknown model error"))


model_adapter = ModelAdapter()
