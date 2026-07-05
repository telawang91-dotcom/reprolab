import uuid
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ChatRequest(StrictModel):
    project_id: uuid.UUID
    conversation_id: uuid.UUID | None = None
    message: str = Field(min_length=1, max_length=10_000)
    dataset_ids: list[uuid.UUID] = Field(default_factory=list)
    skill_id: uuid.UUID | None = None


class PlanStep(StrictModel):
    title: str
    rationale: str


class PlanEvent(StrictModel):
    steps: list[PlanStep]


class ThinkingEvent(StrictModel):
    text: str


class CodeEvent(StrictModel):
    code: str
    lang: Literal["python"] = "python"


class RunEvent(StrictModel):
    run_id: uuid.UUID
    status: Literal["success", "error"]
    stdout: str


class ArtifactEvent(StrictModel):
    artifact_id: uuid.UUID
    kind: str
    value_json: Any | None = None
    figure_url: str | None = None
    anchor: str


class MessageEvent(StrictModel):
    text: str
    citations: list[str]


class DoneEvent(StrictModel):
    conversation_id: uuid.UUID


class SSEEvent(StrictModel):
    event: Literal["plan", "thinking", "code", "run", "artifact", "message", "done"]
    data: dict[str, Any]
