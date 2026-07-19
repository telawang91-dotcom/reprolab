import uuid
import pytest

from app.models.knowledge import Artifact
from app.services.agents.model_adapter import ModelResponse
from app.services.agents.writing import generate_writing_draft


class FakeSession:
    def __init__(self, artifacts):
        self.artifacts = artifacts

    def scalars(self, _statement):
        return self.artifacts


class FakeAdapter:
    def __init__(self, content: str):
        self.content = content

    def chat(self, _request):
        return ModelResponse(content=self.content)


class SequenceAdapter:
    def __init__(self, contents):
        self.contents = iter(contents)
        self.calls = 0

    def chat(self, _request):
        self.calls += 1
        return ModelResponse(content=next(self.contents))


def test_writing_draft_keeps_clickable_saved_artifact_anchor():
    artifact = Artifact(
        id=uuid.UUID("c64a5512-7f61-4b28-b3a6-eff553fbf726"),
        project_id=uuid.uuid4(),
        kind="figure",
        title="季度趋势图",
        value_json={"figure_data": [[1, 2]]},
    )
    text, anchors = generate_writing_draft(
        FakeSession([artifact]),
        artifact.project_id,
        FakeAdapter("# 报告\n\n季度趋势见 ⟦art_c64a⟧。"),
    )

    assert "⟦art_c64a⟧" in text
    assert anchors == ["art_c64a"]


def test_writing_draft_requires_a_saved_artifact():
    with pytest.raises(ValueError, match="保存至少一项"):
        generate_writing_draft(FakeSession([]), uuid.uuid4(), FakeAdapter(""))


def test_writing_draft_repairs_unsupported_numbers_and_places_anchor_before_period():
    artifact = Artifact(
        id=uuid.UUID("1d133d46-20a3-405b-876a-61efb9115dcf"),
        project_id=uuid.uuid4(),
        kind="table",
        title="统计表",
        value_json={"data": {"data": [[85.02]]}},
    )
    adapter = SequenceAdapter([
        "## 发现\n均值低于 90。⟦art_1d13⟧",
        "## 发现\n均值为 85.02 ⟦art_1d13⟧。",
    ])

    text, anchors = generate_writing_draft(FakeSession([artifact]), artifact.project_id, adapter)

    assert "85.02 ⟦art_1d13⟧。" in text
    assert "90" not in text
    assert anchors == ["art_1d13"]
    assert adapter.calls == 2
