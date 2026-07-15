import uuid
from datetime import datetime
from typing import Any
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.lineage import LineageResponse
from app.schemas.verify import VerifyResponse


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AgentInputs(StrictModel):
    dataset_ids: list[uuid.UUID] = Field(default_factory=list)
    skill_id: uuid.UUID | None = None


class AgentInvokeRequest(StrictModel):
    project_id: uuid.UUID
    task: str = Field(min_length=1, max_length=10_000)
    inputs: AgentInputs = Field(default_factory=AgentInputs)


class AgentArtifact(StrictModel):
    artifact_id: uuid.UUID
    kind: str
    title: str | None = None
    value_json: Any | None = None
    figure_url: str | None = None
    anchor: str


class AgentInvokeResponse(StrictModel):
    result: str
    artifacts: list[AgentArtifact]
    lineage: dict[str, LineageResponse]
    verify_report: VerifyResponse


AgentJobStatus = Literal["queued", "running", "cancelling", "succeeded", "failed", "cancelled"]


class AgentJobAccepted(StrictModel):
    job_id: uuid.UUID
    status: AgentJobStatus
    status_url: str
    created_at: datetime


class AgentJobRead(StrictModel):
    job_id: uuid.UUID
    status: AgentJobStatus
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    result: AgentInvokeResponse | None = None
    error: str | None = None
