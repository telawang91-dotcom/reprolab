import json
import re
import uuid

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.core.config import settings
from app.models.knowledge import Conversation, Message
from app.schemas.memory import MemoryCreate
from app.services.agents.model_adapter import ModelAdapter, model_adapter
from app.services.memory.store import write_memory


def _json_array(text: str) -> list[dict]:
    stripped = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, re.DOTALL | re.IGNORECASE)
    if fenced:
        stripped = fenced.group(1)
    start, end = stripped.find("["), stripped.rfind("]")
    if start < 0 or end < start:
        raise ValueError("model did not return a JSON array")
    payload = json.loads(stripped[start : end + 1])
    if not isinstance(payload, list):
        raise ValueError("memory candidates must be an array")
    return payload


def reflect_conversation(
    db: Session, conversation_id: uuid.UUID, adapter: ModelAdapter = model_adapter
) -> list:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.project_id is None:
        raise LookupError("conversation not found")
    messages = list(db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at, Message.id)
    ))
    if not messages:
        return []
    transcript = [
        {"role": item.role, "content": item.content or "", "meta": item.extra_metadata or {}}
        for item in messages
    ]
    factual_summary = " | ".join(
        f"{item['role']}: {item['content'][:500]}" for item in transcript if item["content"]
    )[:4000]
    written = [write_memory(db, MemoryCreate(
        project_id=conversation.project_id,
        layer="episodic",
        content=f"会话 {conversation_id}：{factual_summary}",
        tags=["conversation", str(conversation_id)],
        importance=0.5,
    ))]
    try:
        response = adapter.chat({
            "model": settings.agent_model_route["critic"],
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "从科研会话抽取长期记忆候选，只返回JSON数组。"
                        "episodic=会话摘要，semantic=方法/偏好/领域事实，skill=可固化流程。"
                        "不得编造会话中没有的信息。"
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(transcript, ensure_ascii=False, default=str)
                    + '\n格式：[\n  {"layer":"semantic","content":"...","tags":[],"importance":0.5}\n]',
                },
            ]
        })
        candidates = _json_array(response.content)
    except (RuntimeError, ValueError, json.JSONDecodeError):
        return written
    for candidate in candidates[:12]:
        try:
            request = MemoryCreate(project_id=conversation.project_id, **candidate)
        except (ValidationError, TypeError):
            continue
        written.append(write_memory(db, request))
    return written


def reflect_conversation_task(conversation_id: uuid.UUID) -> None:
    with SessionLocal() as db:
        reflect_conversation(db, conversation_id)
