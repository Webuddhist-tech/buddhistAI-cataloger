"""Top-level ``/outliner/assign_volume`` route."""

from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.database import get_db
from outliner.controller.document import get_assign_volume_eligibility
from outliner.controller.outliner import assign_volume as assign_volume_ctrl
from outliner.deps import require_outliner_access
from user.models.user import User

from .schemas import AssignVolumeRequest

router = APIRouter()


@router.get("/assign_volume/eligibility")
def assign_volume_eligibility(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_outliner_access),
):
  
    return get_assign_volume_eligibility(db, current_user.id)


@router.post("/assign_volume")
async def assign_volume(
    body: Optional[AssignVolumeRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_outliner_access),
):
    """Give the caller the next volume from their group's batch."""
    document = await assign_volume_ctrl(db, current_user, body.group_id if body else None)
    return document
