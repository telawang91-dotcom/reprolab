import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from app.models.knowledge import Conversation, Run
from app.services.agents.conversations import delete_conversation, list_conversations, replay_conversation


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


class ConversationManagementSession:
    def __init__(self, conversations, aggregate_rows, scope_rows):
        self.conversations = {item.id: item for item in conversations}
        self.results = iter([aggregate_rows, scope_rows])
        self.deleted = None
        self.committed = False

    def execute(self, _statement):
        return next(self.results)

    def get(self, model, item_id):
        if model is Conversation:
            return self.conversations.get(item_id)
        return None

    def delete(self, item):
        self.deleted = item

    def commit(self):
        self.committed = True


def test_conversation_management_is_collection_scoped_and_deletable(monkeypatch):
    project_id, collection_a, collection_b = (uuid.uuid4() for _ in range(3))
    first = SimpleNamespace(id=uuid.uuid4(), project_id=project_id, title="A", created_at=datetime.now(timezone.utc))
    second = SimpleNamespace(id=uuid.uuid4(), project_id=project_id, title="B", created_at=datetime.now(timezone.utc))
    rows = [(first, 3, first.created_at), (second, 5, second.created_at)]
    scopes = [
        (first.id, {"collection_id": str(collection_a)}),
        (second.id, {"collection_id": str(collection_b)}),
    ]
    db = ConversationManagementSession([first, second], rows, scopes)
    listed = list_conversations(db, project_id, collection_a)
    assert [item.id for item in listed] == [first.id]

    closed = []
    monkeypatch.setattr(
        "app.services.sandbox.kernel.kernel_registry.close",
        lambda conversation_id: closed.append(conversation_id),
    )
    delete_conversation(db, project_id, first.id)
    assert db.deleted is first
    assert db.committed is True
    assert closed == [first.id]


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


def test_replay_restores_failed_turn_as_partial_report():
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
    assert not any(item.event == "error" for item in replay.events)
    answer = next(
        item for item in replay.events
        if item.event == "message" and not item.data.get("user")
    )
    assert answer.data["status"] == "partial"
    assert "本次分析未完成" in answer.data["text"]


def test_replay_preserves_workspace_document_sources():
    project_id, conversation_id, document_id = (uuid.uuid4() for _ in range(3))
    conversation = SimpleNamespace(id=conversation_id, project_id=project_id, title="Workspace")
    anchor = f"⟦src_{str(document_id)[:4]}⟧"
    source = {
        "anchor": anchor,
        "document_id": str(document_id),
        "chunk_id": None,
        "filename": "xps.csv",
    }
    messages = [
        SimpleNamespace(role="user", content="这里有什么数据？", extra_metadata={}),
        SimpleNamespace(
            role="assistant",
            content=f"包含 XPS 数据 {anchor}",
            extra_metadata={"mode": "workspace", "sources": [source]},
        ),
    ]
    replay = replay_conversation(
        FakeSession(conversation, None, [messages]),
        project_id,
        conversation_id,
    )
    answer = next(item for item in replay.events if item.event == "message" and not item.data.get("user"))
    assert answer.data["citations"] == [anchor]
    assert answer.data["sources"] == [source]
