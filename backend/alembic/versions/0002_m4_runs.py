"""M4 sandbox environment snapshots and immutable runs."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

revision = "0002_m4"
down_revision = "0001_m1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "env_snapshots",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("python_version", sa.Text(), nullable=False),
        sa.Column("packages", JSONB(), nullable=False),
        sa.Column("env_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_env_snapshots_hash", "env_snapshots", ["env_hash"])
    op.create_table(
        "runs",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id")),
        # M3 adds the conversations FK after creating that table.
        sa.Column("conversation_id", sa.Uuid()),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("lang", sa.Text(), nullable=False, server_default="python"),
        sa.Column("env_snapshot_id", sa.Uuid(), sa.ForeignKey("env_snapshots.id")),
        sa.Column("input_hashes", ARRAY(sa.Text()), nullable=False, server_default=sa.text("ARRAY[]::text[]")),
        sa.Column("output_hashes", ARRAY(sa.Text()), nullable=False, server_default=sa.text("ARRAY[]::text[]")),
        sa.Column("input_hash", sa.Text(), nullable=False),
        sa.Column("code_hash", sa.Text(), nullable=False),
        sa.Column("seed", sa.Integer()),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("stdout", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('success','error')", name="ck_runs_status"),
    )
    op.create_index("idx_runs_code_hash", "runs", ["code_hash"])


def downgrade() -> None:
    op.drop_table("runs")
    op.drop_table("env_snapshots")

