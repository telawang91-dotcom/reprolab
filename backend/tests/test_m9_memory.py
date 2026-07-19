import uuid
from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from app.models.knowledge import Memory
from app.schemas.memory import MemoryCreate, MemoryOut
from app.services.memory.recall import _lexical_similarity, memory_context, recall_memories, verify_before_use
from app.services.memory.reflect import _json_array


def test_memory_contract_and_json_candidate_parser():
    request = MemoryCreate(
        project_id=uuid.uuid4(), layer="semantic", content="优先使用配对 t 检验", tags=["统计"]
    )
    assert request.importance == 0.5
    assert _json_array('```json\n[{"layer":"semantic","content":"x"}]\n```')[0]["content"] == "x"
    with pytest.raises(ValidationError):
        MemoryCreate(project_id=uuid.uuid4(), layer="invalid", content="x")


def test_verify_before_use_filters_stale_or_low_importance():
    now = datetime.now(timezone.utc)
    fresh = Memory(layer="semantic", content="fresh", tags=[], importance=0.5, written_at=now)
    stale = Memory(layer="semantic", content="stale", tags=[], importance=0.9, written_at=now - timedelta(days=181))
    weak = Memory(layer="semantic", content="weak", tags=[], importance=0.1, written_at=now)
    assert verify_before_use(fresh, now)
    assert not verify_before_use(stale, now)
    assert not verify_before_use(weak, now)
    assert memory_context([fresh]) == "- fresh"


def test_memory_output_explains_recall_eligibility_and_source():
    output = MemoryOut(
        id=uuid.uuid4(),
        layer="semantic",
        content="优先报告效应量",
        tags=["manual"],
        importance=0.8,
        written_at=datetime.now(timezone.utc),
    )
    dumped = output.model_dump()
    assert dumped["recallable"] is True
    assert dumped["source"] == "manual"


def test_memory_recall_falls_back_to_lexical_when_embedding_is_unavailable(monkeypatch):
    now = datetime.now(timezone.utc)
    project_id = uuid.uuid4()
    relevant = Memory(
        id=uuid.uuid4(), project_id=project_id, layer="semantic",
        content="分析结果需要报告效应量和置信区间", tags=[], importance=0.8,
        written_at=now,
    )
    unrelated = Memory(
        id=uuid.uuid4(), project_id=project_id, layer="semantic",
        content="图表默认使用蓝色", tags=[], importance=0.8,
        written_at=now,
    )

    class FakeSession:
        def scalar(self, _statement):
            return 2

        def scalars(self, _statement):
            return [unrelated, relevant]

    monkeypatch.setattr(
        "app.services.memory.recall.embed_memory",
        lambda _query: (_ for _ in ()).throw(ModuleNotFoundError("sentence_transformers")),
    )
    recalled = recall_memories(FakeSession(), project_id, "请报告效应量")  # type: ignore[arg-type]
    assert recalled == [relevant]
    assert _lexical_similarity("效应量", relevant.content) > 0
