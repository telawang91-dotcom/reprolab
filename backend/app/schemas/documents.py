import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

DocumentType = Literal["paper", "note", "code", "other"]


class DocumentUploadResponse(BaseModel):
    id: uuid.UUID
    type: DocumentType
    filename: str
    storage_hash: str
    chunks_count: int | None = None
    dataset_id: uuid.UUID | None = None


class DocumentListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    type: DocumentType
    filename: str
    title: str | None
    year: int | None
    created_at: datetime


class DocumentDetail(DocumentListItem):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    project_id: uuid.UUID | None
    storage_hash: str
    authors: list[str] | None
    doi: str | None
    source_url: str | None
    metadata: dict[str, Any] | None
    chunks_count: int
    dataset_id: uuid.UUID | None = None
    dataset_schema: dict[str, Any] | None = Field(default=None, alias="schema_json", serialization_alias="schema_json")


class DeleteResponse(BaseModel):
    id: uuid.UUID
    deleted: bool
