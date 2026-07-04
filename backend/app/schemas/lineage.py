import uuid
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class LineageNode(StrictModel):
    id: uuid.UUID
    type: Literal["dataset", "run", "artifact", "claim", "document"]
    label: str
    meta: dict[str, Any] = Field(default_factory=dict)


class LineageEdge(StrictModel):
    from_: uuid.UUID = Field(alias="from", serialization_alias="from")
    to: uuid.UUID
    relation: Literal["reads", "produces", "supports", "cites"]


class LineageResponse(StrictModel):
    nodes: list[LineageNode]
    edges: list[LineageEdge]


class ReproduceRequest(StrictModel):
    dataset_overrides: dict[str, str] = Field(default_factory=dict)


class Comparison(StrictModel):
    artifact_id: uuid.UUID
    kind: str
    old: Any | None
    new: Any | None
    within_tol: bool
    diff: Any | None = None


class ReproduceResponse(StrictModel):
    status: Literal["match", "drift"]
    comparisons: list[Comparison]
    new_run_id: uuid.UUID

