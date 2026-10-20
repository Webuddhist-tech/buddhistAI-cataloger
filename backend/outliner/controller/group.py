"""Work groups: which BDRC batch each annotator and reviewer gets work from."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from outliner.models.group import OutlinerGroup
from outliner.repository import group as group_repo
from outliner.utils.bec_client.api import fetch_volume_batch_stats
from user.models.user import User

NO_GROUP_DETAIL = "You are not in a group yet. Ask an admin to add you to one."


def _is_admin(user: User) -> bool:
    return (user.role or "").strip().lower() == "admin"


def _group_out(group: OutlinerGroup, users: Dict[str, User]) -> Dict[str, Any]:
    members = []
    for m in group.members:
        u = users.get(m.user_id)
        members.append(
            {
                "user_id": m.user_id,
                "name": u.name if u else None,
                "email": u.email if u else None,
                "picture": u.picture if u else None,
                "role": u.role if u else None,
            }
        )
    members.sort(key=lambda m: (m["name"] or m["email"] or "").lower())
    return {"id": group.id, "name": group.name, "batch_id": group.batch_id, "members": members}


def list_groups(db: Session) -> List[Dict[str, Any]]:
    groups = group_repo.list_groups(db)
    users = group_repo.users_by_ids(db, (m.user_id for g in groups for m in g.members))
    return [_group_out(g, users) for g in groups]


def my_groups(db: Session, user: User) -> List[Dict[str, Any]]:
    return [
        {"id": g.id, "name": g.name, "batch_id": g.batch_id}
        for g in group_repo.user_groups(db, user.id)
    ]


def _get_or_404(db: Session, group_id: str) -> OutlinerGroup:
    group = group_repo.get_group(db, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


def _clean_batch(batch_id: Optional[str]) -> Optional[str]:
    return (batch_id or "").strip() or None


def _commit_unique_name(db: Session, name: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"A group named {name!r} already exists") from exc


def create_group(db: Session, name: str, batch_id: Optional[str]) -> Dict[str, Any]:
    name = name.strip()
    group = group_repo.create_group(db, name, _clean_batch(batch_id))
    _commit_unique_name(db, name)
    return _group_out(group, {})


def update_group(db: Session, group_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
    group = _get_or_404(db, group_id)
    if fields.get("name") is not None:
        group.name = fields["name"].strip()
    if "batch_id" in fields:
        # Documents already assigned keep the batch they came from.
        group.batch_id = _clean_batch(fields["batch_id"])
    _commit_unique_name(db, group.name)
    db.refresh(group)
    return _group_out(group, group_repo.users_by_ids(db, (m.user_id for m in group.members)))


def set_group_members(db: Session, group_id: str, user_ids: List[str]) -> Dict[str, Any]:
    group = _get_or_404(db, group_id)
    users = group_repo.users_by_ids(db, user_ids)
    unknown = sorted(set(user_ids) - users.keys())
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown user ids: {', '.join(unknown)}")
    group_repo.set_members(db, group, user_ids)
    db.commit()
    db.refresh(group)
    return _group_out(group, users)


def delete_group(db: Session, group_id: str) -> None:
    """Its documents lose their group and go back to the shared review pool."""
    group_repo.delete_group(db, _get_or_404(db, group_id))
    db.commit()


def list_batches() -> List[Dict[str, Any]]:
    stats = fetch_volume_batch_stats()
    if stats is None:
        raise HTTPException(status_code=502, detail="Could not load batches from BDRC")
    return [{"batch_id": bid, "active": c.get("active", 0)} for bid, c in sorted(stats.items())]


def group_for_new_volume(db: Session, user: User, group_id: Optional[str]) -> OutlinerGroup:
    """The group an annotator's next volume comes from."""
    groups = group_repo.user_groups(db, user.id)
    if not groups:
        raise HTTPException(status_code=400, detail=NO_GROUP_DETAIL)
    if group_id:
        group = next((g for g in groups if g.id == group_id), None)
        if group is None:
            raise HTTPException(status_code=403, detail="You are not in that group")
    elif len(groups) == 1:
        group = groups[0]
    else:
        raise HTTPException(status_code=400, detail="You are in more than one group. Choose which group to take work from.")
    if not group.batch_id:
        raise HTTPException(
            status_code=400,
            detail=f"Group {group.name!r} has no batch yet. Ask an admin to link one.",
        )
    return group


def review_group_ids(db: Session, user: User) -> Optional[List[str]]:
    """Groups whose documents the user may review; ``None`` means any (admins)."""
    if _is_admin(user):
        return None
    ids = [g.id for g in group_repo.user_groups(db, user.id)]
    if not ids:
        raise HTTPException(status_code=400, detail=NO_GROUP_DETAIL)
    return ids
