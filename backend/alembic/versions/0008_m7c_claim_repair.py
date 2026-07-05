"""M7c auditable claim repair state."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008_m7c"
down_revision = "0007_m10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "claims", sa.Column("repair_count", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column(
        "claims",
        sa.Column(
            "repair_meta", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
    )


def downgrade() -> None:
    op.drop_column("claims", "repair_meta")
    op.drop_column("claims", "repair_count")
