

from fastapi import APIRouter, Depends

from outliner.deps import require_outliner_access

from . import ai_outline, assign_volume, dashboard, documents, groups, segments

router = APIRouter(dependencies=[Depends(require_outliner_access)])

router.include_router(documents.router)
router.include_router(segments.router)
router.include_router(dashboard.router)
router.include_router(assign_volume.router)
router.include_router(ai_outline.router)
router.include_router(groups.router)

__all__ = ["router"]
