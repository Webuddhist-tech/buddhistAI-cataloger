"""dedup double review: two annotator slots per pair, adjudication of disagreements

* ``dedup_items.review_mode``      ``single`` (claimed before double review) or ``double``
* ``dedup_assignments.slot``       1 or 2; unique per (item, slot) and per (item, user)
* ``dedup_decisions.role``         ``annotator`` or ``adjudicator``
* ``dedup_decisions.note``         the adjudicator's note
* ``dedup_decisions.is_final``     the answer BDRC gets (annotator answers on double
                                   pairs stay local, sync_state ``local``)
* ``dedup_adjudications``          one row per pair whose two answers disagree

Existing rows keep their single-review meaning: items ``single``, assignments slot 1,
decisions final.

Revision ID: b3e7d5a91c42
Revises: 9d4e1f7a2b30
Create Date: 2026-09-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b3e7d5a91c42"
down_revision: Union[str, None] = "9d4e1f7a2b30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Backfill existing items as single review, then default new ones to double.
    op.add_column("dedup_items", sa.Column("review_mode", sa.String(), nullable=False, server_default="single"))
    op.alter_column("dedup_items", "review_mode", server_default="double")

    op.add_column("dedup_assignments", sa.Column("slot", sa.Integer(), nullable=False, server_default="1"))
    op.drop_constraint("uq_dedup_assignments_item_id", "dedup_assignments", type_="unique")
    op.create_unique_constraint("uq_dedup_assignments_item_slot", "dedup_assignments", ["item_id", "slot"])
    op.create_unique_constraint("uq_dedup_assignments_item_user", "dedup_assignments", ["item_id", "user_id"])
    op.create_check_constraint("ck_dedup_assignments_slot", "dedup_assignments", "slot IN (1, 2)")

    op.add_column("dedup_decisions", sa.Column("role", sa.String(), nullable=False, server_default="annotator"))
    op.add_column("dedup_decisions", sa.Column("note", sa.Text(), nullable=True))
    op.add_column("dedup_decisions", sa.Column("is_final", sa.Boolean(), nullable=False, server_default=sa.true()))

    op.create_table(
        "dedup_adjudications",
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("dedup_items.item_id"), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reserved_at", sa.DateTime(), nullable=True),
        sa.Column("first_opened_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("resolution", sa.String(), nullable=True),
    )
    op.create_index("ix_dedup_adjudications_user_id", "dedup_adjudications", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_dedup_adjudications_user_id", table_name="dedup_adjudications")
    op.drop_table("dedup_adjudications")

    op.drop_column("dedup_decisions", "is_final")
    op.drop_column("dedup_decisions", "note")
    op.drop_column("dedup_decisions", "role")

    # Fails if any pair has two annotators: single review cannot hold them.
    op.drop_constraint("ck_dedup_assignments_slot", "dedup_assignments", type_="check")
    op.drop_constraint("uq_dedup_assignments_item_user", "dedup_assignments", type_="unique")
    op.drop_constraint("uq_dedup_assignments_item_slot", "dedup_assignments", type_="unique")
    op.create_unique_constraint("uq_dedup_assignments_item_id", "dedup_assignments", ["item_id"])
    op.drop_column("dedup_assignments", "slot")

    op.drop_column("dedup_items", "review_mode")
