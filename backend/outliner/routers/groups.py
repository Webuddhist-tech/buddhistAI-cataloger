"""Routes under ``/outliner/groups``: work groups linking users to a BDRC batch."""

from typing import List

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from core.database import get_db
from outliner.controller import group as group_ctrl
from outliner.deps import require_outliner_access, require_outliner_admin
from user.models.user import User

from .schemas import (
    BatchOption,
    GroupCreate,
    GroupMembersUpdate,
    GroupOut,
    GroupUpdate,
    MyGroupOut,
)

router = APIRouter()


@router.get("/groups/mine", response_model=List[MyGroupOut])
def my_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_outliner_access),
):
    """Groups the caller belongs to (to choose one when assigning work)."""
    return group_ctrl.my_groups(db, current_user)


@router.get("/groups", response_model=List[GroupOut], dependencies=[Depends(require_outliner_admin)])
def list_groups(db: Session = Depends(get_db)):
    return group_ctrl.list_groups(db)


@router.get("/groups/batches", response_model=List[BatchOption], dependencies=[Depends(require_outliner_admin)])
def list_batches():
    """BDRC volume batches a group can be linked to."""
    return group_ctrl.list_batches()


@router.post("/groups", response_model=GroupOut, status_code=201, dependencies=[Depends(require_outliner_admin)])
def create_group(body: GroupCreate, db: Session = Depends(get_db)):
    return group_ctrl.create_group(db, body.name, body.batch_id)


@router.patch("/groups/{group_id}", response_model=GroupOut, dependencies=[Depends(require_outliner_admin)])
def update_group(group_id: str, body: GroupUpdate, db: Session = Depends(get_db)):
    return group_ctrl.update_group(db, group_id, body.model_dump(exclude_unset=True))


@router.put("/groups/{group_id}/members", response_model=GroupOut, dependencies=[Depends(require_outliner_admin)])
def set_group_members(group_id: str, body: GroupMembersUpdate, db: Session = Depends(get_db)):
    return group_ctrl.set_group_members(db, group_id, body.user_ids)


@router.delete("/groups/{group_id}", status_code=204, dependencies=[Depends(require_outliner_admin)])
def delete_group(group_id: str, db: Session = Depends(get_db)):
    group_ctrl.delete_group(db, group_id)
    return Response(status_code=204)
