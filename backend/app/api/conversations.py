import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.conversations import ConversationReplay, ConversationSummary
from app.services.agents.conversations import delete_conversation, list_conversations, replay_conversation

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationSummary])
def get_conversations(
    project_id: uuid.UUID,
    collection_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
) -> list[ConversationSummary]:
    return list_conversations(db, project_id, collection_id)


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


@router.delete("/{conversation_id}", status_code=204)
def remove_conversation(
    conversation_id: uuid.UUID,
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> None:
    try:
        delete_conversation(db, project_id, conversation_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
