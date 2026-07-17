"""Separate curated results from the immutable artifact ledger."""

import sqlalchemy as sa
from alembic import op


revision = "0015_artifact_library"
down_revision = "0014_conversation_run_set_null"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("artifacts", sa.Column("saved_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_artifacts_saved_at", "artifacts", ["saved_at"])
    # Only clearly final, already valuable outputs are promoted during migration.
    # Every other artifact remains available in the candidate organizer and ledger.
    op.execute(
        """
        UPDATE artifacts AS artifact
        SET saved_at = artifact.created_at
        WHERE artifact.kind = 'conclusion'
           OR EXISTS (
                SELECT 1 FROM edges AS edge
                WHERE edge.from_type = 'artifact'
                  AND edge.from_id = artifact.id
                  AND edge.to_type = 'claim'
                  AND edge.relation = 'supports'
           )
        """
    )


def downgrade() -> None:
    op.drop_index("ix_artifacts_saved_at", table_name="artifacts")
    op.drop_column("artifacts", "saved_at")
