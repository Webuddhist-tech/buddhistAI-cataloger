"""separate Deduplicator role per user

users.dedup_role: the user's role in the Deduplicator, apart from users.role (the
Outliner's), so someone can review outlines and annotate dedup pairs. "annotator" or
"reviewer" (Adjudicator); NULL means annotator. Admins stay admins in both tools.

Backfill keeps everyone's current dedup access: until now the dedup tool read users.role,
so reviewers were its adjudicators and everyone else an annotator.

Revision ID: f2c8a4d6e1b3
Revises: e4b7d2a9c6f1
Create Date: 2026-10-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f2c8a4d6e1b3"
down_revision: Union[str, None] = "e4b7d2a9c6f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("dedup_role", sa.String(), nullable=True))
    op.execute("UPDATE users SET dedup_role = 'reviewer' WHERE lower(trim(role)) = 'reviewer'")


def downgrade() -> None:
    op.drop_column("users", "dedup_role")
