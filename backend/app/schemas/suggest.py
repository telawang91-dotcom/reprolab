import re
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SuggestionType = Literal["hypothesis", "literature", "next_step"]
EvidenceKind = Literal["document", "artifact"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Evidence(StrictModel):
    kind: EvidenceKind
    id: uuid.UUID
    anchor: str

    @field_validator("anchor")
    @classmethod
    def valid_anchor(cls, value: str) -> str:
        if not re.fullmatch(r"⟦(?:src|art)_[0-9a-f]{4}⟧", value):
            raise ValueError("invalid evidence anchor")
        return value


class SuggestionOut(StrictModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    id: uuid.UUID
    type: SuggestionType
    content: str
    evidence: list[Evidence]


class RefreshRequest(StrictModel):
    project_id: uuid.UUID


class RefreshResponse(StrictModel):
    generated: int
    items: list[SuggestionOut]


class SuggestionCandidate(StrictModel):
    type: SuggestionType
    content: str = Field(min_length=1, max_length=2_000)
    evidence: list[dict] = Field(min_length=1, max_length=8)
