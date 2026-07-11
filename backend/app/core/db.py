from collections.abc import Generator

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class ProjectArchivedError(RuntimeError):
    pass


@event.listens_for(Session, "before_flush")
def prevent_archived_project_writes(session: Session, _flush_context, _instances) -> None:
    """Keep archived workspaces readable while centrally blocking all scoped writes."""
    project_ids = {
        project_id for item in (session.new | session.dirty)
        if (project_id := getattr(item, "project_id", None)) is not None
    }
    if not project_ids:
        return
    from app.models.knowledge import Project

    archived = session.scalars(
        select(Project.id).where(Project.id.in_(project_ids), Project.archived_at.is_not(None))
    ).first()
    if archived is not None:
        raise ProjectArchivedError("project is archived and read-only")


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
