"""M10 evidence-bound research suggestions."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_m10"
down_revision = "0006_m9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "suggestions",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id")),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("evidence", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="new"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "type IN ('hypothesis','literature','next_step')", name="ck_suggestions_type"
        ),
        sa.CheckConstraint("status IN ('new','dismissed')", name="ck_suggestions_status"),
    )
    op.create_index("idx_suggestions_project", "suggestions", ["project_id"])


def downgrade() -> None:
    op.drop_table("suggestions")
