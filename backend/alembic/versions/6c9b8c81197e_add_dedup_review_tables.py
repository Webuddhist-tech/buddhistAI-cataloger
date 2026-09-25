"""add dedup review tables

Three new tables for the dedup review tool (the Cataloger's copy of BDRC review items,
who each item is assigned to, and every decision with its sync state). Creates new
tables only; no existing table is altered.

Revision ID: 6c9b8c81197e
Revises: a3e8c91d4f27
"""
from alembic import op
import sqlalchemy as sa


revision = "6c9b8c81197e"
down_revision = "a3e8c91d4f27"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dedup_items",
        sa.Column("item_id", sa.Integer(), autoincrement=False, nullable=False),
        sa.Column("batch_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("subject", sa.JSON(), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("evidence_hash", sa.String(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("item_id"),
    )
    op.create_index("ix_dedup_items_batch_id", "dedup_items", ["batch_id"])

    op.create_table(
        "dedup_assignments",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("assigned_by", sa.String(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(), nullable=False),
        sa.Column("first_opened_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["item_id"], ["dedup_items.item_id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["assigned_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        # One annotator per item (single review). Also what stops two people claiming
        # the same item at the same moment.
        sa.UniqueConstraint("item_id", name="uq_dedup_assignments_item_id"),
    )
    op.create_index("ix_dedup_assignments_batch_id", "dedup_assignments", ["batch_id"])
    op.create_index("ix_dedup_assignments_user_id", "dedup_assignments", ["user_id"])

    op.create_table(
        "dedup_decisions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("verdict", sa.String(), nullable=True),
        sa.Column("abstention_reason", sa.String(), nullable=True),
        sa.Column("confidence", sa.Integer(), nullable=True),
        sa.Column("issues", sa.JSON(), nullable=True),
        sa.Column("partner_payload", sa.JSON(), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=False),
        sa.Column("evidence_hash", sa.String(), nullable=False),
        sa.Column("sync_state", sa.String(), nullable=False),
        sa.Column("sync_attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("synced_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["dedup_items.item_id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dedup_decisions_item_id", "dedup_decisions", ["item_id"])
    op.create_index("ix_dedup_decisions_user_id", "dedup_decisions", ["user_id"])
    op.create_index("ix_dedup_decisions_sync_state", "dedup_decisions", ["sync_state"])


def downgrade() -> None:
    op.drop_index("ix_dedup_decisions_sync_state", table_name="dedup_decisions")
    op.drop_index("ix_dedup_decisions_user_id", table_name="dedup_decisions")
    op.drop_index("ix_dedup_decisions_item_id", table_name="dedup_decisions")
    op.drop_table("dedup_decisions")
    op.drop_index("ix_dedup_assignments_user_id", table_name="dedup_assignments")
    op.drop_index("ix_dedup_assignments_batch_id", table_name="dedup_assignments")
    op.drop_table("dedup_assignments")
    op.drop_index("ix_dedup_items_batch_id", table_name="dedup_items")
    op.drop_table("dedup_items")
