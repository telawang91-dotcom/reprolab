import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge import Memory, Run
from app.schemas.skills import SkillCreate


def from_run(
    db: Session,
    run_id: uuid.UUID,
    name: str | None = None,
    discipline: str = "general",
) -> SkillCreate:
    run = db.get(Run, run_id)
    if run is None:
        raise LookupError("run not found")
    if run.status != "success":
        raise ValueError("only successful runs can be harvested")
    candidates = list(db.scalars(
        select(Memory).where(Memory.project_id == run.project_id, Memory.layer == "skill").limit(10)
    ))
    return SkillCreate(
        project_id=run.project_id,
        name=name or f"固化流程 {str(run.id)[:8]}",
        discipline=discipline,
        template=run.code,
        meta={
            "source_run_id": str(run.id),
            "lang": run.lang,
            "seed": run.seed,
            "renderer": "auto",
            "tools": ["sandbox", "emit_artifact"],
            "candidate_memory_ids": [str(item.id) for item in candidates],
        },
    )
