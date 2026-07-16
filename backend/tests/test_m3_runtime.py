import asyncio
import uuid
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.services.agents.model_adapter import ModelAdapter, ModelResponse, ToolCall
from app.schemas.chat import ChatRequest, PlanStep, SSEEvent
from app.services.agents.orchestrator import (
    FINAL_ANSWER_SYSTEM_PROMPT,
    _artifact_evidence,
    _code,
    _generate_code,
    _json_object,
    _trusted_artifact_summary,
    _validate_generated_code,
    _run_workspace_answer,
    _workspace_needs_analysis,
)
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


def test_agent_context_event_supports_visible_tool_receipts():
    event = SSEEvent(event="context", data={"tools": [{
        "name": "memory.search", "status": "used", "count": 1,
    }]})
    assert event.event == "context" and event.data["tools"][0]["count"] == 1


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


def test_executor_prompt_uses_managed_dataset_loader():
    adapter = ScriptedAdapter([ModelResponse(content="df = load_dataset(0)")])
    request = ChatRequest(
        project_id="00000000-0000-0000-0000-000000000001",
        message="summarize",
        dataset_ids=[],
    )
    code = _generate_code(
        [],
        request,
        '[{"index": 0, "name": "sample"}]',
        PlanStep(title="inspect", rationale="understand data"),
        "none",
        "none",
        adapter,
    )
    assert code == "df = load_dataset(0)"
    prompt = adapter.requests[0]["messages"]
    assert "load_dataset(index)" in prompt[1]["content"]
    assert "不得定义、赋值或删除" in prompt[1]["content"]


def test_error_is_a_valid_sse_event():
    event = SSEEvent(
        event="error",
        data={"code": "analysis_execution_failed", "retryable": True},
    )
    assert event.event == "error"


def test_final_answer_prompt_hides_internal_agent_process():
    assert "直接回答用户当前提出的问题" in FINAL_ANSWER_SYSTEM_PROMPT
    assert "不得提及智能体" in FINAL_ANSWER_SYSTEM_PROMPT
    assert "执行步骤" in FINAL_ANSWER_SYSTEM_PROMPT


def test_artifact_evidence_includes_value_and_limits_prompt_size():
    evidence = _artifact_evidence(
        {
            "anchor": "⟦art_abcd⟧",
            "kind": "text",
            "title": "数据内容概述",
            "value_json": {"text": "企鹅观测数据" * 20},
        },
        limit=30,
    )
    assert evidence["title"] == "数据内容概述"
    assert "企鹅观测数据" in evidence["value_json"]
    assert evidence["value_json"].endswith("…")


def test_executor_code_policy_protects_injected_paths_and_artifact_protocol():
    _validate_generated_code(
        "df=load_dataset(0)\nemit_artifact('number', float(df.shape[0]), 'rows')",
        datasets_selected=True,
    )
    with pytest.raises(ValueError, match="cannot be reassigned"):
        _validate_generated_code("DATASET_PATHS=['local.csv']\nprint(DATASET_PATHS[0])", True)
    with pytest.raises(ValueError, match="kind must be"):
        _validate_generated_code("x=DATASET_PATHS[0]\nemit_artifact('scalar', 1)", True)
    with pytest.raises(ValueError, match="must be read"):
        _validate_generated_code("print('no data')", True)
    with pytest.raises(ValueError, match="trusted artifact"):
        _validate_generated_code("x=load_dataset(0)\nprint(x)", True)


def test_critic_fallback_uses_only_real_artifacts_and_exact_anchors():
    text = _trusted_artifact_summary([
        {"kind": "number", "title": "平均值", "value_json": 3.5, "anchor": "⟦art_ab12⟧"},
        {"kind": "figure", "title": "分组图", "value_json": {"x": [1]}, "anchor": "⟦art_cd34⟧"},
    ])
    assert "3.5 ⟦art_ab12⟧" in text
    assert "分组图” ⟦art_cd34⟧" in text
    assert "{'x'" not in text


def test_critic_fallback_unwraps_ledger_scalars_and_removes_exact_duplicates():
    text = _trusted_artifact_summary([
        {"kind": "number", "title": "样本量", "value_json": {"value": 4, "mime_type": "application/json"}, "anchor": "⟦art_a111⟧"},
        {"kind": "number", "title": "样本量", "value_json": {"value": 4, "mime_type": "application/json"}, "anchor": "⟦art_b222⟧"},
        {"kind": "conclusion", "title": "模型草稿", "value_json": {"text": "可能错误的 3"}, "anchor": "⟦art_c333⟧"},
    ])
    assert text.count("样本量：4") == 1
    assert "可能错误" not in text


def test_workspace_mode_routes_analysis_requests_but_keeps_file_questions_lightweight():
    datasets = [SimpleNamespace(id=uuid.uuid4())]
    assert _workspace_needs_analysis("检查缺失值并告诉我怎么处理", datasets)
    assert not _workspace_needs_analysis("这个文件夹里有哪些文件？", datasets)
    assert not _workspace_needs_analysis("检查缺失值", [])


def test_workspace_answer_uses_manifest_without_rag_hits(monkeypatch):
    document_id = uuid.uuid4()
    conversation_id = uuid.uuid4()
    request = ChatRequest(
        project_id=uuid.uuid4(),
        collection_id=uuid.uuid4(),
        mode="workspace",
        message="这里有什么数据？",
    )
    document = SimpleNamespace(
        id=document_id,
        filename="xps.csv",
        type="other",
        storage_hash="hash",
        extra_metadata={"parse_status": "structured", "parser": "csv"},
    )
    dataset = SimpleNamespace(
        id=uuid.uuid4(),
        name="xps.csv",
        storage_hash="hash",
        schema_json={"row_count": 1501, "column_count": 10},
    )

    class FakeDb:
        def __init__(self): self.added = []
        def add(self, value): self.added.append(value)
        def commit(self): return None

    anchor = f"⟦src_{str(document_id)[:4]}⟧"
    adapter = ScriptedAdapter([ModelResponse(content=f"包含 1501 行 XPS 数据 {anchor}")])
    monkeypatch.setattr("app.services.agents.orchestrator.recall_memories", lambda *_: [])
    monkeypatch.setattr("app.services.agents.orchestrator.complex_retrieve", lambda *_args, **_kwargs: [])
    db = FakeDb()

    async def collect():
        return [item async for item in _run_workspace_answer(
            db,
            request,
            SimpleNamespace(id=conversation_id),
            [],
            [document],
            [dataset],
            adapter,
        )]

    events = asyncio.run(collect())
    assert [item.event for item in events] == ["context", "thinking", "message", "done"]
    assert events[2].data["sources"][0]["document_id"] == str(document_id)
    assert "没有文本命中" in events[0].data["tools"][1]["detail"]
