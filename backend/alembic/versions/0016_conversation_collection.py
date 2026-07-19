"""Bind every conversation to a stable research folder."""

import sqlalchemy as sa
from alembic import op


revision = "0016_conversation_collection"
down_revision = "0015_artifact_library"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("collection_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_conversations_collection_id",
        "conversations",
        "collections",
        ["collection_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_conversations_collection_id",
        "conversations",
        ["collection_id"],
    )
    op.execute(
        """
        UPDATE conversations AS conversation
        SET collection_id = scoped.collection_id
        FROM (
            SELECT DISTINCT ON (message.conversation_id)
                message.conversation_id,
                (message.meta ->> 'collection_id')::uuid AS collection_id
            FROM messages AS message
            WHERE message.role = 'user'
              AND message.meta ->> 'collection_id' ~
                  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            ORDER BY message.conversation_id, message.created_at, message.id
        ) AS scoped
        WHERE scoped.conversation_id = conversation.id
        """
    )


def downgrade() -> None:
    op.drop_index("ix_conversations_collection_id", table_name="conversations")
    op.drop_constraint(
        "fk_conversations_collection_id",
        "conversations",
        type_="foreignkey",
    )
    op.drop_column("conversations", "collection_id")
