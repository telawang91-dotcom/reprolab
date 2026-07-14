import uuid
from types import SimpleNamespace

from app.models.knowledge import Conversation, Run
from app.services.agents.conversations import replay_conversation


class FakeSession:
    def __init__(self, conversation, run, scalar_results):
        self.conversation = conversation
        self.run = run
        self.scalar_results = iter(scalar_results)

    def get(self, model, item_id):
        if model is Conversation:
            return self.conversation if item_id == self.conversation.id else None
        if model is Run:
            return self.run if self.run and item_id == self.run.id else None
        return None

    def scalars(self, _statement):
        return next(self.scalar_results)


def test_replay_restores_questions_conclusions_and_artifact_titles():
    project_id, conversation_id, run_id, artifact_id = (uuid.uuid4() for _ in range(4))
    conversation = SimpleNamespace(id=conversation_id, project_id=project_id, title="Penguins")
    run = SimpleNamespace(
        id=run_id,
        project_id=project_id,
        code="df = load_dataset(0)",
        lang="python",
        status="success",
        stdout="",
    )
    anchor = f"⟦art_{str(artifact_id)[:4]}⟧"
    messages = [
        SimpleNamespace(role="user", content="数据是什么？", extra_metadata={}),
        SimpleNamespace(role="tool", content="", extra_metadata={"run_id": str(run_id)}),
        SimpleNamespace(
            role="assistant",
            content=f"这是企鹅观测数据 {anchor}",
            extra_metadata={
                "plan": [{"title": "读取", "rationale": "检查字段"}],
                "artifact_ids": [str(artifact_id)],
            },
        ),
    ]
    artifact = SimpleNamespace(
        id=artifact_id,
        kind="text",
        title="数据内容概述",
        value_json={"text": "企鹅观测数据"},
        content_hash=None,
    )
    replay = replay_conversation(
        FakeSession(conversation, run, [messages, [artifact]]),
        project_id,
        conversation_id,
    )
    artifact_event = next(item for item in replay.events if item.event == "artifact")
    assert artifact_event.data["title"] == "数据内容概述"
    assert replay.events[0].data["user"] is True
    assert any(item.event == "message" and not item.data.get("user") for item in replay.events)


def test_replay_restores_failed_turn_as_error_event():
    project_id, conversation_id, run_id = (uuid.uuid4() for _ in range(3))
    conversation = SimpleNamespace(id=conversation_id, project_id=project_id, title="Failed")
    run = SimpleNamespace(
        id=run_id,
        project_id=project_id,
        code="bad()",
        lang="python",
        status="error",
        stdout="boom",
    )
    messages = [
        SimpleNamespace(role="user", content="分析", extra_metadata={}),
        SimpleNamespace(role="tool", content="boom", extra_metadata={"run_id": str(run_id)}),
        SimpleNamespace(
            role="assistant",
            content="分析失败，可以重试。",
            extra_metadata={
                "error_code": "analysis_execution_failed",
                "failed_step": "读取数据",
            },
        ),
    ]
    replay = replay_conversation(
        FakeSession(conversation, run, [messages, []]),
        project_id,
        conversation_id,
    )
    errors = [item for item in replay.events if item.event == "error"]
    assert len(errors) == 1
    assert errors[0].data["code"] == "analysis_execution_failed"
    assert not any(
        item.event == "message" and not item.data.get("user")
        for item in replay.events
    )
