from dataclasses import dataclass

from app.services.agents.model_adapter import ModelResponse
from app.services.agents.orchestrator import _code, _json_object
from app.services.agents.runtime import run_agent


class ScriptedAdapter:
    def __init__(self, responses):
        self.responses = iter(responses)

    def chat(self, request):
        return next(self.responses)


def test_run_agent_returns_model_content_through_adapter():
    adapter = ScriptedAdapter([ModelResponse(content="done")])
    assert run_agent("role", "task", adapter=adapter) == "done"


def test_planner_json_and_python_fence_parsing():
    assert _json_object('```json\n{"steps": [{"title": "A", "rationale": "B"}]}\n```')["steps"][0]["title"] == "A"
    assert _code("```python\nprint(42)\n```") == "print(42)"
