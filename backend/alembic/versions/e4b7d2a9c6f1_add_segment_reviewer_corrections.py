"""track reviewer-added segments and reviewer corrections

Reviewers can now split/merge an annotator's segments themselves instead of rejecting.
- outliner_segments.created_by_id: who created the segment. NULL (all existing rows) means
  the document's annotator; a reviewer id means the reviewer added it and is credited for it.
- outliner_segments.corrected_by_reviewer: the annotator's segment was split/merged by the
  reviewer. Counted as an edit on the annotator's approved segment.
- segment_rejections.reviewer_title / reviewer_author: the reviewer's title/author suggestion
  at reject time, kept for the annotator after the segment's own copy is cleared.

Revision ID: e4b7d2a9c6f1
Revises: d7a3c1e9b524
Create Date: 2026-10-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e4b7d2a9c6f1"
down_revision: Union[str, None] = "d7a3c1e9b524"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "outliner_segments",
        sa.Column(
            "created_by_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "outliner_segments",
        sa.Column(
            "corrected_by_reviewer",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "segment_rejections",
        sa.Column("reviewer_title", sa.String(), nullable=True),
    )
    op.add_column(
        "segment_rejections",
        sa.Column("reviewer_author", sa.String(), nullable=True),
    )
    # Built concurrently so annotators' saves are not blocked while it builds
    # (CONCURRENTLY cannot run inside a transaction).
    with op.get_context().autocommit_block():
        op.create_index(
            "ix_outliner_segments_created_by_id",
            "outliner_segments",
            ["created_by_id"],
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            "ix_outliner_segments_created_by_id",
            table_name="outliner_segments",
            postgresql_concurrently=True,
            if_exists=True,
        )
    op.drop_column("segment_rejections", "reviewer_author")
    op.drop_column("segment_rejections", "reviewer_title")
    op.drop_column("outliner_segments", "corrected_by_reviewer")
    op.drop_column("outliner_segments", "created_by_id")
