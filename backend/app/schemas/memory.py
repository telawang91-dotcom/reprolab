import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MemoryLayer = Literal["episodic", "semantic", "skill"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MemoryCreate(StrictModel):
    project_id: uuid.UUID
    layer: MemoryLayer
    content: str = Field(min_length=1, max_length=10_000)
    tags: list[str] = Field(default_factory=list, max_length=30)
    importance: float = Field(default=0.5, ge=0, le=1)


class MemoryOut(StrictModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    id: uuid.UUID
    layer: MemoryLayer
    content: str
    tags: list[str]
    importance: float
    written_at: datetime


class MemoryQuery(StrictModel):
    project_id: uuid.UUID
    layer: MemoryLayer | None = None
    q: str | None = Field(default=None, min_length=1, max_length=2_000)
    k: int = Field(default=6, ge=1, le=20)
