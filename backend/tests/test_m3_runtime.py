from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.services.agents.model_adapter import ModelAdapter, ModelResponse, ToolCall
from app.services.agents.orchestrator import _code, _json_object
from app.services.agents.runtime import run_agent


class ScriptedAdapter:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.requests = []

    def chat(self, request):
        self.requests.append(request)
        return next(self.responses)


def test_run_agent_returns_model_content_through_adapter():
    adapter = ScriptedAdapter([ModelResponse(content="done")])
    assert run_agent("role", "task", adapter=adapter) == "done"


def test_run_agent_executes_normalized_tools_and_routes_roles():
    adapter = ScriptedAdapter([
        ModelResponse(tool_calls=[ToolCall(id="call-1", name="add", args={"left": 2, "right": 3})]),
        ModelResponse(content="5"),
    ])
    assert run_agent(
        "role", "task",
        tools=[{"type": "function", "function": {"name": "add", "parameters": {}}}],
        tool_handlers={"add": lambda left, right: left + right},
        adapter=adapter,
        route="critic",
    ) == "5"
    assert adapter.requests[0]["model"] == settings.critic_model
    assert adapter.requests[1]["messages"][-1]["role"] == "tool"

    class EndlessAdapter:
        def chat(self, request):
            return ModelResponse(tool_calls=[ToolCall(id="loop", name="again", args={})])

    with pytest.raises(RuntimeError, match="maximum tool turns"):
        run_agent("role", "task", tools=[{}], tool_handlers={"again": lambda: "again"}, adapter=EndlessAdapter(), max_turns=2)


def test_model_adapter_normalizes_openai_compatible_providers():
    factories = []

    class FakeCompletions:
        def create(self, **kwargs):
            message = SimpleNamespace(
                content=None,
                tool_calls=[SimpleNamespace(
                    id="c1", function=SimpleNamespace(name="lookup", arguments='{"query":"x"}')
                )],
            )
            return SimpleNamespace(
                choices=[SimpleNamespace(message=message)],
                usage=SimpleNamespace(prompt_tokens=3, completion_tokens=2, total_tokens=5),
            )

    def factory(**kwargs):
        factories.append(kwargs)
        return SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))

    old_deepseek, old_hunyuan = settings.deepseek_api_key, settings.hunyuan_api_key
    try:
        settings.deepseek_api_key = "deepseek-key"
        settings.hunyuan_api_key = "hunyuan-key"
        adapter = ModelAdapter(client_factory=factory, sleep_fn=lambda _: None)
        request = {"messages": [{"role": "user", "content": "x"}], "tools": [{"type": "function"}]}
        deepseek = adapter.chat({**request, "model": "deepseek:deepseek-chat"})
        hunyuan = adapter.chat({**request, "model": "hunyuan:hunyuan-standard"})
        assert deepseek.tool_calls == hunyuan.tool_calls == [ToolCall("c1", "lookup", {"query": "x"})]
        assert deepseek.usage["total_tokens"] == 5
        assert [item["api_key"] for item in factories] == ["deepseek-key", "hunyuan-key"]
    finally:
        settings.deepseek_api_key, settings.hunyuan_api_key = old_deepseek, old_hunyuan


def test_model_adapter_retries_transient_provider_failure():
    attempts = 0
    sleeps = []

    class FlakyCompletions:
        def create(self, **kwargs):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise TimeoutError("temporary timeout")
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content="recovered", tool_calls=[]))],
                usage=None,
            )

    old_key = settings.deepseek_api_key
    try:
        settings.deepseek_api_key = "key"
        adapter = ModelAdapter(
            client_factory=lambda **_: SimpleNamespace(chat=SimpleNamespace(completions=FlakyCompletions())),
            sleep_fn=sleeps.append,
        )
        result = adapter.chat({"model": "deepseek:test", "messages": []})
        assert result.content == "recovered" and attempts == 2
        assert sleeps == [0.25]
    finally:
        settings.deepseek_api_key = old_key


def test_planner_json_and_python_fence_parsing():
    assert _json_object('```json\n{"steps": [{"title": "A", "rationale": "B"}]}\n```')["steps"][0]["title"] == "A"
    assert _code("```python\nprint(42)\n```") == "print(42)"
