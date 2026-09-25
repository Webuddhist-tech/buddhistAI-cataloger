"""add dedup_active_time

Revision ID: 9d4e1f7a2b30
Revises: 6c9b8c81197e
Create Date: 2026-09-25

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "9d4e1f7a2b30"
down_revision: Union[str, None] = "6c9b8c81197e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dedup_active_time",
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("dedup_items.item_id"), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_dedup_active_time_user_id", "dedup_active_time", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_dedup_active_time_user_id", table_name="dedup_active_time")
    op.drop_table("dedup_active_time")
