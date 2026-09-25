"""HTTP routes for the dedup review tool, mounted at ``/dedup``.

Every route requires the ``dedup`` permission (``require_dedup_access``).
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.database import get_db
from dedup import client
from dedup.client import ReviewApiError
from dedup.controller import dedup as ctrl
from dedup.deps import is_admin, require_dedup_access
from dedup.repository import dedup_repository as repo
from dedup.schemas import BatchOut, ClaimOut, DecisionIn, ItemOut, SyncHealthOut
from user.models.user import User

router = APIRouter(dependencies=[Depends(require_dedup_access)])


@router.get("/batches", response_model=list[BatchOut])
def list_batches(
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """Review batches from BDRC, with BDRC's progress and this user's own counts."""
    return ctrl.list_batches(db, user)


@router.post("/claim", response_model=ClaimOut)
def claim_next(
    size: int = Query(ctrl.CLAIM_SIZE, ge=1, le=ctrl.MAX_CLAIM_SIZE),
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """Get my next set of items from the oldest batch with work left. Returns my
    unfinished items instead if I still have any."""
    return ctrl.claim_items(db, user, None, size)


@router.get("/my-items", response_model=list[ItemOut])
def my_items_all(
    state: Literal["open", "done", "all"] = "all",
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """Items assigned to me, across all batches."""
    return ctrl.my_items(db, user, None, state)


@router.post("/batches/{batch_id}/claim", response_model=ClaimOut)
def claim(
    batch_id: str,
    size: int = Query(ctrl.CLAIM_SIZE, ge=1, le=ctrl.MAX_CLAIM_SIZE),
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """Get my next set of items. Returns my unfinished items instead if I still have any."""
    return ctrl.claim_items(db, user, batch_id, size)


@router.get("/batches/{batch_id}/my-items", response_model=list[ItemOut])
def my_items(
    batch_id: str,
    state: Literal["open", "done", "all"] = "all",
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """Items assigned to me in this batch."""
    return ctrl.my_items(db, user, batch_id, state)


@router.get("/items/{item_id}", response_model=ItemOut)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """One item (assignee or admin only). Records when the assignee first opened it."""
    return ctrl.get_item(db, user, item_id)


@router.post("/items/{item_id}/decision", response_model=ItemOut)
def save_decision(
    item_id: int,
    body: DecisionIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """Record my decision. Saved here first, then pushed to BDRC in the background."""
    return ctrl.save_decision(db, user, item_id, body)


# --- pass-through to BDRC ------------------------------------------------------------

@router.get("/texts/{mw_id}")
def get_text(mw_id: str):
    """Full text of one witness (BDRC ``/review/texts/{mw_id}``)."""
    try:
        return client.get_text(mw_id)
    except ReviewApiError as exc:
        raise ctrl.bdrc_error(exc) from exc


@router.get("/diff")
def get_diff(
    a: str,
    b: str,
    granularity: Literal["syllable", "char", "line"] = "syllable",
):
    """Aligned diff between two witnesses (BDRC ``/review/diff``)."""
    try:
        return client.get_diff(a, b, granularity)
    except ReviewApiError as exc:
        raise ctrl.bdrc_error(exc) from exc


# --- admin ---------------------------------------------------------------------------

@router.get("/admin/sync-health", response_model=SyncHealthOut)
def sync_health(
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """Decisions by sync state, plus the ones that gave up. Admin only."""
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Admins only")
    return repo.sync_health(db)


__all__ = ["router"]
