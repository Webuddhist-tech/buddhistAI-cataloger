"""Persistence for outliner work groups and their members."""

from __future__ import annotations

from typing import Iterable, List, Optional

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from outliner.models.document import OutlinerDocument
from outliner.models.group import OutlinerGroup, OutlinerGroupMember
from user.models.user import User


def list_groups(db: Session) -> List[OutlinerGroup]:
    return list(
        db.execute(
            select(OutlinerGroup).options(selectinload(OutlinerGroup.members)).order_by(OutlinerGroup.name)
        )
        .scalars()
        .all()
    )


def get_group(db: Session, group_id: str) -> Optional[OutlinerGroup]:
    return db.get(OutlinerGroup, group_id)


def user_groups(db: Session, user_id: str) -> List[OutlinerGroup]:
    return list(
        db.execute(
            select(OutlinerGroup)
            .join(OutlinerGroupMember, OutlinerGroupMember.group_id == OutlinerGroup.id)
            .where(OutlinerGroupMember.user_id == user_id)
            .order_by(OutlinerGroup.name)
        )
        .scalars()
        .all()
    )


def users_by_ids(db: Session, user_ids: Iterable[str]) -> dict[str, User]:
    ids = list(set(user_ids))
    if not ids:
        return {}
    return {u.id: u for u in db.execute(select(User).where(User.id.in_(ids))).scalars().all()}


def create_group(db: Session, name: str, batch_id: Optional[str]) -> OutlinerGroup:
    group = OutlinerGroup(name=name, batch_id=batch_id)
    db.add(group)
    return group


def set_members(db: Session, group: OutlinerGroup, user_ids: Iterable[str]) -> None:
    db.execute(delete(OutlinerGroupMember).where(OutlinerGroupMember.group_id == group.id))
    for user_id in dict.fromkeys(user_ids):
        db.add(OutlinerGroupMember(group_id=group.id, user_id=user_id))
    db.expire(group, ["members"])


def delete_group(db: Session, group: OutlinerGroup) -> None:
    db.delete(group)


def tag_documents_with_group(
    db: Session, group: OutlinerGroup, filenames: Iterable[str], *, overwrite: bool = False
) -> int:
    """Set ``group_id``/``batch_id`` on documents whose filename (BDRC volume id) is in
    ``filenames``. Untagged documents only unless ``overwrite``. Returns rows changed."""
    names = list(set(filenames))
    if not names:
        return 0
    q = db.query(OutlinerDocument).filter(OutlinerDocument.filename.in_(names))
    if not overwrite:
        q = q.filter(OutlinerDocument.group_id.is_(None))
    return q.update(
        {OutlinerDocument.group_id: group.id, OutlinerDocument.batch_id: group.batch_id},
        synchronize_session=False,
    )
