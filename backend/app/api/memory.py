import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.knowledge import Memory
from app.schemas.memory import MemoryCreate, MemoryOut
from app.services.memory.recall import recall_memories
from app.services.memory.store import write_memory

router = APIRouter(prefix="/memories", tags=["memory"])


@router.get("", response_model=list[MemoryOut])
def list_memories(
    project_id: uuid.UUID,
    layer: Literal["episodic", "semantic", "skill"] | None = None,
    q: str | None = Query(default=None, min_length=1, max_length=2_000),
    k: int = Query(default=6, ge=1, le=20),
    db: Session = Depends(get_db),
) -> list[Memory]:
    if q is not None:
        if layer not in (None, "semantic"):
            raise HTTPException(status_code=422, detail="q can only recall semantic memories")
        return recall_memories(db, project_id, q, k=k)
    statement = select(Memory).where(Memory.project_id == project_id)
    if layer is not None:
        statement = statement.where(Memory.layer == layer)
    return list(db.scalars(statement.order_by(Memory.written_at.desc(), Memory.id).limit(k)))


@router.post("", response_model=MemoryOut, status_code=status.HTTP_201_CREATED)
def create_memory(request: MemoryCreate, db: Session = Depends(get_db)) -> Memory:
    return write_memory(db, request)
