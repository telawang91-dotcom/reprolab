"""Keep trusted runs when deleting conversation history."""

from alembic import op


revision = "0014_conversation_run_set_null"
down_revision = "0013_artifact_text"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("fk_runs_conversation_id", "runs", type_="foreignkey")
    op.create_foreign_key(
        "fk_runs_conversation_id",
        "runs",
        "conversations",
        ["conversation_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_runs_conversation_id", "runs", type_="foreignkey")
    op.create_foreign_key(
        "fk_runs_conversation_id",
        "runs",
        "conversations",
        ["conversation_id"],
        ["id"],
    )
