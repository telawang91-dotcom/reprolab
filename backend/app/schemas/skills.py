import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SkillCreate(StrictModel):
    project_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    discipline: str | None = Field(default=None, min_length=1, max_length=100)
    template: str = Field(min_length=1, max_length=100_000)
    meta: dict[str, Any] | None = None


class SkillRead(StrictModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    id: uuid.UUID
    project_id: uuid.UUID | None
    name: str
    discipline: str | None
    template: str
    meta: dict[str, Any] | None
    created_at: datetime
