from dataclasses import dataclass, field
from typing import Any

from openai import OpenAI

from app.core.config import settings


@dataclass(slots=True)
class ModelResponse:
    content: str
    tool_calls: list[Any] = field(default_factory=list)


class ModelAdapter:
    def __init__(self) -> None:
        self._client: OpenAI | None = None

    def _get_client(self) -> OpenAI:
        if not settings.llm_api_key:
            raise RuntimeError("LLM_API_KEY is not configured")
        if self._client is None:
            self._client = OpenAI(api_key=settings.llm_api_key, base_url=settings.llm_base_url)
        return self._client

    def chat(self, request: dict[str, Any]) -> ModelResponse:
        response = self._get_client().chat.completions.create(
            model=request.get("model") or settings.llm_model,
            messages=request["messages"],
            tools=request.get("tools") or None,
        )
        choice = response.choices[0].message
        return ModelResponse(content=choice.content or "", tool_calls=list(choice.tool_calls or []))


model_adapter = ModelAdapter()

