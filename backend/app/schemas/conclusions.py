import re
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ANCHOR_CODE = re.compile(r"^(?:art|src)_[0-9a-fA-F]{4}$")


class ConclusionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: uuid.UUID
    claim_text: str = Field(min_length=1, max_length=200_000)
    anchors: list[str]
    status: Literal["verified"]

    @field_validator("anchors")
    @classmethod
    def valid_anchors(cls, value: list[str]) -> list[str]:
        normalized = [item.lower() for item in value]
        if len(normalized) != len(set(normalized)):
            raise ValueError("anchors must be unique")
        if any(not ANCHOR_CODE.fullmatch(item) for item in normalized):
            raise ValueError("anchor must match art_xxxx or src_xxxx")
        return normalized


class ConclusionOut(BaseModel):
    document_id: uuid.UUID


class WritingDraftCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: uuid.UUID


class WritingDraftOut(BaseModel):
    text: str
    anchors: list[str]
