"""dedup settings: review mode for new pairs

``dedup_settings`` holds tool-wide settings an admin changes from the Deduplicator
admin page. The first is ``review_mode`` (``single`` | ``double``): how pairs handed
out from now on are reviewed. No row means the default, double review.

Revision ID: c4f8e2b7d913
Revises: b3e7d5a91c42
Create Date: 2026-10-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4f8e2b7d913"
down_revision: Union[str, None] = "b3e7d5a91c42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dedup_settings",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("value", sa.String(), nullable=False),
        sa.Column("updated_by", sa.String(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("dedup_settings")
