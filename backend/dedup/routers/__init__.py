"""HTTP routes for the dedup review tool, mounted at ``/dedup``.

Annotator routes require the ``dedup`` permission; ``/admin`` routes require role admin.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.database import get_db
from dedup import client
from dedup.client import ReviewApiError
from dedup.controller import admin as admin_ctrl
from dedup.controller import dedup as ctrl
from dedup.deps import require_dedup_access, require_dedup_admin
from dedup.repository import dedup_repository as repo
from dedup.schemas import (
    ActiveTimeIn,
    AdminOverviewOut,
    AnnotatorOut,
    BatchOut,
    ClaimOut,
    DecisionIn,
    ItemOut,
    ReassignIn,
    ReassignOut,
    SyncHealthOut,
)
from user.models.user import User

router = APIRouter()
annotator_router = APIRouter(dependencies=[Depends(require_dedup_access)])


@annotator_router.get("/batches", response_model=list[BatchOut])
def list_batches(
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """Review batches from BDRC, with BDRC's progress and this user's own counts."""
    return ctrl.list_batches(db, user)


@annotator_router.post("/claim", response_model=ClaimOut)
def claim_next(
    size: int = Query(ctrl.CLAIM_SIZE, ge=1, le=ctrl.MAX_CLAIM_SIZE),
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """Get my next set of items from the oldest batch with work left. Returns my
    unfinished items instead if I still have any."""
    return ctrl.claim_items(db, user, None, size)


@annotator_router.get("/my-items", response_model=list[ItemOut])
def my_items_all(
    state: Literal["open", "done", "all"] = "all",
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """Items assigned to me, across all batches."""
    return ctrl.my_items(db, user, None, state)


@annotator_router.post("/batches/{batch_id}/claim", response_model=ClaimOut)
def claim(
    batch_id: str,
    size: int = Query(ctrl.CLAIM_SIZE, ge=1, le=ctrl.MAX_CLAIM_SIZE),
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """Get my next set of items. Returns my unfinished items instead if I still have any."""
    return ctrl.claim_items(db, user, batch_id, size)


@annotator_router.get("/batches/{batch_id}/my-items", response_model=list[ItemOut])
def my_items(
    batch_id: str,
    state: Literal["open", "done", "all"] = "all",
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """Items assigned to me in this batch."""
    return ctrl.my_items(db, user, batch_id, state)


@annotator_router.get("/items/{item_id}", response_model=ItemOut)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """One item (assignee or admin only). Records when the assignee first opened it."""
    return ctrl.get_item(db, user, item_id)


@annotator_router.post("/items/{item_id}/decision", response_model=ItemOut)
def save_decision(
    item_id: int,
    body: DecisionIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """Record my decision. Saved here first, then pushed to BDRC in the background."""
    return ctrl.save_decision(db, user, item_id, body)


@annotator_router.post("/items/{item_id}/active-time", status_code=204)
def add_active_time(
    item_id: int,
    body: ActiveTimeIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_dedup_access),
):
    """Add one visit's active time (seconds on screen and in use) to my pair."""
    ctrl.add_active_time(db, user, item_id, body.seconds)


# --- pass-through to BDRC ------------------------------------------------------------

@annotator_router.get("/texts/{mw_id}")
def get_text(mw_id: str):
    """Full text of one witness (BDRC ``/review/texts/{mw_id}``)."""
    try:
        return client.get_text(mw_id)
    except ReviewApiError as exc:
        raise ctrl.bdrc_error(exc) from exc


@annotator_router.get("/diff")
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


# --- admin (role admin; the annotator permission is not required) -------------------

admin_router = APIRouter(prefix="/admin", dependencies=[Depends(require_dedup_admin)])


@admin_router.get("/overview", response_model=AdminOverviewOut)
def admin_overview(db: Session = Depends(get_db)):
    """Batch progress, answers, abstentions, issues and sync health."""
    return admin_ctrl.overview(db)


@admin_router.get("/annotators", response_model=list[AnnotatorOut])
def admin_annotators(db: Session = Depends(get_db)):
    """Work and time per annotator."""
    return admin_ctrl.annotators(db)


@admin_router.get("/annotators/{user_id}/items", response_model=list[ItemOut])
def admin_annotator_items(
    user_id: str,
    state: Literal["open", "done", "all"] = "all",
    db: Session = Depends(get_db),
):
    """One annotator's items."""
    return admin_ctrl.annotator_items(db, user_id, state)


@admin_router.post("/reassign", response_model=ReassignOut)
def admin_reassign(
    body: ReassignIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_dedup_admin),
):
    """Move unfinished items to another annotator, or release them (to_user_id null)."""
    return admin_ctrl.reassign(db, admin, body)


@admin_router.get("/sync-health", response_model=SyncHealthOut)
def sync_health(db: Session = Depends(get_db)):
    """Decisions by sync state, plus the ones that gave up."""
    return repo.sync_health(db)


router.include_router(annotator_router)
router.include_router(admin_router)

__all__ = ["router"]
