import uuid
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AttributeRequest(StrictModel):
    dataset_overrides: dict[str, str] = Field(default_factory=dict)
    target_artifact_id: uuid.UUID | None = None
    granularity: Literal["column", "rowgroup"] = "column"
    top_k: int = Field(default=5, ge=1, le=20)

    @field_validator("dataset_overrides")
    @classmethod
    def valid_hashes(cls, value: dict[str, str]) -> dict[str, str]:
        for old, new in value.items():
            if any(len(item) != 64 or any(char not in "0123456789abcdef" for char in item) for item in (old, new)):
                raise ValueError("dataset overrides must contain lowercase sha256 hashes")
        return value


class Attribution(StrictModel):
    dimension: str
    contribution: float = Field(ge=0, le=1)
    direction: Literal["up", "down"]
    detail: str


class AttributeResponse(StrictModel):
    target_artifact_id: uuid.UUID
    baseline: Any
    drifted: Any
    attributions: list[Attribution]
