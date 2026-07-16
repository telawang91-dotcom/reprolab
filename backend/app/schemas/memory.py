import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field

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

    @computed_field(return_type=bool)
    @property
    def recallable(self) -> bool:
        current = datetime.now(self.written_at.tzinfo) if self.written_at.tzinfo else datetime.now()
        age_days = max(0.0, (current - self.written_at).total_seconds() / 86400)
        return age_days <= 180 and self.importance >= 0.2

    @computed_field(return_type=str)
    @property
    def source(self) -> str:
        if "manual" in self.tags:
            return "manual"
        if "conversation" in self.tags:
            return "conversation"
        if "reflection" in self.tags:
            return "reflection"
        return "agent"


class MemoryDeleteResponse(StrictModel):
    id: uuid.UUID
    deleted: bool


class MemoryQuery(StrictModel):
    project_id: uuid.UUID
    layer: MemoryLayer | None = None
    q: str | None = Field(default=None, min_length=1, max_length=2_000)
    k: int = Field(default=6, ge=1, le=20)
