"""M7 verifiable claims."""

from alembic import op
import sqlalchemy as sa

revision = "0005_m7"
down_revision = "0004_m3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "claims",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id")),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("doc_id", sa.Uuid()),
        sa.Column("status", sa.Text(), nullable=False, server_default="unverified"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('unverified','verified','flagged')", name="ck_claims_status"),
    )
    op.create_index("idx_claims_document", "claims", ["doc_id"])


def downgrade() -> None:
    op.drop_table("claims")

