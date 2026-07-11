import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel


class TimelineItem(BaseModel):
    kind: Literal["document", "run", "claim", "conversation"]
    title: str
    detail: str
    created_at: datetime
    href: str | None = None
    trusted: bool = False


class TimelineResponse(BaseModel):
    events: list[TimelineItem]


class ReviewCounts(BaseModel):
    documents: int
    datasets: int
    successful_runs: int
    failed_runs: int
    artifacts: int
    verified_claims: int
    flagged_claims: int


class ReviewResponse(BaseModel):
    project_id: uuid.UUID
    project_name: str
    counts: ReviewCounts
    risks: list[str]
    next_actions: list[str]


class EvidenceExcerpt(BaseModel):
    section: str | None
    position: int | None
    content: str


class EvidenceResponse(BaseModel):
    document_id: uuid.UUID
    excerpts: list[EvidenceExcerpt]


class ReportArtifact(BaseModel):
    id: uuid.UUID
    kind: str
    title: str | None
    value: Any | None


class RunReport(BaseModel):
    run_id: uuid.UUID
    status: str
    created_at: datetime
    code_hash: str
    input_hash: str
    seed: int | None
    datasets: list[dict[str, Any]]
    environment: dict[str, Any]
    artifacts: list[ReportArtifact]
    reproduction_note: str


class ArtifactChange(BaseModel):
    key: str
    baseline: Any | None
    candidate: Any | None
    changed: bool


class RunCompare(BaseModel):
    baseline_run_id: uuid.UUID
    candidate_run_id: uuid.UUID
    code_changed: bool
    input_changed: bool
    environment_changed: bool
    artifact_changes: list[ArtifactChange]
