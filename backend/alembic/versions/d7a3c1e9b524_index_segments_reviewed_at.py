"""index outliner_segments.reviewed_at

Spot checks pick documents reviewed in the last few days; without this index finding
them means reading every segment. Built concurrently so the table is not locked while
annotators and reviewers work. No data changes.

Revision ID: d7a3c1e9b524
Revises: c4f8e2b7d913
Create Date: 2026-10-05

"""
from typing import Sequence, Union

from alembic import op

revision: str = "d7a3c1e9b524"
down_revision: Union[str, None] = "c4f8e2b7d913"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # CONCURRENTLY cannot run inside a transaction.
    with op.get_context().autocommit_block():
        op.create_index(
            "ix_outliner_segments_reviewed_at",
            "outliner_segments",
            ["reviewed_at"],
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            "ix_outliner_segments_reviewed_at",
            table_name="outliner_segments",
            postgresql_concurrently=True,
            if_exists=True,
        )
