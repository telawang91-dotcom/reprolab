import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SearchFilters(StrictModel):
    year_gte: int | None = Field(default=None, ge=1000, le=9999)
    type: Literal["paper", "note", "code", "other"] | None = None


class SearchRequest(StrictModel):
    project_id: uuid.UUID
    query: str = Field(min_length=1, max_length=4000)
    mode: Literal["keyword", "semantic", "hybrid"] = "hybrid"
    filters: SearchFilters | None = None
    k: int = Field(default=8, ge=1, le=50)


class SearchHit(StrictModel):
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    content: str
    section: str | None
    position: int | None
    score: float


class SearchResponse(StrictModel):
    hits: list[SearchHit]


class QARequest(StrictModel):
    project_id: uuid.UUID
    query: str = Field(min_length=1, max_length=4000)


class Citation(StrictModel):
    document_id: uuid.UUID
    chunk_id: uuid.UUID
    anchor: str


class QAResponse(StrictModel):
    answer: str
    citations: list[Citation]

