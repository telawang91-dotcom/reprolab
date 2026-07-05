"""M3 conversations and messages."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004_m3"
down_revision = "0003_m5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id")),
        sa.Column("title", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "messages",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("conversation_id", sa.Uuid(), sa.ForeignKey("conversations.id", ondelete="CASCADE")),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("content", sa.Text()),
        sa.Column("meta", JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('user','assistant','tool')", name="ck_messages_role"),
    )
    op.create_index("idx_messages_conversation", "messages", ["conversation_id"])
    op.create_foreign_key(
        "fk_runs_conversation_id",
        "runs",
        "conversations",
        ["conversation_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_runs_conversation_id", "runs", type_="foreignkey")
    op.drop_table("messages")
    op.drop_table("conversations")

