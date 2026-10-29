"""add outline_fix_works and outline_fix_edits (Outline Fixer)

One row per BDRC work imported from an outline.csv + issue.json pair, and one row per
outline segment an annotator corrected. New tables only; no existing data changes.

Revision ID: a7c3e9f1b2d4
Revises: c5e8a2f4d071
Create Date: 2026-10-28

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7c3e9f1b2d4"
down_revision: Union[str, None] = "c5e8a2f4d071"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "outline_fix_works",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("w_id", sa.String(), nullable=False, unique=True),
        sa.Column("batch_id", sa.String(), nullable=False),
        sa.Column("outline_header", sa.JSON(), nullable=False),
        sa.Column("outline_rows", sa.JSON(), nullable=False),
        sa.Column("issues", sa.JSON(), nullable=False),
        sa.Column("issue_meta", sa.JSON(), nullable=False),
        sa.Column("issue_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("assigned_to", sa.String(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("assigned_by", sa.String(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("assigned_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("imported_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_outline_fix_works_batch_id", "outline_fix_works", ["batch_id"])
    op.create_index("ix_outline_fix_works_status", "outline_fix_works", ["status"])
    op.create_index("ix_outline_fix_works_assigned_to", "outline_fix_works", ["assigned_to"])

    op.create_table(
        "outline_fix_edits",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "work_id",
            sa.String(),
            sa.ForeignKey("outline_fix_works.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rid", sa.String(), nullable=False),
        sa.Column("img_start", sa.Integer(), nullable=True),
        sa.Column("img_end", sa.Integer(), nullable=True),
        sa.Column("vol_start", sa.Integer(), nullable=True),
        sa.Column("vol_end", sa.Integer(), nullable=True),
        sa.Column("part_type", sa.String(), nullable=True),
        sa.Column("edited_by", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("work_id", "rid", name="uq_outline_fix_edits_work_rid"),
    )
    op.create_index("ix_outline_fix_edits_work_id", "outline_fix_edits", ["work_id"])


def downgrade() -> None:
    op.drop_index("ix_outline_fix_edits_work_id", table_name="outline_fix_edits")
    op.drop_table("outline_fix_edits")
    op.drop_index("ix_outline_fix_works_assigned_to", table_name="outline_fix_works")
    op.drop_index("ix_outline_fix_works_status", table_name="outline_fix_works")
    op.drop_index("ix_outline_fix_works_batch_id", table_name="outline_fix_works")
    op.drop_table("outline_fix_works")
