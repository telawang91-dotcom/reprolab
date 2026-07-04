import uuid
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: uuid.UUID
    conversation_id: uuid.UUID | None = None
    code: str = Field(min_length=1, max_length=100_000)
    lang: Literal["python"] = "python"
    dataset_ids: list[uuid.UUID] = Field(default_factory=list)
    seed: int = 42


class ArtifactCapture(BaseModel):
    artifact_id: uuid.UUID | None = None
    kind: Literal["number", "table", "figure", "text"]
    mime_type: str
    value: Any | None = None
    storage_hash: str | None = None


class RunResponse(BaseModel):
    run_id: uuid.UUID
    status: Literal["success", "error"]
    stdout: str
    artifacts: list[ArtifactCapture]
    code_hash: str

