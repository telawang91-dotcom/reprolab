"""M1b knowledge collections and optional document scope."""

from alembic import op
import sqlalchemy as sa

revision = "0011_m1b"
down_revision = "0010_m11b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "collections",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "name", name="uq_collections_project_name"),
    )
    op.create_index("idx_collections_project", "collections", ["project_id"])
    op.add_column("documents", sa.Column("collection_id", sa.Uuid()))
    op.create_foreign_key(
        "fk_documents_collection_id", "documents", "collections", ["collection_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("idx_documents_collection", "documents", ["collection_id"])
    op.add_column("datasets", sa.Column("collection_id", sa.Uuid()))
    op.create_foreign_key(
        "fk_datasets_collection_id", "datasets", "collections", ["collection_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("idx_datasets_collection", "datasets", ["collection_id"])


def downgrade() -> None:
    op.drop_index("idx_datasets_collection", table_name="datasets")
    op.drop_constraint("fk_datasets_collection_id", "datasets", type_="foreignkey")
    op.drop_column("datasets", "collection_id")
    op.drop_index("idx_documents_collection", table_name="documents")
    op.drop_constraint("fk_documents_collection_id", "documents", type_="foreignkey")
    op.drop_column("documents", "collection_id")
    op.drop_table("collections")
