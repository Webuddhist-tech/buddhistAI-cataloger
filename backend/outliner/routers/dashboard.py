"""Routes under ``/outliner/dashboard``."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.database import get_db
from outliner.controller.active_batch import (
    get_active_batch as get_active_batch_ctrl,
    update_active_batch as update_active_batch_ctrl,
)
from outliner.controller.outliner import (
    get_annotator_weekly_quality as get_annotator_weekly_quality_ctrl,
    get_dashboard_stats as get_dashboard_stats_ctrl,
    list_annotated_pending_review_documents as list_annotated_pending_review_documents_ctrl,
)
from outliner.controller.segment_review import (
    get_reviewer_stats as get_reviewer_stats_ctrl,
)
from outliner.repository.statistics import (
    get_annotator_approved_counts,
    get_reviewer_approved_counts,
)

from .schemas import (
    ActiveBatchResponse,
    ActiveBatchUpdate,
    AnnotatedPendingReviewDocumentsResponse,
    AnnotatorApprovedRow,
    AnnotatorWeeklyQualityResponse,
    AnnotatorWeeklyQualityRow,
    DashboardStatsResponse,
    ReviewerApprovedRow,
    ReviewerStatsResponse,
    StatisticsResponse,
)

router = APIRouter()


@router.get("/dashboard/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    user_id: Optional[str] = Query(None, description="Filter by annotator user ID"),
    start_date: Optional[datetime] = Query(None, description="Start of date range (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End of date range (ISO format)"),
    db: Session = Depends(get_db),
):
    """Return aggregate stats for the admin overview dashboard."""
    return get_dashboard_stats_ctrl(db, user_id=user_id, start_date=start_date, end_date=end_date)


@router.get(
    "/dashboard/annotated-pending-review-documents",
    response_model=AnnotatedPendingReviewDocumentsResponse,
)
async def annotated_pending_review_documents(
    user_id: Optional[str] = Query(None, description="Filter by annotator user ID"),
    start_date: Optional[datetime] = Query(None, description="Start of date range (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End of date range (ISO format)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    Documents behind the "Annotated (pending review)" stat on the overview dashboard.

    Same scope as ``annotated_segments`` in ``/dashboard/stats``: segments with a
    title/author set and status 'checked', on documents that aren't skipped or deleted.
    """
    return list_annotated_pending_review_documents_ctrl(
        db,
        user_id=user_id,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )


@router.get("/dashboard/annotator-weekly-quality", response_model=AnnotatorWeeklyQualityResponse)
async def annotator_weekly_quality(
    user_id: Optional[str] = Query(None, description="Filter by annotator user ID"),
    start_date: Optional[datetime] = Query(None, description="Start of date range (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End of date range (ISO format)"),
    bucket_by: str = Query(
        "reviewed",
        pattern="^(reviewed|annotated)$",
        description="Week anchor: 'reviewed' (reviewer decision) or 'annotated' (segment created)",
    ),
    db: Session = Depends(get_db),
):
    """
    Weekly volume and quality rates per annotator, for the scatter timeline.

    Separate from ``/dashboard/stats`` so the overview page keeps its current cost and this
    runs only when the timeline is opened. Rates count segments, so both stay within 100%.
    """
    rows = get_annotator_weekly_quality_ctrl(
        db,
        start_date=start_date,
        end_date=end_date,
        user_id=user_id,
        bucket_by=bucket_by,
    )
    return AnnotatorWeeklyQualityResponse(
        bucket_by=bucket_by,
        rows=[AnnotatorWeeklyQualityRow(**r) for r in rows],
    )


@router.get("/dashboard/reviewer-stats", response_model=ReviewerStatsResponse)
async def reviewer_stats(
    user_id: Optional[str] = Query(None, description="Filter by reviewer user ID"),
    start_date: Optional[datetime] = Query(None, description="Start of date range (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End of date range (ISO format)"),
    db: Session = Depends(get_db),
):
    """Segment summary and per-reviewer breakdown from view-only review-verification reviews."""
    return get_reviewer_stats_ctrl(db, user_id=user_id, start_date=start_date, end_date=end_date)


@router.get("/dashboard/statistics", response_model=StatisticsResponse)
async def get_statistics(
    user_id: Optional[str] = Query(None, description="Filter by annotator user ID"),
    start_date: Optional[datetime] = Query(None, description="Start of date range (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End of date range (ISO format)"),
    db: Session = Depends(get_db),
):
    """
    Annotator and reviewer approved-segment counts for the Statistics tab.

    Annotator approved rule: status='approved' (no reviewed_by_id requirement).
    Reviewer approved rule: status='approved' AND reviewed_by_id set.
    Date window: reviewed_at on the segment.

    With a user filter, the reviewer side splits into `reviewers` (who reviewed that
    user's annotations) and `reviewed_by_user` (that user's own review output).
    """
    annotator_rows = get_annotator_approved_counts(
        db, start_date=start_date, end_date=end_date, user_id=user_id
    )
    reviewer_rows = get_reviewer_approved_counts(
        db, start_date=start_date, end_date=end_date, user_id=user_id
    )
    reviewed_by_user_rows = (
        get_reviewer_approved_counts(
            db,
            start_date=start_date,
            end_date=end_date,
            user_id=user_id,
            scope="by_reviewer",
        )
        if user_id
        else []
    )
    return StatisticsResponse(
        annotators=[AnnotatorApprovedRow(**r) for r in annotator_rows],
        reviewers=[ReviewerApprovedRow(**r) for r in reviewer_rows],
        reviewed_by_user=[ReviewerApprovedRow(**r) for r in reviewed_by_user_rows],
    )


@router.get("/dashboard/active-batch", response_model=ActiveBatchResponse)
async def get_active_batch(db: Session = Depends(get_db)):
    """Return the admin-selected active BEC volume batch id, if any."""
    return get_active_batch_ctrl(db)


@router.put("/dashboard/active-batch", response_model=ActiveBatchResponse)
async def put_active_batch(body: ActiveBatchUpdate, db: Session = Depends(get_db)):
    """Set or clear the active BEC volume batch id."""
    return update_active_batch_ctrl(db, body.batch_id)
