import math
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.knowledge import Memory
from app.services.memory.embed import embed_memory
from app.services.memory.store import nearest_semantic

MAX_AGE_DAYS = 180
MIN_IMPORTANCE = 0.2


def verify_before_use(memory: Memory, now: datetime | None = None) -> bool:
    current = now or datetime.now(timezone.utc)
    written = memory.written_at
    if written.tzinfo is None:
        written = written.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (current - written).total_seconds() / 86400)
    return age_days <= MAX_AGE_DAYS and memory.importance >= MIN_IMPORTANCE


def recall_memories(
    db: Session,
    project_id: uuid.UUID,
    query: str,
    k: int = 6,
    half_life_days: int = 30,
) -> list[Memory]:
    count = db.scalar(select(func.count(Memory.id)).where(
        Memory.project_id == project_id, Memory.layer == "semantic"
    ))
    if not count:
        return []
    now = datetime.now(timezone.utc)
    candidates = nearest_semantic(db, project_id, embed_memory(query), limit=20)
    ranked: list[tuple[float, Memory]] = []
    for memory, similarity in candidates:
        if not verify_before_use(memory, now):
            continue
        written = memory.written_at
        if written.tzinfo is None:
            written = written.replace(tzinfo=timezone.utc)
        age_days = max(0.0, (now - written).total_seconds() / 86400)
        score = similarity * math.pow(0.5, age_days / half_life_days)
        ranked.append((score, memory))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [memory for _, memory in ranked[:k]]


def memory_context(memories: list[Memory]) -> str:
    if not memories:
        return "无可用长期记忆。"
    return "\n".join(f"- {item.content}" for item in memories)
