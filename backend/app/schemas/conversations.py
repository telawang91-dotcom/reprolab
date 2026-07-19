import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ConversationSummary(StrictModel):
    id: uuid.UUID
    collection_id: uuid.UUID | None
    title: str | None
    created_at: datetime
    updated_at: datetime
    message_count: int


class ConversationEvent(StrictModel):
    event: str
    data: dict[str, Any]


class ConversationReplay(StrictModel):
    id: uuid.UUID
    collection_id: uuid.UUID | None
    title: str | None
    events: list[ConversationEvent]
