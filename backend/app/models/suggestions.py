import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Suggestion(Base):
    __tablename__ = "suggestions"
    __table_args__ = (
        CheckConstraint(
            "type IN ('hypothesis','literature','next_step')", name="ck_suggestions_type"
        ),
        CheckConstraint("status IN ('new','dismissed')", name="ck_suggestions_status"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"), index=True)
    type: Mapped[str] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text)
    evidence: Mapped[list[dict]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(Text, default="new")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
