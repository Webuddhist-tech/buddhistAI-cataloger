"""Deduplicator admin set by users.dedup_role

Deduplicator admins no longer follow the Outliner role: users.dedup_role = 'admin' makes
someone an admin in the Deduplicator, and an Outliner admin is not one unless set so.

Data only. Keeps today's dedup admins: Outliner admins who have the dedup permission.

Revision ID: a7d3e9f1c5b2
Revises: f2c8a4d6e1b3
Create Date: 2026-10-13

"""
from typing import Sequence, Union

from alembic import op

revision: str = "a7d3e9f1c5b2"
down_revision: Union[str, None] = "f2c8a4d6e1b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE users SET dedup_role = 'admin' "
        "WHERE lower(trim(role)) = 'admin' AND permissions LIKE '%dedup%'"
    )


def downgrade() -> None:
    op.execute("UPDATE users SET dedup_role = NULL WHERE dedup_role = 'admin'")
