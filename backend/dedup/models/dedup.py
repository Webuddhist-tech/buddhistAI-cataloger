"""ORM models for the dedup review tool.

* ``dedup_items``        a copy of each BDRC review item an annotator has claimed
* ``dedup_assignments``  which annotator an item belongs to (one per item)
* ``dedup_decisions``    every decision, append-only, each with its own sync state

A decision is saved here first and pushed to BDRC by ``dedup.sync_worker``, which
retries while BDRC is unreachable.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base

# Sync states for a decision.
SYNC_PENDING = "pending"
SYNC_RUNNING = "running"
SYNC_SUCCEEDED = "succeeded"
SYNC_FAILED = "failed"
# A newer decision on the same item replaced this one before it was sent; BDRC keeps
# one verdict per item, so only the latest decision is pushed.
SYNC_SUPERSEDED = "superseded"

# Backoff between push attempts, in seconds; a decision that exhausts these is failed.
RETRY_BACKOFF_SECONDS = [60, 300, 900, 3600, 21600]
MAX_ATTEMPTS = len(RETRY_BACKOFF_SECONDS) + 1


def _uuid() -> str:
    return str(uuid.uuid4())


class DedupItem(Base):
    """Copy of one BDRC review item (a pair), taken when it is claimed."""

    __tablename__ = "dedup_items"

    # Same id as BDRC's review_item.item_id, so the two can be matched directly.
    item_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    batch_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String, nullable=False, default="pair")
    subject: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    # sha256 of the evidence as shown, so a decision can be traced to exactly what the
    # annotator saw even if BDRC's copy changes later (plan §5, decision.evidence_hash).
    evidence_hash: Mapped[str] = mapped_column(String, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class DedupAssignment(Base):
    """Which annotator an item belongs to.

    ``item_id`` is unique: one annotator per item. An admin reassigning later updates
    ``user_id`` on the same row; ``assigned_by`` records who handed it out.
    """

    __tablename__ = "dedup_assignments"
    # Named to match the migration; also what stops two people claiming one item.
    __table_args__ = (UniqueConstraint("item_id", name="uq_dedup_assignments_item_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("dedup_items.item_id"), nullable=False)
    batch_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    assigned_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    first_opened_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class DedupActiveTime(Base):
    """Time one annotator spent working on one pair: on screen and in use, summed over
    every visit (idle time is not counted). Kept per person, so a pair moved to someone
    else keeps the first person's time. Task-time measurement for the plan (§10)."""

    __tablename__ = "dedup_active_time"

    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("dedup_items.item_id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), primary_key=True, index=True)
    seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class DedupDecision(Base):
    """One decision on one item. Append-only: changing a verdict adds a new row."""

    __tablename__ = "dedup_decisions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("dedup_items.item_id"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)

    # Exactly the fields sent to BDRC with PUT /review/items/{item_id}.
    status: Mapped[str] = mapped_column(String, nullable=False)
    verdict: Mapped[str | None] = mapped_column(String, nullable=True)
    abstention_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # The full issue list for the item; BDRC's PUT replaces the list, never appends.
    issues: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    partner_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    evidence_hash: Mapped[str] = mapped_column(String, nullable=False)

    # Push to BDRC.
    sync_state: Mapped[str] = mapped_column(String, nullable=False, default=SYNC_PENDING, index=True)
    sync_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
