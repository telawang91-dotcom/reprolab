"""M5 artifacts and provenance edges."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0003_m5"
down_revision = "0002_m4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "artifacts",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id")),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("runs.id")),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("title", sa.Text()),
        sa.Column("value_json", JSONB()),
        sa.Column("content_hash", sa.Text()),
        sa.Column("tol", sa.Float()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "kind IN ('number','coefficient','table','figure','conclusion')",
            name="ck_artifacts_kind",
        ),
    )
    op.create_index("idx_artifacts_run", "artifacts", ["run_id"])
    op.create_table(
        "edges",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("from_type", sa.Text(), nullable=False),
        sa.Column("from_id", sa.Uuid(), nullable=False),
        sa.Column("to_type", sa.Text(), nullable=False),
        sa.Column("to_id", sa.Uuid(), nullable=False),
        sa.Column("relation", sa.Text(), nullable=False),
        sa.CheckConstraint(
            "relation IN ('reads','produces','supports','cites')",
            name="ck_edges_relation",
        ),
    )
    op.create_index("idx_edges_from", "edges", ["from_type", "from_id"])
    op.create_index("idx_edges_to", "edges", ["to_type", "to_id"])


def downgrade() -> None:
    op.drop_table("edges")
    op.drop_table("artifacts")

