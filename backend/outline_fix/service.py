"""Outline Fixer logic: importing work pairs, handing out works, saving edits, export."""
from __future__ import annotations

import io
import json
import zipfile
from collections import defaultdict
from datetime import datetime
from typing import Iterable

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from core.redis import invalidate_user_by_email_cache
from dedup.deps import _parse_permissions
from outline_fix import outline_csv
from outline_fix.deps import OUTLINE_FIX_PERMISSION, has_outline_fix_access, outline_fix_role
from outline_fix.models import (
    STATUS_COMPLETED,
    STATUS_IN_PROGRESS,
    STATUS_PENDING,
    STATUS_SKIPPED,
    STATUSES,
    OutlineFixEdit,
    OutlineFixWork,
)
from outline_fix.schemas import (
    EditIn,
    EditOut,
    ImportOut,
    MemberOut,
    MemberPageOut,
    MemberUpdateIn,
    WorkDetail,
    WorkSummary,
)
from user.models.user import User

# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------


def _expand_files(files: Iterable[tuple[str, bytes]]) -> list[tuple[str, bytes]]:
    """Unzip any .zip upload; keep .csv and .json files, ignore everything else."""
    out: list[tuple[str, bytes]] = []
    for name, data in files:
        lower = name.lower()
        if lower.endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                for info in zf.infolist():
                    inner = info.filename
                    base = inner.rsplit("/", 1)[-1]
                    if info.is_dir() or base.startswith(".") or inner.startswith("__MACOSX/"):
                        continue
                    if base.lower().endswith((".csv", ".json")):
                        out.append((inner, zf.read(info)))
        elif lower.endswith((".csv", ".json")):
            out.append((name, data))
    return out


def import_pairs(db: Session, batch_id: str, files: Iterable[tuple[str, bytes]]) -> ImportOut:
    """Create one work per outline.csv + issue.json pair, matched by W id.

    The JSON names its work in ``w_id``; the CSV's W id comes from its segment RIDs, so file
    names do not matter. Works already imported (any batch) are left as they are.
    """
    csvs: dict[str, tuple[list[str], list[list[str]]]] = {}
    jsons: dict[str, dict] = {}
    errors: list[str] = []
    ignored: list[str] = []

    for name, data in _expand_files(files):
        # {w_id}_outline.csv is a fixed outline exported by the fixer, not BDRC's original;
        # sample folders hold both, and either would parse to the same W id.
        if name.lower().endswith("_outline.csv"):
            ignored.append(name)
            continue
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            errors.append(f"{name}: not UTF-8 text")
            continue
        if name.lower().endswith(".json"):
            try:
                doc = json.loads(text)
            except json.JSONDecodeError:
                errors.append(f"{name}: not valid JSON")
                continue
            w_id = (doc.get("w_id") or "").strip() if isinstance(doc, dict) else ""
            if not w_id or not isinstance(doc.get("issues"), list):
                errors.append(f'{name}: needs a "w_id" and an "issues" array')
                continue
            jsons[w_id] = doc
        else:
            try:
                header, rows = outline_csv.parse_outline_csv(text)
            except outline_csv.OutlineCsvError as e:
                errors.append(f"{name}: {e}")
                continue
            w_id = outline_csv.w_id_from_rows(header, rows)
            if not w_id:
                errors.append(f"{name}: cannot tell the work from its RIDs")
                continue
            csvs[w_id] = (header, rows)

    for w_id in sorted(set(csvs) - set(jsons)):
        errors.append(f"{w_id}: outline.csv without an issue.json")
    for w_id in sorted(set(jsons) - set(csvs)):
        errors.append(f"{w_id}: issue.json without an outline.csv")

    paired = sorted(set(csvs) & set(jsons))
    existing = {
        w for (w,) in db.query(OutlineFixWork.w_id).filter(OutlineFixWork.w_id.in_(paired)).all()
    } if paired else set()

    created: list[str] = []
    for w_id in paired:
        if w_id in existing:
            continue
        header, rows = csvs[w_id]
        doc = jsons[w_id]
        issues = doc["issues"]
        db.add(
            OutlineFixWork(
                w_id=w_id,
                batch_id=batch_id,
                outline_header=header,
                outline_rows=rows,
                issues=issues,
                issue_meta={k: v for k, v in doc.items() if k != "issues"},
                issue_count=len(issues),
            )
        )
        created.append(w_id)
    db.commit()
    return ImportOut(
        batch_id=batch_id,
        created=created,
        skipped_existing=sorted(existing),
        ignored=ignored,
        errors=errors,
    )


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------


def _error_types(work: OutlineFixWork) -> list[str]:
    types = work.issue_meta.get("error_types") if work.issue_meta else None
    if isinstance(types, list):
        return [str(t) for t in types]
    return sorted({str(i.get("error_type")) for i in work.issues if i.get("error_type")})


def _summary(work: OutlineFixWork, edit_count: int, names: dict[str, str | None]) -> WorkSummary:
    return WorkSummary(
        id=work.id,
        w_id=work.w_id,
        batch_id=work.batch_id,
        status=work.status,
        issue_count=work.issue_count,
        error_types=_error_types(work),
        edit_count=edit_count,
        assigned_to=work.assigned_to,
        assigned_to_name=names.get(work.assigned_to) if work.assigned_to else None,
        assigned_at=work.assigned_at,
        completed_at=work.completed_at,
        note=work.note,
        imported_at=work.imported_at,
    )


def _summaries(db: Session, works: list[OutlineFixWork]) -> list[WorkSummary]:
    if not works:
        return []
    ids = [w.id for w in works]
    counts = dict(
        db.query(OutlineFixEdit.work_id, func.count(OutlineFixEdit.id))
        .filter(OutlineFixEdit.work_id.in_(ids))
        .group_by(OutlineFixEdit.work_id)
        .all()
    )
    user_ids = {w.assigned_to for w in works if w.assigned_to}
    names = {
        u.id: (u.name or u.email)
        for u in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}
    return [_summary(w, counts.get(w.id, 0), names) for w in works]


def list_works(
    db: Session,
    batch_id: str | None = None,
    status: str | None = None,
    assigned_to: str | None = None,
) -> list[WorkSummary]:
    q = db.query(OutlineFixWork)
    if batch_id:
        q = q.filter(OutlineFixWork.batch_id == batch_id)
    if status:
        q = q.filter(OutlineFixWork.status == status)
    if assigned_to:
        q = q.filter(OutlineFixWork.assigned_to == assigned_to)
    works = q.order_by(OutlineFixWork.batch_id, OutlineFixWork.imported_at, OutlineFixWork.w_id).all()
    return _summaries(db, works)


def list_batches(db: Session) -> list[dict]:
    rows = (
        db.query(
            OutlineFixWork.batch_id,
            OutlineFixWork.status,
            func.count(OutlineFixWork.id),
            func.coalesce(func.sum(OutlineFixWork.issue_count), 0),
        )
        .group_by(OutlineFixWork.batch_id, OutlineFixWork.status)
        .all()
    )
    batches: dict[str, dict] = defaultdict(
        lambda: {"total": 0, "status_counts": {s: 0 for s in STATUSES}, "issue_count": 0}
    )
    for batch_id, status, count, issues in rows:
        b = batches[batch_id]
        b["total"] += count
        b["status_counts"][status] = count
        b["issue_count"] += int(issues)
    return [{"batch_id": k, **v} for k, v in sorted(batches.items())]


def get_work(db: Session, work_id: str) -> OutlineFixWork:
    work = db.get(OutlineFixWork, work_id)
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    return work


def _edits(db: Session, work_id: str) -> list[OutlineFixEdit]:
    return db.query(OutlineFixEdit).filter(OutlineFixEdit.work_id == work_id).all()


def work_detail(db: Session, work: OutlineFixWork) -> WorkDetail:
    edits = _edits(db, work.id)
    summary = _summaries(db, [work])[0]
    return WorkDetail(
        **summary.model_dump(),
        outline_header=work.outline_header,
        outline_rows=work.outline_rows,
        issues=work.issues,
        edits=[
            EditOut(
                rid=e.rid,
                img_start=e.img_start,
                img_end=e.img_end,
                vol_start=e.vol_start,
                vol_end=e.vol_end,
                part_type=e.part_type,
                edited_by=e.edited_by,
                updated_at=e.updated_at,
            )
            for e in edits
        ],
    )


def check_can_open(work: OutlineFixWork, user: User, is_admin: bool) -> None:
    if not is_admin and work.assigned_to != user.id:
        raise HTTPException(status_code=403, detail="This work is not assigned to you")


# ---------------------------------------------------------------------------
# Handing out works
# ---------------------------------------------------------------------------


def claim_next(db: Session, user: User) -> tuple[OutlineFixWork | None, bool]:
    """My unfinished work if I have one, otherwise the oldest pending work."""
    mine = (
        db.query(OutlineFixWork)
        .filter(OutlineFixWork.assigned_to == user.id, OutlineFixWork.status == STATUS_IN_PROGRESS)
        .order_by(OutlineFixWork.assigned_at)
        .first()
    )
    if mine:
        return mine, False
    # SKIP LOCKED: two people claiming at once get different works.
    work = (
        db.query(OutlineFixWork)
        .filter(OutlineFixWork.status == STATUS_PENDING, OutlineFixWork.assigned_to.is_(None))
        .order_by(OutlineFixWork.batch_id, OutlineFixWork.imported_at, OutlineFixWork.w_id)
        .with_for_update(skip_locked=True)
        .first()
    )
    if not work:
        return None, False
    _assign(work, user.id, user.id)
    db.commit()
    return work, True


def _assign(work: OutlineFixWork, user_id: str, by: str) -> None:
    work.assigned_to = user_id
    work.assigned_by = by
    work.assigned_at = datetime.utcnow()
    if work.status == STATUS_PENDING:
        work.status = STATUS_IN_PROGRESS


def assign(db: Session, work: OutlineFixWork, user_id: str, admin: User) -> None:
    if not db.get(User, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    _assign(work, user_id, admin.id)
    db.commit()


def release(db: Session, work: OutlineFixWork) -> None:
    """Back to the pool. Edits are kept, so the next person continues from them."""
    if work.status in (STATUS_COMPLETED, STATUS_SKIPPED):
        raise HTTPException(status_code=409, detail="Reopen the work before releasing it")
    work.assigned_to = None
    work.assigned_by = None
    work.assigned_at = None
    work.status = STATUS_PENDING
    db.commit()


def reopen(db: Session, work: OutlineFixWork) -> None:
    """A completed or skipped work back to its assignee (or the pool if it has none)."""
    work.status = STATUS_IN_PROGRESS if work.assigned_to else STATUS_PENDING
    work.completed_at = None
    db.commit()


# ---------------------------------------------------------------------------
# Annotator actions
# ---------------------------------------------------------------------------


def save_edits(db: Session, work: OutlineFixWork, edits: list[EditIn], user: User) -> None:
    """Make the stored edits match ``edits``.

    A segment sent with its original values, or not sent at all, has no edit afterwards.
    """
    header, rows = work.outline_header, work.outline_rows
    col = outline_csv.column_index(header)
    originals = {
        outline_csv.to_rid(row[col[outline_csv.RID_COL]]): outline_csv.row_values(header, row)
        for row in rows
    }
    wanted: dict[str, dict] = {}
    for edit in edits:
        rid = outline_csv.to_rid(edit.rid)
        if rid not in originals:
            raise HTTPException(status_code=422, detail=f"{edit.rid} is not in this work's outline")
        values = edit.model_dump(exclude={"rid"})
        if values.get("part_type"):
            values["part_type"] = values["part_type"].strip() or None
        if values != originals[rid]:
            wanted[rid] = values

    existing = {e.rid: e for e in _edits(db, work.id)}
    for rid, row in existing.items():
        if rid not in wanted:
            db.delete(row)
    for rid, values in wanted.items():
        row = existing.get(rid)
        if row is None:
            db.add(OutlineFixEdit(work_id=work.id, rid=rid, edited_by=user.id, **values))
        elif any(getattr(row, k) != v for k, v in values.items()):
            for k, v in values.items():
                setattr(row, k, v)
            row.edited_by = user.id
    db.commit()


def complete(db: Session, work: OutlineFixWork) -> None:
    work.status = STATUS_COMPLETED
    work.completed_at = datetime.utcnow()
    db.commit()


def skip(db: Session, work: OutlineFixWork, note: str) -> None:
    work.status = STATUS_SKIPPED
    work.note = note.strip()
    work.completed_at = datetime.utcnow()
    db.commit()


def check_editable(work: OutlineFixWork, user: User) -> None:
    if work.assigned_to != user.id:
        raise HTTPException(status_code=403, detail="This work is not assigned to you")
    if work.status != STATUS_IN_PROGRESS:
        raise HTTPException(status_code=409, detail=f"This work is {work.status}")


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def fixed_csv(db: Session, work: OutlineFixWork) -> str:
    edits = [
        {
            "rid": e.rid,
            "img_start": e.img_start,
            "img_end": e.img_end,
            "vol_start": e.vol_start,
            "vol_end": e.vol_end,
            "part_type": e.part_type,
        }
        for e in _edits(db, work.id)
    ]
    rows = outline_csv.apply_edits(work.outline_header, work.outline_rows, edits)
    return outline_csv.serialize_outline_csv(work.outline_header, rows)


def export_zip(db: Session, batch_id: str | None, statuses: tuple[str, ...]) -> bytes:
    """One ``{w_id}_outline.csv`` per work, plus a summary.csv of every work included."""
    q = db.query(OutlineFixWork).filter(OutlineFixWork.status.in_(statuses))
    if batch_id:
        q = q.filter(OutlineFixWork.batch_id == batch_id)
    works = q.order_by(OutlineFixWork.w_id).all()
    summaries = {s.id: s for s in _summaries(db, works)}

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        summary_rows = []
        for work in works:
            zf.writestr(f"{work.w_id}_outline.csv", fixed_csv(db, work))
            s = summaries[work.id]
            summary_rows.append(
                [work.w_id, work.batch_id, work.status, str(work.issue_count), str(s.edit_count),
                 s.assigned_to_name or "", work.note or ""]
            )
        zf.writestr(
            "summary.csv",
            outline_csv.serialize_outline_csv(
                ["w_id", "batch", "status", "issues", "edited_segments", "annotator", "note"],
                summary_rows,
            ),
        )
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Users (the Outline Fixer's own Users page)
# ---------------------------------------------------------------------------


def _member(user: User) -> MemberOut:
    return MemberOut(
        id=user.id,
        name=user.name,
        email=user.email,
        picture=user.picture,
        created_at=user.created_at,
        access=has_outline_fix_access(user),
        role=outline_fix_role(user),
    )


def list_members(db: Session, q: str | None, role: str | None, page: int, page_size: int) -> MemberPageOut:
    """Every Cataloger account, newest first. ``role``: admin / annotator (both imply
    access) or none (no access)."""
    query = db.query(User)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(User.name.ilike(like), User.email.ilike(like)))
    has_permission = User.permissions.contains(OUTLINE_FIX_PERMISSION)
    if role == "admin":
        query = query.filter(has_permission, User.outline_fix_role == "admin")
    elif role == "annotator":
        query = query.filter(
            has_permission, or_(User.outline_fix_role.is_(None), User.outline_fix_role != "admin")
        )
    elif role == "none":
        query = query.filter(or_(User.permissions.is_(None), ~has_permission))
    rows = (
        query.order_by(User.created_at.desc().nullslast(), User.email)
        .offset((page - 1) * page_size)
        .limit(page_size + 1)
        .all()
    )
    return MemberPageOut(users=[_member(u) for u in rows[:page_size]], has_next=len(rows) > page_size)


def update_member(db: Session, user_id: str, body: MemberUpdateIn, admin: User) -> MemberOut:
    """Outline Fixer access and role only; the user's other permissions and roles stay."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id and (body.access is False or body.role == "annotator"):
        raise HTTPException(status_code=409, detail="You can't remove your own admin access")
    if body.access is not None:
        permissions = [p for p in _parse_permissions(user.permissions) if p != OUTLINE_FIX_PERMISSION]
        if body.access:
            permissions.append(OUTLINE_FIX_PERMISSION)
        user.permissions = json.dumps(permissions) if permissions else None
    if body.role is not None:
        user.outline_fix_role = None if body.role == "annotator" else body.role
    db.commit()
    db.refresh(user)
    # /settings/users/me is cached by email and carries the permissions.
    invalidate_user_by_email_cache(user.email)
    return _member(user)
