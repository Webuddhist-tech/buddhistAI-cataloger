"""Admin views of dedup work: progress, per-annotator throughput and agreement,
reassigning annotator slots and adjudications."""
from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from dedup import client
from dedup.client import ReviewApiError
from dedup.controller.adjudication import annotations
from dedup.controller.dedup import _views_for, bdrc_error
from dedup.deps import can_adjudicate, can_annotate, has_dedup_access
from dedup.models.dedup import DedupAssignment
from dedup.repository import dedup_repository as repo
from dedup.schemas import (
    AdjudicationReassignIn,
    AdminAdjudicationOut,
    AdminBatchOut,
    AdminOverviewOut,
    AnnotatorOut,
    DoubleReviewCounts,
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
        double_review=DoubleReviewCounts(
            **repo.double_review_counts(db),
            resolutions=dict(Counter(a.resolution for a in repo.all_adjudications(db) if a.resolution)),
        ),
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
    disputed = {a.item_id for a in repo.all_adjudications(db)}
    paired: Counter[str] = Counter()
    agreed: Counter[str] = Counter()
    for item_id, uids in repo.answered_pairs(db):
        for uid in uids:
            paired[uid] += 1
            agreed[uid] += item_id not in disputed
    adjudicated = Counter(a.user_id for a in repo.all_adjudications(db) if a.completed_at)
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
                role=(u.role or "").strip().lower() or None,
                has_access=has_dedup_access(u),
                total_active_seconds=total_by_user.get(uid, 0),
                avg_active_seconds=sum(answered_time) / len(answered_time) if answered_time else None,
                last_active=max(stamps) if stamps else None,
                paired=paired[uid],
                agreed=agreed[uid],
                adjudicated=adjudicated[uid],
            )
        )
    out.sort(key=lambda r: (-r.assigned, (r.name or r.email or "").lower()))
    return out


def annotator_items(db: Session, user_id: str, state: str) -> list[ItemOut]:
    return _views_for(db, repo.user_assignments(db, user_id, None, state=state))


def reassign(db: Session, admin: User, body: ReassignIn) -> ReassignOut:
    ids = list(dict.fromkeys(body.item_ids))
    if body.to_user_id is None:
        moved, skipped = repo.release(db, ids, body.from_user_id)
        action = "released"
    else:
        target: Optional[User] = db.get(User, body.to_user_id)
        if target is None or not has_dedup_access(target):
            raise HTTPException(status_code=400, detail="That user does not have access to the Deduplicator")
        if not can_annotate(target):
            raise HTTPException(status_code=400, detail="Adjudicators do not take annotation work")
        moved, skipped = repo.reassign(db, ids, target.id, admin.id, body.from_user_id)
        action = f"reassigned to {target.id}"
    db.commit()
    logger.info("dedup admin=%s %s items=%s skipped=%s", admin.id, action, moved, skipped)
    return ReassignOut(moved=moved, skipped=skipped)


# --- adjudication ------------------------------------------------------------------

def adjudications(db: Session, state: str = "all") -> list[AdminAdjudicationOut]:
    """Every disputed pair, with both answers and who gave them."""
    rows = repo.all_adjudications(db)
    if state == "open":
        rows = [a for a in rows if a.completed_at is None]
    elif state == "done":
        rows = [a for a in rows if a.completed_at is not None]
    ids = [a.item_id for a in rows]
    items = repo.get_items(db, ids)
    answers = repo.annotator_answers_for(db, ids)
    finals = repo.latest_adjudicator_decisions(db, ids)
    names = {
        u.id: u.name or u.email
        for u in db.execute(select(User).where(User.id.in_({a.user_id for a in rows if a.user_id}))).scalars()
    }
    return [
        AdminAdjudicationOut(
            item_id=a.item_id,
            batch_id=items[a.item_id].batch_id,
            title_a=((items[a.item_id].evidence or {}).get("a") or {}).get("title_bo"),
            title_b=((items[a.item_id].evidence or {}).get("b") or {}).get("title_bo"),
            created_at=a.created_at,
            adjudicator_id=a.user_id,
            adjudicator_name=names.get(a.user_id),
            reserved_at=a.reserved_at,
            completed_at=a.completed_at,
            resolution=a.resolution,
            verdict=finals[a.item_id].verdict if a.item_id in finals else None,
            annotations=annotations(a.item_id, answers[a.item_id]),
        )
        for a in rows
        if a.item_id in items
    ]


def reassign_adjudications(db: Session, admin: User, body: AdjudicationReassignIn) -> ReassignOut:
    """Hand unsettled disputed pairs to another adjudicator, or back to the queue.
    A pair is skipped if it is settled or the target annotated it."""
    target: Optional[User] = None
    if body.to_user_id is not None:
        target = db.get(User, body.to_user_id)
        if target is None or not can_adjudicate(target):
            raise HTTPException(status_code=400, detail="That user is not an adjudicator")
    moved, skipped = [], []
    now = datetime.utcnow()
    for item_id in dict.fromkeys(body.item_ids):
        adj = repo.get_adjudication(db, item_id, lock=True)
        if adj is None or adj.completed_at is not None or (
            target is not None and repo.get_assignment(db, item_id, target.id) is not None
        ):
            skipped.append(item_id)
            continue
        adj.user_id = target.id if target else None
        adj.reserved_at = now if target else None
        adj.first_opened_at = None
        moved.append(item_id)
    db.commit()
    logger.info("dedup admin=%s adjudications to=%s items=%s skipped=%s", admin.id, body.to_user_id, moved, skipped)
    return ReassignOut(moved=moved, skipped=skipped)
