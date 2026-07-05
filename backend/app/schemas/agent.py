import uuid
from typing import Any

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
    value_json: Any | None = None
    figure_url: str | None = None
    anchor: str


class AgentInvokeResponse(StrictModel):
    result: str
    artifacts: list[AgentArtifact]
    lineage: dict[str, LineageResponse]
    verify_report: VerifyResponse
