"""M11 reusable optional skill packs."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0009_m11"
down_revision = "0008_m7c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "skills",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id")),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("discipline", sa.Text()),
        sa.Column("template", sa.Text(), nullable=False),
        sa.Column("meta", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_skills_project", "skills", ["project_id"])
    op.create_index("idx_skills_discipline", "skills", ["discipline"])


def downgrade() -> None:
    op.drop_table("skills")
