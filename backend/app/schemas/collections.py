import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CollectionCreate(StrictModel):
    project_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)


class CollectionUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)


class CollectionRead(StrictModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None
    document_count: int = 0
    created_at: datetime


class CollectionDelete(StrictModel):
    id: uuid.UUID
    deleted: bool
