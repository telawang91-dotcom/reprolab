import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge import Memory
from app.schemas.memory import MemoryCreate
from app.services.memory.embed import embed_memory

DEDUP_THRESHOLD = 0.92


def nearest_semantic(
    db: Session, project_id: uuid.UUID, vector: list[float], limit: int = 20
) -> list[tuple[Memory, float]]:
    distance = Memory.embedding.cosine_distance(vector)
    rows = db.execute(
        select(Memory, distance.label("distance"))
        .where(
            Memory.project_id == project_id,
            Memory.layer == "semantic",
            Memory.embedding.is_not(None),
        )
        .order_by(distance)
        .limit(limit)
    )
    return [(memory, max(0.0, 1.0 - float(value))) for memory, value in rows]


def write_memory(db: Session, request: MemoryCreate) -> Memory:
    vector = embed_memory(request.content) if request.layer == "semantic" else None
    if vector is not None:
        nearest = nearest_semantic(db, request.project_id, vector, limit=1)
        if nearest and nearest[0][1] >= DEDUP_THRESHOLD:
            duplicate = nearest[0][0]
            duplicate.written_at = datetime.now(timezone.utc)
            duplicate.importance = max(duplicate.importance, request.importance)
            duplicate.tags = sorted(set((duplicate.tags or []) + request.tags))
            db.commit()
            db.refresh(duplicate)
            return duplicate
    memory = Memory(
        project_id=request.project_id,
        layer=request.layer,
        content=request.content,
        embedding=vector,
        tags=request.tags,
        importance=request.importance,
        written_at=datetime.now(timezone.utc),
    )
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return memory
