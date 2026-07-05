from collections.abc import Callable
from typing import Any

from app.core.config import settings
from app.services.agents.model_adapter import ModelAdapter, ModelResponse, model_adapter


def run_agent(
    role: str,
    task: str,
    tools: list[dict[str, Any]] | None = None,
    tool_handlers: dict[str, Callable[..., Any]] | None = None,
    adapter: ModelAdapter = model_adapter,
    max_turns: int = 8,
) -> str:
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": role},
        {"role": "user", "content": task},
    ]
    for _ in range(max_turns):
        response: ModelResponse = adapter.chat(
            {"model": settings.llm_model, "messages": messages, "tools": tools or []}
        )
        if not response.tool_calls:
            return response.content
        messages.append(
            {
                "role": "assistant",
                "content": response.content,
                "tool_calls": [call.model_dump() if hasattr(call, "model_dump") else call for call in response.tool_calls],
            }
        )
        for call in response.tool_calls:
            name = call.function.name
            if not tool_handlers or name not in tool_handlers:
                raise RuntimeError(f"no handler for tool: {name}")
            import json

            arguments = json.loads(call.function.arguments or "{}")
            result = tool_handlers[name](**arguments)
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                }
            )
    raise RuntimeError("agent exceeded maximum tool turns")

