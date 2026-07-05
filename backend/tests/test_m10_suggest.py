import uuid

import pytest
from pydantic import ValidationError

from app.schemas.suggest import Evidence, SuggestionCandidate
from app.services.suggest.generator import _json_array, build_prompt


def test_suggestion_contract_and_prompt_are_evidence_strict():
    identifier = uuid.uuid4()
    evidence = Evidence(kind="artifact", id=identifier, anchor=f"⟦art_{str(identifier)[:4]}⟧")
    assert evidence.id == identifier
    candidate = SuggestionCandidate(
        type="next_step", content="做敏感性分析", evidence=[{"kind": "artifact", "id": str(identifier)}]
    )
    assert candidate.type == "next_step"
    prompt = build_prompt({"documents": [], "artifacts": [{"id": str(identifier)}], "memories": "无"})
    assert "完整UUID" in prompt and str(identifier) in prompt
    with pytest.raises(ValidationError):
        Evidence(kind="artifact", id=identifier, anchor="⟦art_deadbeef⟧")


def test_suggestion_json_parser_accepts_fence_and_rejects_object():
    assert _json_array('```json\n[{"type":"hypothesis"}]\n```')[0]["type"] == "hypothesis"
    with pytest.raises(ValueError):
        _json_array('{"type":"hypothesis"}')
