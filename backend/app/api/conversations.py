import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.conversations import ConversationReplay, ConversationSummary
from app.services.agents.conversations import list_conversations, replay_conversation

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationSummary])
def get_conversations(
    project_id: uuid.UUID, db: Session = Depends(get_db)
) -> list[ConversationSummary]:
    return list_conversations(db, project_id)


@router.get("/{conversation_id}", response_model=ConversationReplay)
def get_conversation(
    conversation_id: uuid.UUID,
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> ConversationReplay:
    try:
        return replay_conversation(db, project_id, conversation_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
