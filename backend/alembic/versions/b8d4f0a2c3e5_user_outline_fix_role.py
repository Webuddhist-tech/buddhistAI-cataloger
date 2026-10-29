"""separate Outline Fixer role per user

users.outline_fix_role: the user's role in the Outline Fixer, apart from users.role (the
Outliner's) and users.dedup_role, so being an admin in one tool never makes someone an
admin here. "annotator" or "admin"; NULL means annotator.

Backfill keeps current Outline Fixer admins: until now an admin here was anyone with the
outline_fix permission and role admin.

Revision ID: b8d4f0a2c3e5
Revises: a7c3e9f1b2d4
Create Date: 2026-10-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b8d4f0a2c3e5"
down_revision: Union[str, None] = "a7c3e9f1b2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("outline_fix_role", sa.String(), nullable=True))
    op.execute(
        "UPDATE users SET outline_fix_role = 'admin' "
        "WHERE lower(trim(role)) = 'admin' AND permissions LIKE '%outline_fix%'"
    )


def downgrade() -> None:
    op.drop_column("users", "outline_fix_role")
