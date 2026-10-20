"""outliner work groups replace the single active batch

* ``outliner_groups``            a named group linked to one BDRC volume batch
* ``outliner_group_members``     users in a group (a user may be in several)
* ``outliner_documents.group_id`` / ``batch_id``  where an assigned volume came from;
  NULL on existing documents (any reviewer can review those until
  scripts/backfill_document_groups.py tags them)

So nothing changes on deploy, the current active batch becomes a "Default" group with
every outliner user in it. ``active_batch`` is left in place, unused, so code still
running from before this migration keeps working; drop it in a later migration.

Revision ID: b9d4e6a1c3f7
Revises: a7d3e9f1c5b2
Create Date: 2026-10-16

"""
from datetime import datetime
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op

revision: str = "b9d4e6a1c3f7"
down_revision: Union[str, None] = "a7d3e9f1c5b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "outliner_groups",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
        sa.Column("batch_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "outliner_group_members",
        sa.Column(
            "group_id",
            sa.String(),
            sa.ForeignKey("outliner_groups.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("added_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_outliner_group_members_user_id", "outliner_group_members", ["user_id"])

    op.add_column(
        "outliner_documents",
        sa.Column(
            "group_id",
            sa.String(),
            sa.ForeignKey("outliner_groups.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("outliner_documents", sa.Column("batch_id", sa.String(), nullable=True))
    op.create_index("ix_outliner_documents_group_id", "outliner_documents", ["group_id"])

    conn = op.get_bind()
    batch_id = conn.execute(sa.text("SELECT batch_id FROM active_batch ORDER BY id LIMIT 1")).scalar()
    group_id = str(uuid.uuid4())
    now = datetime.utcnow()
    conn.execute(
        sa.text(
            "INSERT INTO outliner_groups (id, name, batch_id, created_at, updated_at) "
            "VALUES (:id, 'Default', :batch_id, :now, :now)"
        ),
        {"id": group_id, "batch_id": batch_id, "now": now},
    )
    conn.execute(
        sa.text(
            "INSERT INTO outliner_group_members (group_id, user_id, added_at) "
            "SELECT :group_id, id, :now FROM users "
            "WHERE permissions LIKE '%outliner%' "
            "AND lower(trim(role)) IN ('admin', 'reviewer', 'annotator')"
        ),
        {"group_id": group_id, "now": now},
    )


def downgrade() -> None:
    op.drop_index("ix_outliner_documents_group_id", table_name="outliner_documents")
    op.drop_column("outliner_documents", "batch_id")
    op.drop_column("outliner_documents", "group_id")
    op.drop_index("ix_outliner_group_members_user_id", table_name="outliner_group_members")
    op.drop_table("outliner_group_members")
    op.drop_table("outliner_groups")
