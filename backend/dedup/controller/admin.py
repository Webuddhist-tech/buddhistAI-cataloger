"""Admin views of dedup work: progress, per-annotator throughput, reassigning."""
from __future__ import annotations

import logging
from collections import Counter
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from dedup import client
from dedup.client import ReviewApiError
from dedup.controller.dedup import _views_for, bdrc_error
from dedup.deps import has_dedup_access
from dedup.models.dedup import DedupAssignment
from dedup.repository import dedup_repository as repo
from dedup.schemas import (
    AdminBatchOut,
    AdminOverviewOut,
    AnnotatorOut,
    ItemOut,
    ReassignIn,
    ReassignOut,
    SyncHealthOut,
    WorkCounts,
)
from user.models.user import User

logger = logging.getLogger(__name__)


def _state(a: DedupAssignment) -> str:
    if a.completed_at is not None:
        return "done"
    return "in_progress" if a.first_opened_at is not None else "not_started"


def _counts(assignments: list[DedupAssignment]) -> WorkCounts:
    c = Counter(_state(a) for a in assignments)
    return WorkCounts(assigned=len(assignments), done=c["done"], in_progress=c["in_progress"], not_started=c["not_started"])


def overview(db: Session) -> AdminOverviewOut:
    try:
        batches = client.list_batches()
        stats = client.batch_stats()
    except ReviewApiError as exc:
        raise bdrc_error(exc) from exc
    ours = repo.assignment_counts_by_batch(db)
    decisions = repo.latest_decision_per_item(db)

    verdicts = Counter(d.verdict for d in decisions if d.verdict)
    reasons = Counter(d.abstention_reason for d in decisions if d.abstention_reason)
    issues = Counter(i.get("kind") for d in decisions for i in (d.issues or []) if i.get("kind"))

    return AdminOverviewOut(
        totals=_counts(repo.all_assignments(db)),
        batches=[
            AdminBatchOut(
                batch_id=b["batch_id"],
                n_items=b.get("n_items") or 0,
                created_at=b.get("created_at"),
                status_counts=stats.get(b["batch_id"], {}),
                assigned=ours.get(b["batch_id"], {}).get("assigned", 0),
                assigned_done=ours.get(b["batch_id"], {}).get("done", 0),
            )
            for b in sorted(batches, key=lambda b: (b.get("created_at") or "", b["batch_id"]))
        ],
        verdicts=dict(verdicts),
        abstention_reasons=dict(reasons),
        issues=dict(issues),
        sync=SyncHealthOut(**repo.sync_health(db)),
    )


def _dedup_users(db: Session) -> list[User]:
    rows = db.execute(select(User).where(User.permissions.ilike("%dedup%"))).scalars().all()
    return [u for u in rows if has_dedup_access(u)]


def annotators(db: Session) -> list[AnnotatorOut]:
    """Everyone with dedup access, plus anyone still holding items after losing it."""
    by_user: dict[str, list[DedupAssignment]] = {}
    for a in repo.all_assignments(db):
        by_user.setdefault(a.user_id, []).append(a)

    last_answer = repo.last_decision_by_user(db)
    time = repo.active_seconds(db)
    total_by_user: dict[str, int] = {}
    for (_, u), s in time.items():
        total_by_user[u] = total_by_user.get(u, 0) + s
    users = {u.id: u for u in _dedup_users(db)}
    missing = (set(by_user) | set(total_by_user)) - set(users)
    if missing:
        users.update({u.id: u for u in db.execute(select(User).where(User.id.in_(missing))).scalars()})

    out = []
    for uid, u in users.items():
        mine = by_user.get(uid, [])
        # Includes time on pairs later moved to someone else: it was still this person's work.
        answered_time = [time[(a.item_id, uid)] for a in mine if a.completed_at and time.get((a.item_id, uid))]
        stamps = [t for a in mine for t in (a.assigned_at, a.first_opened_at, a.completed_at) if t]
        if uid in last_answer:
            stamps.append(last_answer[uid])
        out.append(
            AnnotatorOut(
                **_counts(mine).model_dump(),
                user_id=uid,
                name=u.name,
                email=u.email,
                picture=u.picture,
                has_access=has_dedup_access(u),
                total_active_seconds=total_by_user.get(uid, 0),
                avg_active_seconds=sum(answered_time) / len(answered_time) if answered_time else None,
                last_active=max(stamps) if stamps else None,
            )
        )
    out.sort(key=lambda r: (-r.assigned, (r.name or r.email or "").lower()))
    return out


def annotator_items(db: Session, user_id: str, state: str) -> list[ItemOut]:
    return _views_for(db, repo.user_assignments(db, user_id, None, state=state))


def reassign(db: Session, admin: User, body: ReassignIn) -> ReassignOut:
    ids = list(dict.fromkeys(body.item_ids))
    if body.to_user_id is None:
        moved, skipped = repo.release(db, ids)
        action = "released"
    else:
        target: Optional[User] = db.get(User, body.to_user_id)
        if target is None or not has_dedup_access(target):
            raise HTTPException(status_code=400, detail="That user does not have access to the Deduplicator")
        moved, skipped = repo.reassign(db, ids, target.id, admin.id)
        action = f"reassigned to {target.id}"
    db.commit()
    logger.info("dedup admin=%s %s items=%s skipped=%s", admin.id, action, moved, skipped)
    return ReassignOut(moved=moved, skipped=skipped)
