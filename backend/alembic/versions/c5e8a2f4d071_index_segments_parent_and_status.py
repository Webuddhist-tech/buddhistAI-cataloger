"""index outliner_segments.parent_segment_id and (document_id, status)

parent_segment_id: deleting a segment (merge, split, reset) makes Postgres find its
children for the ON DELETE SET NULL foreign key, and the ORM loads child_segments the same
way. Unindexed, each delete read the whole segments table.

(document_id, status): document lists and dashboard counts check segment status per
document (EXISTS ... status = ...). With only the document_id index every matching segment
row was read from disk; this lets them be answered from the index.

Together these were most of the disk reads that throttled the 1 GB RDS instance on
2026-10-27. Built concurrently so the table is not locked. Already created by hand on prod
that day, hence if_not_exists. No data changes.

Revision ID: c5e8a2f4d071
Revises: b9d4e6a1c3f7
Create Date: 2026-10-27

"""
from typing import Sequence, Union

from alembic import op

revision: str = "c5e8a2f4d071"
down_revision: Union[str, None] = "b9d4e6a1c3f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEXES = [
    ("ix_outliner_segments_parent_segment_id", ["parent_segment_id"]),
    ("ix_outliner_segments_document_status", ["document_id", "status"]),
]


def upgrade() -> None:
    # CONCURRENTLY cannot run inside a transaction.
    with op.get_context().autocommit_block():
        for name, columns in INDEXES:
            op.create_index(
                name,
                "outliner_segments",
                columns,
                postgresql_concurrently=True,
                if_not_exists=True,
            )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        for name, _ in INDEXES:
            op.drop_index(
                name,
                table_name="outliner_segments",
                postgresql_concurrently=True,
                if_exists=True,
            )
