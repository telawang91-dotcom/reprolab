import json
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
    max_turns: int | None = None,
    route: str = "executor",
) -> str:
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": role},
        {"role": "user", "content": task},
    ]
    limit = max_turns or settings.agent_max_steps
    for _ in range(limit):
        response: ModelResponse = adapter.chat({
            "model": settings.agent_model_route.get(route, settings.executor_model),
            "messages": messages,
            "tools": tools or [],
        })
        if not response.tool_calls:
            return response.content
        messages.append({
            "role": "assistant",
            "content": response.content,
            "tool_calls": [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {"name": call.name, "arguments": json.dumps(call.args, ensure_ascii=False)},
                }
                for call in response.tool_calls
            ],
        })
        for call in response.tool_calls:
            if not tool_handlers or call.name not in tool_handlers:
                raise RuntimeError(f"no handler for tool: {call.name}")
            result = tool_handlers[call.name](**call.args)
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": json.dumps(result, ensure_ascii=False, default=str),
            })
    raise RuntimeError(f"agent exceeded maximum tool turns ({limit})")
