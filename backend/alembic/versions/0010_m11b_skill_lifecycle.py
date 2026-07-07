"""M11b skill lifecycle metadata."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0010_m11b"
down_revision = "0009_m11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("skills", sa.Column("intent", sa.Text(), nullable=False, server_default=""))
    op.add_column(
        "skills",
        sa.Column("input_roles", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.add_column("skills", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("skills", sa.Column("origin", sa.Text(), nullable=False, server_default="local"))
    op.add_column("skills", sa.Column("package_hash", sa.Text()))


def downgrade() -> None:
    op.drop_column("skills", "package_hash")
    op.drop_column("skills", "origin")
    op.drop_column("skills", "version")
    op.drop_column("skills", "input_roles")
    op.drop_column("skills", "intent")
