import math
import logging
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.knowledge import Memory
from app.services.memory.embed import embed_memory
from app.services.memory.store import nearest_semantic

MAX_AGE_DAYS = 180
MIN_IMPORTANCE = 0.2
logger = logging.getLogger(__name__)


def _lexical_tokens(text: str) -> set[str]:
    lowered = text.lower()
    tokens = set(re.findall(r"[a-z0-9_]+", lowered))
    for run in re.findall(r"[\u3400-\u9fff]+", lowered):
        tokens.update(run)
        tokens.update(run[index : index + 2] for index in range(len(run) - 1))
    return tokens


def _lexical_similarity(query: str, content: str) -> float:
    query_tokens = _lexical_tokens(query)
    content_tokens = _lexical_tokens(content)
    if not query_tokens or not content_tokens:
        return 0.0
    overlap = len(query_tokens & content_tokens)
    return overlap / math.sqrt(len(query_tokens) * len(content_tokens))


def _lexical_candidates(
    db: Session, project_id: uuid.UUID, query: str, limit: int = 20
) -> list[tuple[Memory, float]]:
    memories = list(db.scalars(
        select(Memory)
        .where(Memory.project_id == project_id, Memory.layer == "semantic")
        .order_by(Memory.written_at.desc())
        .limit(50)
    ))
    scored = [
        (memory, _lexical_similarity(query, memory.content))
        for memory in memories
    ]
    return sorted(
        ((memory, score) for memory, score in scored if score > 0),
        key=lambda item: (-item[1], str(item[0].id)),
    )[:limit]


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
    try:
        query_vector = embed_memory(query)
    except Exception:
        logger.warning(
            "memory embedding unavailable; using lexical project-memory recall",
            exc_info=True,
        )
        candidates = _lexical_candidates(db, project_id, query, limit=20)
    else:
        candidates = nearest_semantic(db, project_id, query_vector, limit=20)
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
