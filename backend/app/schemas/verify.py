import uuid
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class VerifyRequest(StrictModel):
    project_id: uuid.UUID
    text: str | None = Field(default=None, min_length=1, max_length=200_000)
    doc_id: uuid.UUID | None = None
    checks: list[Literal["citation", "number", "figure"]] = Field(
        default_factory=lambda: ["citation", "number", "figure"]
    )
    repair: bool = False

    @model_validator(mode="after")
    def exactly_one_source(self):
        if (self.text is None) == (self.doc_id is None):
            raise ValueError("exactly one of text or doc_id is required")
        if not self.checks:
            raise ValueError("checks cannot be empty")
        return self


class VerifyItem(StrictModel):
    check: Literal["citation", "number", "figure"]
    target_anchor: str | None
    verdict: Literal["pass", "fail"]
    severity: Literal["warn", "error"]
    reason: str
    locate: str
    label: Literal["entailment", "neutral", "contradiction"] | None = None
    support_score: float | None = Field(default=None, ge=0, le=1)
    evidence_span: str | None = None


class RepairIteration(StrictModel):
    round: int
    fails: int
    repair_action: str


class VerifyResponse(StrictModel):
    verdict: Literal["pass", "fail"]
    items: list[VerifyItem]
    iterations: list[RepairIteration] | None = None
    claim_status: Literal["verified", "flagged"] | None = None

