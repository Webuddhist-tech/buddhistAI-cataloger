"""Database access for the dedup tables. No HTTP, no BDRC calls."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from typing import Any, Iterable, Optional

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from dedup.models.dedup import (
    MAX_ATTEMPTS,
    RETRY_BACKOFF_SECONDS,
    SYNC_FAILED,
    SYNC_PENDING,
    SYNC_RUNNING,
    SYNC_SUCCEEDED,
    SYNC_SUPERSEDED,
    DedupActiveTime,
    DedupAssignment,
    DedupDecision,
    DedupItem,
)


def evidence_hash(evidence: dict[str, Any]) -> str:
    canonical = json.dumps(evidence, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# --- items -------------------------------------------------------------------

def upsert_item(db: Session, bdrc_item: dict[str, Any]) -> None:
    """Store a copy of a BDRC review item. An existing copy is kept as it was first seen."""
    evidence = bdrc_item.get("evidence") or {}
    stmt = insert(DedupItem).values(
        item_id=bdrc_item["item_id"],
        batch_id=bdrc_item["batch_id"],
        kind=bdrc_item.get("kind") or "pair",
        subject=bdrc_item.get("subject") or {},
        evidence=evidence,
        evidence_hash=evidence_hash(evidence),
        fetched_at=datetime.utcnow(),
    ).on_conflict_do_nothing(index_elements=["item_id"])
    db.execute(stmt)


def get_item(db: Session, item_id: int) -> Optional[DedupItem]:
    return db.get(DedupItem, item_id)


def get_items(db: Session, item_ids: Iterable[int]) -> dict[int, DedupItem]:
    ids = list(item_ids)
    if not ids:
        return {}
    rows = db.execute(select(DedupItem).where(DedupItem.item_id.in_(ids))).scalars().all()
    return {r.item_id: r for r in rows}


# --- assignments ---------------------------------------------------------------

def assigned_item_ids(db: Session, item_ids: Iterable[int]) -> set[int]:
    ids = list(item_ids)
    if not ids:
        return set()
    rows = db.execute(
        select(DedupAssignment.item_id).where(DedupAssignment.item_id.in_(ids))
    ).scalars().all()
    return set(rows)


def try_assign(db: Session, *, item_id: int, batch_id: str, user_id: str, assigned_by: str) -> bool:
    """Assign an item if nobody holds it yet. Returns False if someone else got it first.

    The unique constraint on ``item_id`` makes this safe when two annotators claim at
    the same moment: exactly one insert wins.
    """
    stmt = (
        insert(DedupAssignment)
        .values(
            item_id=item_id,
            batch_id=batch_id,
            user_id=user_id,
            assigned_by=assigned_by,
            assigned_at=datetime.utcnow(),
        )
        .on_conflict_do_nothing(constraint="uq_dedup_assignments_item_id")
        .returning(DedupAssignment.id)
    )
    return db.execute(stmt).first() is not None


def get_assignment(db: Session, item_id: int, *, lock: bool = False) -> Optional[DedupAssignment]:
    q = select(DedupAssignment).where(DedupAssignment.item_id == item_id)
    if lock:  # serializes a save against an admin moving the same item
        q = q.with_for_update()
    return db.execute(q).scalar_one_or_none()


def user_assignments(
    db: Session, user_id: str, batch_id: Optional[str] = None, *, state: str = "all"
) -> list[DedupAssignment]:
    """``state``: ``open`` (not completed), ``done`` (completed) or ``all``. Oldest first.
    ``batch_id`` None means every batch."""
    q = select(DedupAssignment).where(DedupAssignment.user_id == user_id)
    if batch_id is not None:
        q = q.where(DedupAssignment.batch_id == batch_id)
    if state == "open":
        q = q.where(DedupAssignment.completed_at.is_(None))
    elif state == "done":
        q = q.where(DedupAssignment.completed_at.is_not(None))
    return list(db.execute(q.order_by(DedupAssignment.item_id)).scalars().all())


def user_counts_by_batch(db: Session, user_id: str) -> dict[str, dict[str, int]]:
    """``{batch_id: {"open": n, "done": n}}`` for one user."""
    rows = db.execute(
        select(
            DedupAssignment.batch_id,
            func.count().filter(DedupAssignment.completed_at.is_(None)),
            func.count().filter(DedupAssignment.completed_at.is_not(None)),
        )
        .where(DedupAssignment.user_id == user_id)
        .group_by(DedupAssignment.batch_id)
    ).all()
    return {b: {"open": o, "done": d} for b, o, d in rows}


def add_active_seconds(db: Session, item_id: int, user_id: str, seconds: int) -> bool:
    """Add time to this user's total for the pair, only while the pair is theirs. The
    add happens in the database, so visits sent at the same moment are both counted."""
    holds = db.execute(
        select(DedupAssignment.id).where(DedupAssignment.item_id == item_id, DedupAssignment.user_id == user_id)
    ).first()
    if holds is None:
        return False
    stmt = insert(DedupActiveTime).values(
        item_id=item_id, user_id=user_id, seconds=seconds, updated_at=datetime.utcnow()
    )
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=["item_id", "user_id"],
            set_={"seconds": DedupActiveTime.seconds + stmt.excluded.seconds, "updated_at": stmt.excluded.updated_at},
        )
    )
    return True


def active_seconds(db: Session, user_id: Optional[str] = None) -> dict[tuple[int, str], int]:
    """``{(item_id, user_id): seconds}``, for one user or everyone."""
    q = select(DedupActiveTime.item_id, DedupActiveTime.user_id, DedupActiveTime.seconds)
    if user_id is not None:
        q = q.where(DedupActiveTime.user_id == user_id)
    return {(i, u): s for i, u, s in db.execute(q).all()}


def mark_opened(db: Session, assignment: DedupAssignment) -> None:
    if assignment.first_opened_at is None:
        assignment.first_opened_at = datetime.utcnow()


# --- decisions -----------------------------------------------------------------

def latest_decision(db: Session, item_id: int) -> Optional[DedupDecision]:
    return db.execute(
        select(DedupDecision)
        .where(DedupDecision.item_id == item_id)
        .order_by(DedupDecision.decided_at.desc(), DedupDecision.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def latest_decisions(db: Session, item_ids: Iterable[int]) -> dict[int, DedupDecision]:
    ids = list(item_ids)
    if not ids:
        return {}
    rows = db.execute(
        select(DedupDecision)
        .where(DedupDecision.item_id.in_(ids))
        .order_by(DedupDecision.item_id, DedupDecision.decided_at.desc(), DedupDecision.created_at.desc())
    ).scalars().all()
    out: dict[int, DedupDecision] = {}
    for d in rows:
        out.setdefault(d.item_id, d)
    return out


def add_decision(db: Session, decision: DedupDecision) -> DedupDecision:
    """Append a decision and retire older unsent ones for the same item.

    BDRC keeps one value per item, so only the newest decision needs pushing; an older
    one still waiting would otherwise overwrite it if it happened to be sent later.
    """
    db.query(DedupDecision).filter(
        DedupDecision.item_id == decision.item_id,
        DedupDecision.sync_state == SYNC_PENDING,
    ).update({DedupDecision.sync_state: SYNC_SUPERSEDED}, synchronize_session=False)
    db.add(decision)
    return decision


# --- sync queue ------------------------------------------------------------------

def claim_next_decision(db: Session) -> Optional[DedupDecision]:
    """Atomically take the oldest due pending decision and mark it running."""
    row = db.execute(
        text(
            """
            SELECT id FROM dedup_decisions
            WHERE sync_state = :pending
              AND (next_attempt_at IS NULL OR next_attempt_at <= :now)
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
            """
        ),
        {"pending": SYNC_PENDING, "now": datetime.utcnow()},
    ).first()
    if row is None:
        db.commit()
        return None
    decision = db.get(DedupDecision, row[0])
    decision.sync_state = SYNC_RUNNING
    decision.sync_attempts += 1
    db.commit()
    return decision


def mark_synced(db: Session, decision_id: str) -> None:
    d = db.get(DedupDecision, decision_id)
    if d is None:
        return
    d.sync_state = SYNC_SUCCEEDED
    d.synced_at = datetime.utcnow()
    d.last_error = None
    d.next_attempt_at = None
    db.commit()


def mark_sync_failed(db: Session, decision_id: str, error: str, *, retriable: bool = False) -> None:
    """Schedule the next try.

    ``retriable`` (BDRC unreachable or erroring on its side): keep trying, every 6 hours
    once the backoff schedule is used up, until it is delivered. Otherwise (BDRC
    rejected the answer) give up after the schedule: retrying cannot fix it.
    """
    d = db.get(DedupDecision, decision_id)
    if d is None:
        return
    d.last_error = error[:2000]
    if not retriable and d.sync_attempts >= MAX_ATTEMPTS:
        d.sync_state = SYNC_FAILED
        d.next_attempt_at = None
    else:
        delay = RETRY_BACKOFF_SECONDS[min(d.sync_attempts - 1, len(RETRY_BACKOFF_SECONDS) - 1)]
        d.sync_state = SYNC_PENDING
        d.next_attempt_at = datetime.utcnow() + timedelta(seconds=delay)
    db.commit()


def requeue_stale_running(db: Session, older_than_minutes: int = 30) -> int:
    """Return decisions orphaned by a restart mid-push to pending, so they are retried."""
    cutoff = datetime.utcnow() - timedelta(minutes=older_than_minutes)
    stale = (
        db.query(DedupDecision)
        .filter(DedupDecision.sync_state == SYNC_RUNNING, DedupDecision.updated_at < cutoff)
        .all()
    )
    for d in stale:
        d.sync_state = SYNC_PENDING
        d.next_attempt_at = None
        d.last_error = "Requeued: worker stopped mid-push"
    if stale:
        db.commit()
    return len(stale)


def sync_health(db: Session, limit: int = 50) -> dict[str, Any]:
    counts = dict(
        db.execute(
            select(DedupDecision.sync_state, func.count()).group_by(DedupDecision.sync_state)
        ).all()
    )
    failed = db.execute(
        select(DedupDecision)
        .where(DedupDecision.sync_state == SYNC_FAILED)
        .order_by(DedupDecision.updated_at.desc())
        .limit(limit)
    ).scalars().all()
    return {
        "counts": counts,
        "failed": [
            {
                "decision_id": d.id,
                "item_id": d.item_id,
                "user_id": d.user_id,
                "attempts": d.sync_attempts,
                "last_error": d.last_error,
                "updated_at": d.updated_at.isoformat() if d.updated_at else None,
            }
            for d in failed
        ],
    }


# --- admin -----------------------------------------------------------------------

def assignment_counts_by_batch(db: Session) -> dict[str, dict[str, int]]:
    """``{batch_id: {"assigned": n, "done": n}}`` across all annotators."""
    rows = db.execute(
        select(
            DedupAssignment.batch_id,
            func.count(),
            func.count().filter(DedupAssignment.completed_at.is_not(None)),
        ).group_by(DedupAssignment.batch_id)
    ).all()
    return {b: {"assigned": n, "done": d} for b, n, d in rows}


def latest_decision_per_item(db: Session) -> list[DedupDecision]:
    """The current decision of every decided item (older superseded rows ignored)."""
    ranked = (
        select(
            DedupDecision.id,
            func.row_number()
            .over(
                partition_by=DedupDecision.item_id,
                order_by=(DedupDecision.decided_at.desc(), DedupDecision.created_at.desc()),
            )
            .label("rn"),
        )
    ).subquery()
    return list(
        db.execute(
            select(DedupDecision).join(ranked, ranked.c.id == DedupDecision.id).where(ranked.c.rn == 1)
        ).scalars().all()
    )


def last_decision_by_user(db: Session) -> dict[str, datetime]:
    """Each annotator's latest saved answer (changing an answer counts as activity)."""
    rows = db.execute(
        select(DedupDecision.user_id, func.max(DedupDecision.decided_at)).group_by(DedupDecision.user_id)
    ).all()
    return {u: t for u, t in rows}


def all_assignments(db: Session) -> list[DedupAssignment]:
    return list(db.execute(select(DedupAssignment)).scalars().all())


def reassign(db: Session, item_ids: list[int], to_user_id: str, admin_id: str) -> tuple[list[int], list[int]]:
    """Move unfinished items to another annotator. Returns (moved, skipped).

    Finished items are skipped: their decision belongs to whoever made it. The opened
    time is reset so time spent is measured for the new annotator.
    """
    rows = db.execute(
        select(DedupAssignment).where(DedupAssignment.item_id.in_(item_ids)).with_for_update()
    ).scalars().all()
    now = datetime.utcnow()
    moved, skipped = [], []
    for a in rows:
        if a.completed_at is not None:
            skipped.append(a.item_id)
            continue
        a.user_id = to_user_id
        a.assigned_by = admin_id
        a.assigned_at = now
        a.first_opened_at = None
        moved.append(a.item_id)
    skipped += [i for i in item_ids if i not in {a.item_id for a in rows}]
    return moved, skipped


def release(db: Session, item_ids: list[int]) -> tuple[list[int], list[int]]:
    """Return unfinished items to the pool (anyone's next claim can take them)."""
    rows = db.execute(
        select(DedupAssignment).where(DedupAssignment.item_id.in_(item_ids)).with_for_update()
    ).scalars().all()
    moved, skipped = [], []
    for a in rows:
        if a.completed_at is not None:
            skipped.append(a.item_id)
            continue
        db.delete(a)
        moved.append(a.item_id)
    skipped += [i for i in item_ids if i not in {a.item_id for a in rows}]
    return moved, skipped
