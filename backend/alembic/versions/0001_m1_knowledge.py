"""M1 knowledge base tables."""

import uuid

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001_m1"
down_revision = None
branch_labels = None
depends_on = None

DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"
DEMO_PROJECT_ID = "00000000-0000-0000-0000-000000000101"


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id")),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "documents",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id")),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("storage_hash", sa.Text(), nullable=False),
        sa.Column("title", sa.Text()),
        sa.Column("authors", JSONB()),
        sa.Column("year", sa.Integer()),
        sa.Column("doi", sa.Text()),
        sa.Column("source_url", sa.Text()),
        sa.Column("metadata", JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("type IN ('paper','note','code','other')", name="ck_documents_type"),
    )
    op.create_index("idx_documents_project", "documents", ["project_id"])
    op.create_table(
        "chunks",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id", ondelete="CASCADE")),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1024)),
        sa.Column("section", sa.Text()),
        sa.Column("position", sa.Integer()),
        sa.Column("metadata", JSONB()),
    )
    op.create_index("idx_chunks_document", "chunks", ["document_id"])
    op.execute(
        "CREATE INDEX idx_chunks_embedding ON chunks "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )
    op.create_table(
        "datasets",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id")),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("storage_hash", sa.Text(), nullable=False),
        sa.Column("schema_json", JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.execute(
        sa.text("INSERT INTO users (id, name, email) VALUES (:id, 'Demo User', 'demo@reprolab.local')")
        .bindparams(sa.bindparam("id", value=uuid.UUID(DEMO_USER_ID), type_=sa.Uuid()))
    )
    op.execute(
        sa.text(
            "INSERT INTO projects (id, owner_id, name, description) "
            "VALUES (:id, :owner_id, 'ReproLab Demo', 'Default demo project')"
        ).bindparams(
            sa.bindparam("id", value=uuid.UUID(DEMO_PROJECT_ID), type_=sa.Uuid()),
            sa.bindparam("owner_id", value=uuid.UUID(DEMO_USER_ID), type_=sa.Uuid()),
        )
    )


def downgrade() -> None:
    op.drop_table("datasets")
    op.drop_index("idx_chunks_embedding", table_name="chunks")
    op.drop_table("chunks")
    op.drop_table("documents")
    op.drop_table("projects")
    op.drop_table("users")
