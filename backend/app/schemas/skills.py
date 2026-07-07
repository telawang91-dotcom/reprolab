import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SkillCreate(StrictModel):
    project_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    discipline: str | None = Field(default=None, min_length=1, max_length=100)
    template: str = Field(min_length=1, max_length=100_000)
    meta: dict[str, Any] | None = None
    intent: str = Field(default="", max_length=500)
    input_roles: dict[str, dict[str, Any]] = Field(default_factory=dict)
    version: int = Field(default=1, ge=1)
    origin: Literal["local", "builtin", "imported", "hub"] = "local"
    package_hash: str | None = Field(default=None, min_length=64, max_length=64)


class SkillRead(StrictModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    id: uuid.UUID
    project_id: uuid.UUID | None
    name: str
    discipline: str | None
    template: str
    meta: dict[str, Any] | None
    intent: str
    input_roles: dict[str, dict[str, Any]]
    version: int
    origin: str
    package_hash: str | None
    created_at: datetime


class SkillFromArtifact(StrictModel):
    artifact_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    intent: str = Field(min_length=1, max_length=500)
    discipline: str = Field(default="general", min_length=1, max_length=100)


class SkillApplyRequest(StrictModel):
    project_id: uuid.UUID
    dataset_ids: list[uuid.UUID] = Field(min_length=1)
    conversation_id: uuid.UUID | None = None
    intent_override: str | None = Field(default=None, min_length=1, max_length=500)


class SkillTokenUsage(StrictModel):
    mapping_tokens: int = 0
    estimated_from_scratch_tokens: int = 0
    saved_tokens: int = 0


class SkillApplyResponse(StrictModel):
    skill_id: uuid.UUID
    fallback_used: bool
    mapping: dict[str, str] = Field(default_factory=dict)
    mapping_reason: str = ""
    run_id: uuid.UUID | None = None
    status: Literal["success", "error"]
    code: str | None = None
    artifacts: list[dict[str, Any]] = Field(default_factory=list)
    conversation_id: uuid.UUID | None = None
    events: list[dict[str, Any]] = Field(default_factory=list)
    token_usage: SkillTokenUsage


class SkillPackageImport(StrictModel):
    project_id: uuid.UUID
    package: dict[str, Any]


class SkillHubImport(StrictModel):
    project_id: uuid.UUID


class SkillHubItem(StrictModel):
    id: str
    name: str
    intent: str
    discipline: str
    version: int
    author: str
