"""HTTP routes for the Outline Fixer, mounted at ``/outline-fix``.

Annotator routes need the ``outline_fix`` permission; ``/admin`` routes also need role
admin. Plain ``def`` routes: the DB calls are synchronous.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from core.database import get_db
from dedup.deps import _parse_permissions
from outline_fix import service
from outline_fix.deps import (
    OUTLINE_FIX_PERMISSION,
    has_outline_fix_access,
    is_outline_fix_admin,
    outline_fix_role,
    require_logged_in,
    require_outline_fix_access,
    require_outline_fix_admin,
)
from outline_fix.models import STATUS_COMPLETED, STATUS_SKIPPED, STATUSES
from outline_fix.schemas import (
    AssignIn,
    BatchOut,
    ClaimOut,
    ImportOut,
    MemberOut,
    MemberPageOut,
    MemberUpdateIn,
    MeOut,
    SaveEditsIn,
    SkipIn,
    UserOut,
    WorkDetail,
    WorkSummary,
)
from user.models.user import User

router = APIRouter()


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(require_logged_in)):
    """My Outline Fixer access and role, for the nav and the admin pages."""
    return MeOut(access=has_outline_fix_access(user), role=outline_fix_role(user))


# ---------------------------------------------------------------------------
# Annotator
# ---------------------------------------------------------------------------


@router.post("/claim", response_model=ClaimOut)
def claim_next(
    db: Session = Depends(get_db),
    user: User = Depends(require_outline_fix_access),
):
    """Give me the next pending work, or my unfinished one if I have it."""
    work, claimed = service.claim_next(db, user)
    summary = service._summaries(db, [work])[0] if work else None
    return ClaimOut(work=summary, claimed=claimed)


@router.get("/my-works", response_model=list[WorkSummary])
def my_works(
    db: Session = Depends(get_db),
    user: User = Depends(require_outline_fix_access),
):
    return service.list_works(db, assigned_to=user.id)


@router.get("/works/{work_id}", response_model=WorkDetail)
def get_work(
    work_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_outline_fix_access),
):
    """Everything the workspace needs: the imported outline, the issues, and the edits."""
    work = service.get_work(db, work_id)
    service.check_can_open(work, user, is_outline_fix_admin(user))
    return service.work_detail(db, work)


@router.put("/works/{work_id}/edits", status_code=204)
def save_edits(
    work_id: str,
    body: SaveEditsIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_outline_fix_access),
):
    work = service.get_work(db, work_id)
    service.check_editable(work, user)
    service.save_edits(db, work, body.edits, user)


@router.post("/works/{work_id}/complete", status_code=204)
def complete(
    work_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_outline_fix_access),
):
    work = service.get_work(db, work_id)
    service.check_editable(work, user)
    service.complete(db, work)


@router.post("/works/{work_id}/skip", status_code=204)
def skip(
    work_id: str,
    body: SkipIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_outline_fix_access),
):
    work = service.get_work(db, work_id)
    service.check_editable(work, user)
    service.skip(db, work, body.note)


@router.get("/works/{work_id}/export")
def export_work(
    work_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_outline_fix_access),
):
    """The fixed outline.csv of one work."""
    work = service.get_work(db, work_id)
    service.check_can_open(work, user, is_outline_fix_admin(user))
    return Response(
        content=service.fixed_csv(db, work),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{work.w_id}_outline.csv"'},
    )


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


@router.post("/admin/import", response_model=ImportOut, dependencies=[Depends(require_outline_fix_admin)])
def import_batch(
    batch_id: str = Form(..., min_length=1),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    """Upload outline.csv + issue.json pairs (loose files or zips) as a batch."""
    contents = [(f.filename or "", f.file.read()) for f in files]
    return service.import_pairs(db, batch_id.strip(), contents)


@router.get("/admin/batches", response_model=list[BatchOut], dependencies=[Depends(require_outline_fix_admin)])
def list_batches(db: Session = Depends(get_db)):
    return service.list_batches(db)


@router.get("/admin/works", response_model=list[WorkSummary], dependencies=[Depends(require_outline_fix_admin)])
def list_works(
    batch_id: str | None = None,
    status: str | None = Query(None, pattern="^(" + "|".join(STATUSES) + ")$"),
    db: Session = Depends(get_db),
):
    return service.list_works(db, batch_id=batch_id, status=status)


@router.get("/admin/annotators", response_model=list[UserOut], dependencies=[Depends(require_outline_fix_admin)])
def list_annotators(db: Session = Depends(get_db)):
    """People who can be handed a work."""
    users = db.query(User).filter(User.permissions.contains(OUTLINE_FIX_PERMISSION)).all()
    return [
        UserOut(id=u.id, name=u.name, email=u.email)
        for u in users
        if OUTLINE_FIX_PERMISSION in _parse_permissions(u.permissions)
    ]


@router.get("/admin/users", response_model=MemberPageOut, dependencies=[Depends(require_outline_fix_admin)])
def list_members(
    q: str | None = None,
    role: str | None = Query(None, pattern="^(admin|annotator|none)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Every Cataloger account with its Outline Fixer access and role, for the Users page."""
    return service.list_members(db, q, role, page, page_size)


@router.patch("/admin/users/{user_id}", response_model=MemberOut)
def update_member(
    user_id: str,
    body: MemberUpdateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_outline_fix_admin),
):
    """Give or take Outline Fixer access, or change the Outline Fixer role. Nothing else
    about the account changes."""
    return service.update_member(db, user_id, body, admin)


@router.post("/admin/works/{work_id}/assign", status_code=204)
def assign(
    work_id: str,
    body: AssignIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_outline_fix_admin),
):
    service.assign(db, service.get_work(db, work_id), body.user_id, admin)


@router.post("/admin/works/{work_id}/release", status_code=204, dependencies=[Depends(require_outline_fix_admin)])
def release(work_id: str, db: Session = Depends(get_db)):
    service.release(db, service.get_work(db, work_id))


@router.post("/admin/works/{work_id}/reopen", status_code=204, dependencies=[Depends(require_outline_fix_admin)])
def reopen(work_id: str, db: Session = Depends(get_db)):
    service.reopen(db, service.get_work(db, work_id))


@router.get("/admin/export", dependencies=[Depends(require_outline_fix_admin)])
def export_batch(
    batch_id: str | None = None,
    include_skipped: bool = False,
    db: Session = Depends(get_db),
):
    """Zip of fixed CSVs for the completed works (optionally skipped ones too)."""
    statuses = (STATUS_COMPLETED, STATUS_SKIPPED) if include_skipped else (STATUS_COMPLETED,)
    data = service.export_zip(db, batch_id, statuses)
    stamp = datetime.utcnow().strftime("%Y%m%d")
    name = f"outline-fix_{batch_id or 'all'}_{stamp}.zip"
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
