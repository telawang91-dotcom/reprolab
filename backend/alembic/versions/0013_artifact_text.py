"""Allow natural-language text artifacts."""

from alembic import op


revision = "0013_artifact_text"
down_revision = "0012_m12"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_artifacts_kind", "artifacts", type_="check")
    op.create_check_constraint(
        "ck_artifacts_kind",
        "artifacts",
        "kind IN ('number','coefficient','table','figure','text','conclusion')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_artifacts_kind", "artifacts", type_="check")
    op.create_check_constraint(
        "ck_artifacts_kind",
        "artifacts",
        "kind IN ('number','coefficient','table','figure','conclusion')",
    )
