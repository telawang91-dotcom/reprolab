"""M12 project archival state."""

from alembic import op
import sqlalchemy as sa


revision = "0012_m12"
down_revision = "0011_m1b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("archived_at", sa.DateTime(timezone=True)))
    op.create_index("idx_projects_archived_at", "projects", ["archived_at"])


def downgrade() -> None:
    op.drop_index("idx_projects_archived_at", table_name="projects")
    op.drop_column("projects", "archived_at")
