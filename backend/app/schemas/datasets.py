import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


JsonScalar = str | int | float | bool | None


class DatasetCatalogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    name: str
    storage_hash: str
    collection_id: uuid.UUID | None = None
    schema_data: dict[str, Any] | None = Field(default=None, alias="schema_json", serialization_alias="schema_json")
    created_at: datetime


class DatasetFilter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    column: str = Field(min_length=1, max_length=200)
    op: Literal["eq", "ne", "contains", "gt", "gte", "lt", "lte", "is_null", "not_null"]
    value: JsonScalar = None

    @model_validator(mode="after")
    def require_value(self):
        if self.op not in {"is_null", "not_null"} and self.value is None:
            raise ValueError(f"filter operator {self.op} requires value")
        return self


class DatasetSort(BaseModel):
    model_config = ConfigDict(extra="forbid")

    column: str = Field(min_length=1, max_length=200)
    direction: Literal["asc", "desc"] = "asc"


class DatasetQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: uuid.UUID
    sheet: str | None = Field(default=None, max_length=200)
    columns: list[str] = Field(default_factory=list, max_length=50)
    filters: list[DatasetFilter] = Field(default_factory=list, max_length=20)
    search: str | None = Field(default=None, max_length=200)
    sort: DatasetSort | None = None
    offset: int = Field(default=0, ge=0, le=1_000_000)
    limit: int = Field(default=50, ge=1, le=100)


class DatasetQueryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_id: uuid.UUID
    queries: list[DatasetQuery] = Field(min_length=1, max_length=20)


class DatasetQueryResult(BaseModel):
    dataset_id: uuid.UUID
    name: str
    storage_hash: str
    sheet: str | None = None
    columns: list[dict[str, str]]
    rows: list[dict[str, Any]]
    matched_rows: int
    returned_rows: int
    receipt: dict[str, Any]


class DatasetQueryResponse(BaseModel):
    results: list[DatasetQueryResult]
