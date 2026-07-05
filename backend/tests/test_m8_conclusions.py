import uuid

import pytest
from pydantic import ValidationError

from app.schemas.conclusions import ConclusionCreate


def test_conclusion_contract_normalizes_anchors():
    request = ConclusionCreate(
        project_id=uuid.uuid4(), claim_text="结果 1⟦art_ABCD⟧", anchors=["art_ABCD"], status="verified"
    )
    assert request.anchors == ["art_abcd"]


def test_conclusion_contract_rejects_duplicate_or_invalid_anchors():
    with pytest.raises(ValidationError):
        ConclusionCreate(project_id=uuid.uuid4(), claim_text="x", anchors=["art_abcd", "art_abcd"], status="verified")
    with pytest.raises(ValidationError):
        ConclusionCreate(project_id=uuid.uuid4(), claim_text="x", anchors=["bad"], status="verified")

