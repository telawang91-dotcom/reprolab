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
    collection_id: uuid.UUID | None = None


class DocumentListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    type: DocumentType
    filename: str
    title: str | None
    year: int | None
    created_at: datetime
    collection_id: uuid.UUID | None = None


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


class DocumentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: uuid.UUID
    title: str | None = Field(default=None, max_length=500)
    collection_id: uuid.UUID | None = None


class DocumentOrganizeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: uuid.UUID
    document_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    collection_id: uuid.UUID | None = None


class DocumentOrganizeResponse(BaseModel):
    updated: int
    collection_id: uuid.UUID | None = None


class BatchItem(BaseModel):
    filename: str
    status: Literal["queued", "processing", "success", "error"]
    document_id: uuid.UUID | None = None
    dataset_id: uuid.UUID | None = None
    error: str | None = None


class BatchStatus(BaseModel):
    batch_id: uuid.UUID
    project_id: uuid.UUID
    collection_id: uuid.UUID | None = None
    status: Literal["queued", "processing", "success", "partial", "error"]
    total: int
    completed: int
    failed: int
    items: list[BatchItem]
