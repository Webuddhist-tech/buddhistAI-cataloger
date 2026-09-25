"""Dedup review logic: batches, claiming work, reading items, recording decisions."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from dedup import client
from dedup.client import ReviewApiError
from dedup.deps import is_admin
from dedup.models.dedup import DedupAssignment, DedupDecision, DedupItem
from dedup.repository import dedup_repository as repo
from dedup.schemas import AssignmentOut, BatchOut, ClaimOut, DecisionIn, ItemOut
from user.models.user import User

logger = logging.getLogger(__name__)

# Items handed out per claim. An annotator gets more only after finishing these.
CLAIM_SIZE = 10
MAX_CLAIM_SIZE = 50


def bdrc_error(exc: ReviewApiError) -> HTTPException:
    """Pass BDRC's 404 through; anything else is a gateway error on our side."""
    if exc.status_code == 404:
        return HTTPException(status_code=404, detail=str(exc))
    return HTTPException(status_code=502, detail=str(exc))


# --- views -------------------------------------------------------------------------

def _item_view(
    item: DedupItem,
    decision: Optional[DedupDecision],
    assignment: Optional[DedupAssignment],
    active_seconds: int = 0,
) -> ItemOut:
    return ItemOut(
        item_id=item.item_id,
        batch_id=item.batch_id,
        kind=item.kind,
        subject=item.subject,
        evidence=item.evidence,
        status=decision.status if decision else "new",
        verdict=decision.verdict if decision else None,
        abstention_reason=decision.abstention_reason if decision else None,
        confidence=decision.confidence if decision else None,
        issues=decision.issues if decision else None,
        partner_payload=decision.partner_payload if decision else None,
        annotator_id=decision.user_id if decision else None,
        decided_at=decision.decided_at if decision else None,
        sync_state=decision.sync_state if decision else None,
        assignment=(
            AssignmentOut(
                assigned_at=assignment.assigned_at,
                first_opened_at=assignment.first_opened_at,
                completed_at=assignment.completed_at,
                active_seconds=active_seconds,
            )
            if assignment
            else None
        ),
    )


def _views_for(db: Session, assignments: list[DedupAssignment]) -> list[ItemOut]:
    ids = [a.item_id for a in assignments]
    items = repo.get_items(db, ids)
    decisions = repo.latest_decisions(db, ids)
    owners = {a.user_id for a in assignments}
    time = repo.active_seconds(db, next(iter(owners))) if len(owners) == 1 else repo.active_seconds(db)
    return [
        _item_view(items[a.item_id], decisions.get(a.item_id), a, time.get((a.item_id, a.user_id), 0))
        for a in assignments
        if a.item_id in items
    ]


# --- batches -----------------------------------------------------------------------

def list_batches(db: Session, user: User) -> list[BatchOut]:
    try:
        batches = client.list_batches()
        stats = client.batch_stats()
    except ReviewApiError as exc:
        raise bdrc_error(exc) from exc
    mine = repo.user_counts_by_batch(db, user.id)
    return [
        BatchOut(
            batch_id=b["batch_id"],
            kind=b.get("kind") or "pair",
            n_items=b.get("n_items") or 0,
            notes=b.get("notes"),
            created_at=b.get("created_at"),
            status_counts=stats.get(b["batch_id"], {}),
            my_open=mine.get(b["batch_id"], {}).get("open", 0),
            my_done=mine.get(b["batch_id"], {}).get("done", 0),
        )
        for b in batches
    ]


# --- claiming ------------------------------------------------------------------------

def _claim_from_batch(db: Session, user: User, batch_id: str, need: int) -> int:
    """Assign up to ``need`` unclaimed items of ``batch_id`` to the user. Not committed."""
    claimed = 0
    offset = 0
    while claimed < need:
        try:
            # `new` = untouched in BDRC. Items this tool has handed out but that are not
            # decided yet are still `new` there, so they are skipped via our own table.
            page = client.list_items(batch_id, status="new", offset=offset, limit=client.MAX_PAGE)
        except ReviewApiError as exc:
            db.rollback()
            raise bdrc_error(exc) from exc
        rows = page.get("items") or []
        if not rows:
            break
        taken = repo.assigned_item_ids(db, (r["item_id"] for r in rows))
        for row in rows:
            if claimed >= need:
                break
            if row["item_id"] in taken:
                continue
            repo.upsert_item(db, row)
            if repo.try_assign(
                db, item_id=row["item_id"], batch_id=batch_id, user_id=user.id, assigned_by=user.id
            ):
                claimed += 1
        offset += len(rows)
        if offset >= (page.get("total") or 0):
            break
    return claimed


def _batches_oldest_first() -> list[str]:
    try:
        batches = client.list_batches()
    except ReviewApiError as exc:
        raise bdrc_error(exc) from exc
    batches.sort(key=lambda b: (b.get("created_at") or "", b["batch_id"]))
    return [b["batch_id"] for b in batches]


def claim_items(
    db: Session, user: User, batch_id: Optional[str] = None, size: int = CLAIM_SIZE
) -> ClaimOut:
    """Hand the user their next ``size`` unclaimed items.

    Without ``batch_id`` they come from the oldest batch with unclaimed items, running
    into the next batch if it empties mid-claim. A user who still has unfinished items
    gets those back instead.
    """
    size = max(1, min(size, MAX_CLAIM_SIZE))
    open_now = repo.user_assignments(db, user.id, batch_id, state="open")
    if open_now:
        return ClaimOut(claimed=0, items=_views_for(db, open_now))

    claimed = 0
    for bid in [batch_id] if batch_id else _batches_oldest_first():
        claimed += _claim_from_batch(db, user, bid, size - claimed)
        if claimed >= size:
            break

    db.commit()
    logger.info("dedup claim user=%s batch=%s claimed=%s", user.id, batch_id or "auto", claimed)
    return ClaimOut(claimed=claimed, items=_views_for(db, repo.user_assignments(db, user.id, batch_id, state="open")))


def my_items(db: Session, user: User, batch_id: Optional[str] = None, state: str = "all") -> list[ItemOut]:
    return _views_for(db, repo.user_assignments(db, user.id, batch_id, state=state))


# --- one item ------------------------------------------------------------------------

def _load_owned(
    db: Session, user: User, item_id: int, *, lock: bool = False
) -> tuple[DedupItem, DedupAssignment]:
    """The item and its assignment, if the user may see it (assignee or admin)."""
    assignment = repo.get_assignment(db, item_id, lock=lock)
    item = repo.get_item(db, item_id)
    if assignment is None or item is None:
        raise HTTPException(status_code=404, detail=f"Item {item_id} is not assigned")
    if assignment.user_id != user.id and not is_admin(user):
        raise HTTPException(status_code=403, detail="This item is assigned to someone else")
    return item, assignment


def get_item(db: Session, user: User, item_id: int) -> ItemOut:
    item, assignment = _load_owned(db, user, item_id)
    if assignment.user_id == user.id:
        repo.mark_opened(db, assignment)
        db.commit()
    return _item_view(item, repo.latest_decision(db, item_id), assignment)


def add_active_time(db: Session, user: User, item_id: int, seconds: int) -> None:
    if not repo.add_active_seconds(db, item_id, user.id, seconds):
        raise HTTPException(status_code=403, detail="This item is not assigned to you")
    db.commit()


def save_decision(db: Session, user: User, item_id: int, body: DecisionIn) -> ItemOut:
    """Record a decision locally and queue it for BDRC.

    Fields not sent keep their previous value, the same as BDRC's partial PUT: flagging
    an issue does not wipe an earlier verdict, and omitting ``issues`` keeps the list.
    """
    item, assignment = _load_owned(db, user, item_id, lock=True)
    if assignment.user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the assigned annotator can decide this item")

    prev = repo.latest_decision(db, item_id)
    sent = body.model_fields_set

    if body.verdict is not None:
        verdict = body.verdict
        abstention_reason = body.abstention_reason
        confidence = body.confidence
    else:  # issue-only: keep whatever verdict was already recorded
        verdict = prev.verdict if prev else None
        abstention_reason = prev.abstention_reason if prev else None
        confidence = prev.confidence if prev else None

    issues: Optional[list[dict[str, Any]]]
    if "issues" in sent:
        issues = [i.model_dump() for i in body.issues] if body.issues else None
    else:
        issues = prev.issues if prev else None

    partner_payload = body.partner_payload if "partner_payload" in sent else (prev.partner_payload if prev else None)
    status = body.status or ("finalized" if body.verdict is not None else "flagged")

    now = datetime.utcnow()
    decision = repo.add_decision(
        db,
        DedupDecision(
            item_id=item_id,
            user_id=user.id,
            status=status,
            verdict=verdict,
            abstention_reason=abstention_reason,
            confidence=confidence,
            issues=issues,
            partner_payload=partner_payload,
            decided_at=now,
            evidence_hash=item.evidence_hash,
        ),
    )
    # Decided or flagged, the annotator is done with it; it no longer blocks a new claim.
    if assignment.completed_at is None:
        assignment.completed_at = now
    db.commit()
    db.refresh(decision)
    return _item_view(item, decision, assignment)


def bdrc_payload(decision: DedupDecision) -> dict[str, Any]:
    """The PUT body for BDRC. Every writable field is sent, so BDRC ends up holding
    exactly the latest decision (e.g. an old abstention_reason is cleared)."""
    return {
        "status": decision.status,
        "verdict": decision.verdict,
        "abstention_reason": decision.abstention_reason,
        "confidence": decision.confidence,
        "issues": decision.issues,
        "annotator_id": decision.user_id,
        "decided_at": decision.decided_at.isoformat() + "Z",
        "partner_payload": decision.partner_payload,
    }
