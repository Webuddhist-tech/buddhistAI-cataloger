"""Cross-table aggregates for dashboard and annotator performance."""
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session

from user.models.user import User

from outliner.utils.bec_client.api import fetch_volume_batch_stats
from outliner.models.outliner import OutlinerDocument, OutlinerSegment, SegmentRejection
from outliner.repository.dashboard_view import build_dashboard_presentation
from outliner.repository.segment_rejection import latest_rejection_row_per_segment_subquery
from outliner.repository.statistics import (
    segment_added_by_annotator,
    segment_not_reviewers_own,
)

_REVIEWER_WORK_STATS_ROLES = frozenset({"reviewer", "admin"})


def _segment_review_activity_time():
    return OutlinerSegment.reviewed_at


def _append_segment_activity_date_window(
    clauses: List[Any],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
) -> None:
    """Restrict rows to review/approval activity inside the dashboard date range."""
    if start_date is None and end_date is None:
        return
    t = _segment_review_activity_time()
    if start_date is not None:
        clauses.append(t >= start_date)
    if end_date is not None:
        clauses.append(t <= end_date)


def _append_rejection_event_date_window(
    clauses: List[Any],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
) -> None:
    if start_date is None and end_date is None:
        return
    if start_date is not None:
        clauses.append(SegmentRejection.created_at >= start_date)
    if end_date is not None:
        clauses.append(SegmentRejection.created_at <= end_date)


def _append_latest_rejection_date_window(
    clauses: List[Any],
    latest_rej_sq: Any,
    start_date: Optional[datetime],
    end_date: Optional[datetime],
) -> None:
    """Latest unresolved rejection must have been filed in the dashboard window."""
    if start_date is None and end_date is None:
        return
    if start_date is not None:
        clauses.append(latest_rej_sq.c.latest_rejection_at >= start_date)
    if end_date is not None:
        clauses.append(latest_rej_sq.c.latest_rejection_at <= end_date)


def _apply_segment_activity_window_to_query(
    q: Any,
    start_date: Optional[datetime],
    end_date: Optional[datetime],
) -> Any:
    if start_date is None and end_date is None:
        return q
    t = _segment_review_activity_time()
    if start_date is not None:
        q = q.filter(t >= start_date)
    if end_date is not None:
        q = q.filter(t <= end_date)
    return q


def _is_reviewer_or_admin_role(role: Optional[str]) -> bool:
    """Same normalization as ``outliner.deps.is_user_admin_or_reviewer`` role check."""
    norm = (role or "user").strip().lower()
    return norm in _REVIEWER_WORK_STATS_ROLES


def get_reviewer_segment_activity(
    db: Session,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    user_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Per-reviewer counts for segments, scoped to non-deleted documents.

    Documents use the same filters as dashboard stats: ``created_at`` when dates are set, and
    optional ``user_id`` (annotator) to match the document dropdown. Segment/rejection metrics are
    further limited to activity in that window (see annotator performance breakdown).

    ``segments_recorded_as_reviewer``: checked/approved segments where ``reviewed_by_id`` is set.

    ``reviewed_segments_with_title_or_author``: recorded segments where annotator title or author is set.

    ``reviewer_title_author_edits``: approved segments with real title/author corrections, or
    that the reviewer split/merged.

    ``reviewer_rejection_count``: rejection rows filed in range (when dates set).

    Segments the reviewer added themselves are not counted as reviewed (see Statistics page
    ``segments_annotated``).
    """
    doc_filters = [
        (OutlinerDocument.status != "deleted") | (OutlinerDocument.status.is_(None))
    ]
    segment_activity_t = _segment_review_activity_time()
    if start_date:
        doc_filters.append(segment_activity_t >= start_date)
    if end_date:
        doc_filters.append(segment_activity_t <= end_date)
    if user_id:
        doc_filters.append(OutlinerDocument.user_id == user_id)
    doc_scope = and_(*doc_filters)

    reviewed_when = or_(
        OutlinerSegment.status == "checked",
        OutlinerSegment.status == "approved",
    )

    recorded_clauses: List[Any] = [
        doc_scope,
        reviewed_when,
        OutlinerSegment.reviewed_by_id.isnot(None),
        segment_not_reviewers_own(),
    ]
    _append_segment_activity_date_window(recorded_clauses, start_date, end_date)
    recorded_rows = (
        db.query(OutlinerSegment.reviewed_by_id, func.count(OutlinerSegment.id))
        .join(OutlinerDocument, OutlinerSegment.document_id == OutlinerDocument.id)
        .filter(and_(*recorded_clauses))
        .group_by(OutlinerSegment.reviewed_by_id)
        .all()
    )
    recorded: Dict[str, int] = {
        str(rid): int(cnt) for rid, cnt in recorded_rows if rid is not None
    }

    has_title_or_author = or_(
        and_(OutlinerSegment.title.isnot(None), OutlinerSegment.title != ""),
        and_(OutlinerSegment.author.isnot(None), OutlinerSegment.author != ""),
    )
    titled_clauses: List[Any] = [
        doc_scope,
        reviewed_when,
        OutlinerSegment.reviewed_by_id.isnot(None),
        segment_not_reviewers_own(),
        has_title_or_author,
    ]
    _append_segment_activity_date_window(titled_clauses, start_date, end_date)
    titled_rows = (
        db.query(OutlinerSegment.reviewed_by_id, func.count(OutlinerSegment.id))
        .join(OutlinerDocument, OutlinerSegment.document_id == OutlinerDocument.id)
        .filter(and_(*titled_clauses))
        .group_by(OutlinerSegment.reviewed_by_id)
        .all()
    )
    titled_by_reviewer: Dict[str, int] = {
        str(rid): int(cnt) for rid, cnt in titled_rows if rid is not None
    }

    rt = OutlinerSegment.reviewer_title
    ra = OutlinerSegment.reviewer_author
    t = OutlinerSegment.title
    au = OutlinerSegment.author
    rt_trim = func.trim(func.coalesce(rt, ""))
    ra_trim = func.trim(func.coalesce(ra, ""))
    t_trim = func.trim(func.coalesce(t, ""))
    au_trim = func.trim(func.coalesce(au, ""))
    title_is_real_correction = and_(
        rt.isnot(None),
        func.length(rt_trim) > 0,
        rt_trim != t_trim,
    )
    author_is_real_correction = and_(
        ra.isnot(None),
        func.length(ra_trim) > 0,
        ra_trim != au_trim,
    )
    corr_clauses: List[Any] = [
        doc_scope,
        OutlinerSegment.status == "approved",
        OutlinerSegment.reviewed_by_id.isnot(None),
        segment_not_reviewers_own(),
        or_(
            title_is_real_correction,
            author_is_real_correction,
            OutlinerSegment.corrected_by_reviewer.is_(True),
        ),
    ]
    _append_segment_activity_date_window(corr_clauses, start_date, end_date)
    correction_rows = (
        db.query(OutlinerSegment.reviewed_by_id, func.count(OutlinerSegment.id))
        .join(OutlinerDocument, OutlinerSegment.document_id == OutlinerDocument.id)
        .filter(and_(*corr_clauses))
        .group_by(OutlinerSegment.reviewed_by_id)
        .all()
    )
    corrections: Dict[str, int] = {
        str(rid): int(cnt) for rid, cnt in correction_rows if rid is not None
    }

    rr_clauses: List[Any] = [doc_scope, SegmentRejection.reviewer_id.isnot(None)]
    _append_rejection_event_date_window(rr_clauses, start_date, end_date)
    reviewer_rej_rows = (
        db.query(SegmentRejection.reviewer_id, func.count(SegmentRejection.id))
        .join(OutlinerSegment, SegmentRejection.segment_id == OutlinerSegment.id)
        .join(OutlinerDocument, OutlinerSegment.document_id == OutlinerDocument.id)
        .filter(and_(*rr_clauses))
        .group_by(SegmentRejection.reviewer_id)
        .all()
    )
    rejection_by_reviewer: Dict[str, int] = {
        str(rid): int(cnt) for rid, cnt in reviewer_rej_rows if rid is not None
    }

    role_norm = func.lower(func.trim(User.role))
    reviewer_id_rows = (
        db.query(User.id, User.role)
        .filter(
            User.role.isnot(None),
            role_norm.in_(tuple(_REVIEWER_WORK_STATS_ROLES)),
        )
        .all()
    )
    reviewer_ids = [
        str(uid)
        for uid, role in reviewer_id_rows
        if role is not None and _is_reviewer_or_admin_role(role)
    ]

    rows: List[Dict[str, Any]] = []
    for uid in reviewer_ids:
        rec = recorded.get(uid, 0)
        titled = titled_by_reviewer.get(uid, 0)
        corr = corrections.get(uid, 0)
        rej = rejection_by_reviewer.get(uid, 0)
        rows.append(
            {
                "user_id": uid,
                "segments_recorded_as_reviewer": rec,
                "reviewed_segments_with_title_or_author": titled,
                "reviewer_title_author_edits": corr,
                "reviewer_rejection_count": rej,
            }
        )
    rows.sort(
        key=lambda r: (
            r["segments_recorded_as_reviewer"]
            + r["reviewer_title_author_edits"]
            + r["reviewer_rejection_count"],
            r["segments_recorded_as_reviewer"],
            r["reviewer_rejection_count"],
        ),
        reverse=True,
    )
    return rows


def get_annotator_performance_breakdown(
    db: Session,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    user_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    doc_filters = [
        (OutlinerDocument.status != "deleted") | (OutlinerDocument.status.is_(None))
    ]
    if start_date:
        doc_filters.append(OutlinerDocument.created_at >= start_date)
    if end_date:
        doc_filters.append(OutlinerDocument.created_at <= end_date)
    if user_id:
        doc_filters.append(OutlinerDocument.user_id == user_id)
    doc_scope = and_(*doc_filters)

    title_or_author = case(
        (
            or_(
                and_(OutlinerSegment.title.isnot(None), OutlinerSegment.title != ""),
                and_(OutlinerSegment.author.isnot(None), OutlinerSegment.author != ""),
            ),
            1,
        ),
        else_=0,
    )

    doc_rows = (
        db.query(OutlinerDocument.user_id, func.count(OutlinerDocument.id))
        .filter(doc_scope)
        .group_by(OutlinerDocument.user_id)
        .all()
    )
    # Per-annotator segment metrics leave out segments the reviewer added during review;
    # those are the reviewer's work (Statistics page `segments_annotated`).
    seg_rows = (
        db.query(
            OutlinerDocument.user_id,
            func.count(OutlinerSegment.id),
            func.sum(title_or_author),
        )
        .join(OutlinerSegment, OutlinerSegment.document_id == OutlinerDocument.id)
        .filter(doc_scope, segment_added_by_annotator())
        .group_by(OutlinerDocument.user_id)
        .all()
    )
    has_title_or_author_seg = or_(
        and_(OutlinerSegment.title.isnot(None), OutlinerSegment.title != ""),
        and_(OutlinerSegment.author.isnot(None), OutlinerSegment.author != ""),
    )
    approved_seg_clauses: List[Any] = [
        doc_scope,
        OutlinerSegment.status == "approved",
        has_title_or_author_seg,
        segment_added_by_annotator(),
    ]
    _append_segment_activity_date_window(approved_seg_clauses, start_date, end_date)
    approved_seg_rows = (
        db.query(OutlinerDocument.user_id, func.count(OutlinerSegment.id))
        .join(OutlinerSegment, OutlinerSegment.document_id == OutlinerDocument.id)
        .filter(and_(*approved_seg_clauses))
        .group_by(OutlinerDocument.user_id)
        .all()
    )
    latest_rej_sq = latest_rejection_row_per_segment_subquery(db)
    rej_join: List[Any] = [
        OutlinerSegment.id == latest_rej_sq.c.segment_id,
        latest_rej_sq.c.rn == 1,
        or_(
            latest_rej_sq.c.resolved.is_(False),
            latest_rej_sq.c.resolved.is_(None),
        ),
    ]
    _append_latest_rejection_date_window(rej_join, latest_rej_sq, start_date, end_date)
    rej_rows = (
        db.query(OutlinerDocument.user_id, func.count(OutlinerSegment.id))
        .join(OutlinerSegment, OutlinerSegment.document_id == OutlinerDocument.id)
        .join(latest_rej_sq, and_(*rej_join))
        .filter(doc_scope)
        .filter(OutlinerSegment.status == "rejected")
        .group_by(OutlinerDocument.user_id)
        .all()
    )

    reviewed_when = or_(
        OutlinerSegment.status == "checked",
        OutlinerSegment.status == "approved",
    )

    review_clauses: List[Any] = [
        doc_scope,
        OutlinerSegment.reviewed_by_id.isnot(None),
        reviewed_when,
        segment_not_reviewers_own(),
    ]
    _append_segment_activity_date_window(review_clauses, start_date, end_date)
    review_rows = (
        db.query(OutlinerSegment.reviewed_by_id, func.count(OutlinerSegment.id))
        .join(OutlinerDocument, OutlinerSegment.document_id == OutlinerDocument.id)
        .filter(and_(*review_clauses))
        .group_by(OutlinerSegment.reviewed_by_id)
        .all()
    )

    self_clauses: List[Any] = [
        doc_scope,
        OutlinerSegment.reviewed_by_id.isnot(None),
        OutlinerDocument.user_id == OutlinerSegment.reviewed_by_id,
        reviewed_when,
    ]
    _append_segment_activity_date_window(self_clauses, start_date, end_date)
    self_review_rows = (
        db.query(OutlinerSegment.reviewed_by_id, func.count(OutlinerSegment.id))
        .join(OutlinerDocument, OutlinerSegment.document_id == OutlinerDocument.id)
        .filter(and_(*self_clauses))
        .group_by(OutlinerSegment.reviewed_by_id)
        .all()
    )

    reviewer_rej_clauses: List[Any] = [doc_scope, SegmentRejection.reviewer_id.isnot(None)]
    _append_rejection_event_date_window(reviewer_rej_clauses, start_date, end_date)
    reviewer_rej_rows = (
        db.query(SegmentRejection.reviewer_id, func.count(SegmentRejection.id))
        .join(OutlinerSegment, SegmentRejection.segment_id == OutlinerSegment.id)
        .join(OutlinerDocument, OutlinerSegment.document_id == OutlinerDocument.id)
        .filter(and_(*reviewer_rej_clauses))
        .group_by(SegmentRejection.reviewer_id)
        .all()
    )

    annotator_for_rejection_events = func.coalesce(
        SegmentRejection.user_id,
        OutlinerDocument.user_id,
    )
    rej_ev_clauses: List[Any] = [doc_scope]
    _append_rejection_event_date_window(rej_ev_clauses, start_date, end_date)
    rejection_event_rows = (
        db.query(annotator_for_rejection_events, func.count(SegmentRejection.id))
        .select_from(SegmentRejection)
        .join(OutlinerSegment, SegmentRejection.segment_id == OutlinerSegment.id)
        .join(OutlinerDocument, OutlinerSegment.document_id == OutlinerDocument.id)
        .filter(and_(*rej_ev_clauses))
        .group_by(annotator_for_rejection_events)
        .all()
    )

    rta_clauses: List[Any] = [
        doc_scope,
        OutlinerSegment.status == "approved",
        segment_added_by_annotator(),
        or_(
            OutlinerSegment.reviewer_title.isnot(None),
            OutlinerSegment.reviewer_author.isnot(None),
            OutlinerSegment.corrected_by_reviewer.is_(True),
        ),
    ]
    _append_segment_activity_date_window(rta_clauses, start_date, end_date)
    reviewer_title_author_edit_rows = (
        db.query(OutlinerDocument.user_id, func.count(OutlinerSegment.id))
        .join(OutlinerSegment, OutlinerSegment.document_id == OutlinerDocument.id)
        .filter(and_(*rta_clauses))
        .group_by(OutlinerDocument.user_id)
        .all()
    )

    def _default_row() -> Dict[str, int]:
        return {
            "document_count": 0,
            "segment_count": 0,
            "segments_with_title_or_author": 0,
            "rejection_count": 0,
            "rejection_event_count": 0,
            "segments_reviewed": 0,
            "segments_self_reviewed": 0,
            "reviewer_rejection_count": 0,
            "segments_reviewer_corrected_title_or_author": 0,
            "segments_approved": 0,
        }

    by_user: Dict[Any, Dict[str, int]] = {}
    for uid, cnt in doc_rows:
        by_user.setdefault(uid, _default_row())
        by_user[uid]["document_count"] = int(cnt)
    for uid, seg_cnt, titled in seg_rows:
        by_user.setdefault(uid, _default_row())
        by_user[uid]["segment_count"] = int(seg_cnt)
        by_user[uid]["segments_with_title_or_author"] = int(titled or 0)
    for uid, appr_cnt in approved_seg_rows:
        by_user.setdefault(uid, _default_row())
        by_user[uid]["segments_approved"] = int(appr_cnt)
    for uid, rej_cnt in rej_rows:
        by_user.setdefault(uid, _default_row())
        by_user[uid]["rejection_count"] = int(rej_cnt)

    for rid, cnt in review_rows:
        by_user.setdefault(rid, _default_row())
        by_user[rid]["segments_reviewed"] = int(cnt)
    for rid, cnt in self_review_rows:
        by_user.setdefault(rid, _default_row())
        by_user[rid]["segments_self_reviewed"] = int(cnt)
    for rid, cnt in reviewer_rej_rows:
        by_user.setdefault(rid, _default_row())
        by_user[rid]["reviewer_rejection_count"] = int(cnt)

    for uid, ev_cnt in rejection_event_rows:
        by_user.setdefault(uid, _default_row())
        by_user[uid]["rejection_event_count"] = int(ev_cnt)

    for uid, edit_cnt in reviewer_title_author_edit_rows:
        by_user.setdefault(uid, _default_row())
        by_user[uid]["segments_reviewer_corrected_title_or_author"] = int(edit_cnt)

    rows: List[Dict[str, Any]] = []
    for uid, m in by_user.items():
        seg_cnt = m["segment_count"]
        rej_ev = m["rejection_event_count"]
        rejection_events_pct = (
            round((rej_ev / seg_cnt) * 100, 1) if seg_cnt else None
        )
        rows.append(
            {
                "user_id": uid,
                "document_count": m["document_count"],
                "segment_count": m["segment_count"],
                "segments_with_title_or_author": m["segments_with_title_or_author"],
                "rejection_count": m["rejection_count"],
                "rejection_event_count": rej_ev,
                "rejection_events_pct_of_segments": rejection_events_pct,
                "segments_reviewed": m["segments_reviewed"],
                "segments_self_reviewed": m["segments_self_reviewed"],
                "reviewer_rejection_count": m["reviewer_rejection_count"],
                "segments_reviewer_corrected_title_or_author": m[
                    "segments_reviewer_corrected_title_or_author"
                ],
                "segments_approved": m["segments_approved"],
            }
        )
    rows.sort(
        key=lambda r: (
            r["segments_with_title_or_author"]
            + r["segments_reviewed"]
            + r["reviewer_rejection_count"],
            r["segment_count"],
        ),
        reverse=True,
    )
    return rows


def get_dashboard_stats(
    db: Session,
    user_id: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> Dict[str, Any]:
    doc_query_base = db.query(OutlinerDocument.id).filter(
        (OutlinerDocument.status != "deleted") | (OutlinerDocument.status.is_(None))
    )
    if start_date:
        doc_query_base = doc_query_base.filter(OutlinerDocument.created_at >= start_date)
    if end_date:
        doc_query_base = doc_query_base.filter(OutlinerDocument.created_at <= end_date)

    doc_query = doc_query_base
    if user_id:
        doc_query = doc_query.filter(OutlinerDocument.user_id == user_id)

    doc_ids_subq = doc_query.subquery()

    document_count = db.query(func.count()).select_from(doc_ids_subq).scalar() or 0

    seg_base = db.query(OutlinerSegment).filter(
        OutlinerSegment.document_id.in_(db.query(doc_ids_subq.c.id))
    )

    total_segments = seg_base.with_entities(func.count(OutlinerSegment.id)).scalar() or 0

    has_title_or_author = or_(
        and_(OutlinerSegment.title.isnot(None), OutlinerSegment.title != ""),
        and_(OutlinerSegment.author.isnot(None), OutlinerSegment.author != ""),
    )
    segment_reviewed_when = OutlinerSegment.status == "approved"
    segment_pending_review_when = OutlinerSegment.status == "checked"
    segment_rejected_when = OutlinerSegment.status == "rejected"
    segment_unchecked_when = or_(
        OutlinerSegment.status.is_(None), OutlinerSegment.status == "unchecked"
    )
    segments_with_title_or_author = (
        seg_base.filter(has_title_or_author)
        .with_entities(func.count(OutlinerSegment.id))
        .scalar()
        or 0
    )

    reviewed_segments = (
        _apply_segment_activity_window_to_query(
            seg_base.filter(has_title_or_author, segment_reviewed_when),
            start_date,
            end_date,
        )
        .with_entities(func.count(OutlinerSegment.id))
        .scalar()
        or 0
    )

    # annotated_segments = (
    #     _apply_segment_activity_window_to_query(
    #         seg_base.filter(has_title_or_author, segment_pending_review_when),
    #         start_date,
    #         end_date,
    #     )
    #     .with_entities(func.count(OutlinerSegment.id))
    #     .scalar()
    #     or 0
    # )
    reviewable_doc_ids_subq = (
        doc_query.filter(OutlinerDocument.status != "skipped").subquery()
    )
    annotated_segments = (
        seg_base.filter(
            has_title_or_author,
            segment_pending_review_when,
            OutlinerSegment.document_id.in_(db.query(reviewable_doc_ids_subq.c.id)),
        )
        .with_entities(func.count(OutlinerSegment.id))
        .scalar()
        or 0
    )

    rejected_segments_with_title_or_author = (
        seg_base.filter(has_title_or_author, segment_rejected_when)
        .with_entities(func.count(OutlinerSegment.id))
        .scalar()
        or 0
    )

    unchecked_segments_with_title_or_author = (
        seg_base.filter(has_title_or_author, segment_unchecked_when)
        .with_entities(func.count(OutlinerSegment.id))
        .scalar()
        or 0
    )

    annotating_segments = (
        seg_base.filter(segment_unchecked_when)
        .with_entities(func.count(OutlinerSegment.id))
        .scalar()
        or 0
    )

    latest_rej_sq = latest_rejection_row_per_segment_subquery(db)
    dash_rej_join: List[Any] = [
        OutlinerSegment.id == latest_rej_sq.c.segment_id,
        latest_rej_sq.c.rn == 1,
        or_(
            latest_rej_sq.c.resolved.is_(False),
            latest_rej_sq.c.resolved.is_(None),
        ),
    ]
    _append_latest_rejection_date_window(dash_rej_join, latest_rej_sq, start_date, end_date)
    rejection_count = (
        seg_base.join(latest_rej_sq, and_(*dash_rej_join))
        .filter(OutlinerSegment.status == "rejected")
        .with_entities(func.count(OutlinerSegment.id))
        .scalar()
        or 0
    )

    # Match get_annotator_performance_breakdown self_review_rows: reviewer recorded
    # while segment is checked or approved (not approved-only).
    segment_reviewed_or_checked = or_(
        OutlinerSegment.status == "checked",
        OutlinerSegment.status == "approved",
    )

    doc_id_filter = OutlinerDocument.id.in_(db.query(doc_ids_subq.c.id))

    doc_status_rows = (
        db.query(OutlinerDocument.status, func.count(OutlinerDocument.id))
        .filter(doc_id_filter)
        .group_by(OutlinerDocument.status)
        .all()
    )
    document_status_counts: Dict[str, int] = {}
    for status_val, cnt in doc_status_rows:
        key = status_val if status_val else "unknown"
        document_status_counts[key] = int(cnt)

    doc_category_rows = (
        db.query(OutlinerDocument.category, func.count(OutlinerDocument.id))
        .filter(doc_id_filter)
        .group_by(OutlinerDocument.category)
        .all()
    )
    document_category_counts: Dict[str, int] = {}
    for cat_val, cnt in doc_category_rows:
        key = cat_val if cat_val else "uncategorized"
        document_category_counts[key] = int(cnt)

    seg_status_rows = (
        db.query(OutlinerSegment.status, func.count(OutlinerSegment.id))
        .filter(OutlinerSegment.document_id.in_(db.query(doc_ids_subq.c.id)))
        .group_by(OutlinerSegment.status)
        .all()
    )
    segment_status_counts: Dict[str, int] = {}
    for status_val, cnt in seg_status_rows:
        key = status_val if status_val else "unchecked"
        segment_status_counts[key] = int(cnt)

    label_rows = (
        db.query(OutlinerSegment.label, func.count(OutlinerSegment.id))
        .filter(OutlinerSegment.document_id.in_(db.query(doc_ids_subq.c.id)))
        .group_by(OutlinerSegment.label)
        .all()
    )
    segment_label_counts: Dict[str, int] = {}
    for label_val, cnt in label_rows:
        if label_val is not None:
            key = label_val.value if hasattr(label_val, "value") else str(label_val)
        else:
            key = "unset"
        segment_label_counts[key] = int(cnt)

    segments_with_bdrc_id = (
        seg_base.filter(
            (OutlinerSegment.title_bdrc_id.isnot(None) & (OutlinerSegment.title_bdrc_id != ""))
            | (
                OutlinerSegment.author_bdrc_id.isnot(None)
                & (OutlinerSegment.author_bdrc_id != "")
            )
        )
        .with_entities(func.count(OutlinerSegment.id))
        .scalar()
        or 0
    )

    segments_with_parent = (
        seg_base.filter(OutlinerSegment.parent_segment_id.isnot(None))
        .with_entities(func.count(OutlinerSegment.id))
        .scalar()
        or 0
    )

    segments_with_comments = (
        seg_base.filter(
            OutlinerSegment.status == "rejected",
            OutlinerSegment.comment.isnot(None),
        )
        .with_entities(func.count(OutlinerSegment.id))
        .scalar()
        or 0
    )

    segments_reviewer_corrected_title_or_author = (
        _apply_segment_activity_window_to_query(
            seg_base.filter(
                OutlinerSegment.status == "approved",
                # Annotator's segments only; seg_base has no document join, and only the
                # reviewer's split sets created_by_id.
                OutlinerSegment.created_by_id.is_(None),
                or_(
                    OutlinerSegment.reviewer_title.isnot(None),
                    OutlinerSegment.reviewer_author.isnot(None),
                    OutlinerSegment.corrected_by_reviewer.is_(True),
                ),
            ),
            start_date,
            end_date,
        )
        .with_entities(func.count(OutlinerSegment.id))
        .scalar()
        or 0
    )

   

    annotation_coverage_pct = (
        round((segments_with_title_or_author / total_segments) * 100, 1)
        if total_segments
        else 0.0
    )

    annotator_performance = get_annotator_performance_breakdown(
        db, start_date=start_date, end_date=end_date, user_id=user_id
    )

    reviewer_segment_activity = get_reviewer_segment_activity(
        db, start_date=start_date, end_date=end_date, user_id=user_id
    )

    volume_batch_stats = fetch_volume_batch_stats()

    raw_stats = {
        "document_count": document_count,
        "total_segments": total_segments,
        "segments_with_title_or_author": segments_with_title_or_author,
        "reviewed_segments": reviewed_segments,
        "annotated_segments": annotated_segments,
        "rejected_segments_with_title_or_author": rejected_segments_with_title_or_author,
        "unchecked_segments_with_title_or_author": unchecked_segments_with_title_or_author,
        "annotating_segments": annotating_segments,
        "rejection_count": rejection_count,
        "document_status_counts": document_status_counts,
        "document_category_counts": document_category_counts,
        "segment_status_counts": segment_status_counts,
        "segment_label_counts": segment_label_counts,
        "segments_with_bdrc_id": segments_with_bdrc_id,
        "segments_with_parent": segments_with_parent,
        "segments_with_comments": segments_with_comments,
        "segments_reviewer_corrected_title_or_author": segments_reviewer_corrected_title_or_author,
        "annotation_coverage_pct": annotation_coverage_pct,
        "annotator_performance": annotator_performance,
        "reviewer_segment_activity": reviewer_segment_activity,
        "volume_batch_stats": volume_batch_stats,
    }
    raw_stats["presentation"] = build_dashboard_presentation(db, raw_stats)
    return raw_stats


def list_annotated_pending_review_documents(
    db: Session,
    user_id: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 30,
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Per-document drill-down behind the "Annotated (pending review)" dashboard stat.

    Same scope as ``annotated_segments`` in ``get_dashboard_stats``: segments with a
    title or author set, status == "checked", on documents that are not skipped or
    deleted. Grouped by document, newest updated first.
    """
    has_title_or_author = or_(
        and_(OutlinerSegment.title.isnot(None), OutlinerSegment.title != ""),
        and_(OutlinerSegment.author.isnot(None), OutlinerSegment.author != ""),
    )
    filters = [
        has_title_or_author,
        OutlinerSegment.status == "checked",
        OutlinerDocument.status != "skipped",
        (OutlinerDocument.status != "deleted") | (OutlinerDocument.status.is_(None)),
    ]
    if user_id:
        filters.append(OutlinerDocument.user_id == user_id)
    if start_date:
        filters.append(OutlinerDocument.created_at >= start_date)
    if end_date:
        filters.append(OutlinerDocument.created_at <= end_date)

    join_clause = OutlinerSegment.document_id == OutlinerDocument.id

    total = (
        db.query(func.count(func.distinct(OutlinerSegment.document_id)))
        .join(OutlinerDocument, join_clause)
        .filter(*filters)
        .scalar()
        or 0
    )

    rows = (
        db.query(
            OutlinerSegment.document_id,
            OutlinerDocument.filename,
            OutlinerDocument.user_id,
            OutlinerDocument.updated_at,
            func.count(OutlinerSegment.id).label("segment_count"),
        )
        .join(OutlinerDocument, join_clause)
        .filter(*filters)
        .group_by(
            OutlinerSegment.document_id,
            OutlinerDocument.filename,
            OutlinerDocument.user_id,
            OutlinerDocument.updated_at,
        )
        .order_by(OutlinerDocument.updated_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    annotator_ids = {row.user_id for row in rows if row.user_id}
    names: Dict[str, str] = {}
    if annotator_ids:
        for uid, name in db.query(User.id, User.name).filter(User.id.in_(annotator_ids)).all():
            clean = (name or "").strip()
            names[str(uid)] = clean if clean else str(uid)

    doc_rows = [
        {
            "document_id": row.document_id,
            "filename": (row.filename or "").strip() or "(untitled)",
            "annotator_user_id": row.user_id,
            "annotator_name": names.get(str(row.user_id), "Unassigned") if row.user_id else "Unassigned",
            "segment_count": int(row.segment_count),
            "updated_at": row.updated_at,
        }
        for row in rows
    ]
    return doc_rows, int(total)


_WEEKLY_BUCKET_FIELDS = frozenset({"annotated", "reviewed"})


def _weekly_bucket_time(bucket_by: str):
    """
    Week anchor for the annotator timeline.

    ``reviewed`` buckets by when the reviewer decided (``reviewed_at``): a week's numbers
    settle once it passes. ``annotated`` buckets by when the segment was created, which
    attributes work to when the annotator did it, but recent weeks keep moving as their
    review lands later.
    """
    if bucket_by == "annotated":
        return OutlinerSegment.created_at
    return OutlinerSegment.reviewed_at


def get_annotator_weekly_quality(
    db: Session,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    user_id: Optional[str] = None,
    bucket_by: str = "reviewed",
) -> List[Dict[str, Any]]:
    """
    Per-annotator, per-week volume and quality rates for the scatter timeline.

    One denominator for both rates: ``approved`` is the segments reviewed that week (with an
    annotator title/author). ``edited`` and ``rejected`` are subsets of those same segments -
    the ones the reviewer corrected, and the ones rejected at some point before approval - so
    every rate is a share of reviewed work and cannot exceed 100%. Counted per segment, never
    per rejection event, since one segment can be rejected repeatedly.

    ``clean`` completes the three-way split (clean + edited + rejected == approved), matching
    the stacked-bar view where the buckets sum to 100%.

    Read-only and independent of :func:`get_dashboard_stats`.
    """
    if bucket_by not in _WEEKLY_BUCKET_FIELDS:
        bucket_by = "reviewed"

    doc_filters = [
        (OutlinerDocument.status != "deleted") | (OutlinerDocument.status.is_(None))
    ]
    if user_id:
        doc_filters.append(OutlinerDocument.user_id == user_id)
    doc_scope = and_(*doc_filters)

    has_title_or_author = or_(
        and_(OutlinerSegment.title.isnot(None), OutlinerSegment.title != ""),
        and_(OutlinerSegment.author.isnot(None), OutlinerSegment.author != ""),
    )

    seg_time = _weekly_bucket_time(bucket_by)
    seg_week = func.date_trunc("week", seg_time)

    approved_clauses: List[Any] = [
        doc_scope,
        OutlinerSegment.status == "approved",
        has_title_or_author,
        seg_time.isnot(None),
        # The reviewer's added segments are their work, not this annotator's.
        segment_added_by_annotator(),
    ]
    if start_date is not None:
        approved_clauses.append(seg_time >= start_date)
    if end_date is not None:
        approved_clauses.append(seg_time <= end_date)

    # Counted on the same segments as the denominator: of the segments reviewed this week, how
    # many were rejected at some point. Bucketing rejections by their own filing date instead
    # divides two unrelated sets of segments and can exceed 100%.
    was_rejected = (
        db.query(SegmentRejection.segment_id)
        .filter(SegmentRejection.segment_id == OutlinerSegment.id)
        .exists()
    )
    # A rejected segment may also carry a reviewer correction. Count it once, under the more
    # serious outcome, so clean + edited + rejected == approved. Decided per segment: most
    # rejected segments carry no correction, so subtracting the rejected total from the edited
    # total afterwards undercounts corrections.
    edited_when = and_(
        or_(
            OutlinerSegment.reviewer_title.isnot(None),
            OutlinerSegment.reviewer_author.isnot(None),
            # The reviewer split/merged it instead of rejecting.
            OutlinerSegment.corrected_by_reviewer.is_(True),
        ),
        ~was_rejected,
    )
    approved_rows = (
        db.query(
            OutlinerDocument.user_id,
            seg_week.label("week"),
            func.count(OutlinerSegment.id).label("approved"),
            func.sum(case((edited_when, 1), else_=0)).label("edited"),
        )
        .join(OutlinerSegment, OutlinerSegment.document_id == OutlinerDocument.id)
        .filter(and_(*approved_clauses))
        .group_by(OutlinerDocument.user_id, seg_week)
        .all()
    )

    rejected_rows = (
        db.query(
            OutlinerDocument.user_id,
            seg_week.label("week"),
            func.count(OutlinerSegment.id).label("rejected"),
        )
        .join(OutlinerSegment, OutlinerSegment.document_id == OutlinerDocument.id)
        .filter(and_(*approved_clauses, was_rejected))
        .group_by(OutlinerDocument.user_id, seg_week)
        .all()
    )

    buckets: Dict[Any, Dict[str, Any]] = {}

    def _slot(uid: Any, week: Any) -> Dict[str, Any]:
        key = (str(uid) if uid is not None else None, week)
        row = buckets.get(key)
        if row is None:
            row = {
                "user_id": key[0],
                "week": week,
                "approved": 0,
                "edited": 0,
                "rejected": 0,
            }
            buckets[key] = row
        return row

    for uid, week, approved, edited in approved_rows:
        slot = _slot(uid, week)
        slot["approved"] = int(approved or 0)
        slot["edited"] = int(edited or 0)
    for uid, week, rejected in rejected_rows:
        _slot(uid, week)["rejected"] = int(rejected or 0)

    names_by_id = _load_weekly_display_names(db, [r["user_id"] for r in buckets.values()])

    rows: List[Dict[str, Any]] = []
    for row in buckets.values():
        approved = row["approved"]
        rejected = row["rejected"]
        edited_only = row["edited"]
        clean = max(approved - rejected - edited_only, 0)
        rows.append(
            {
                "user_id": row["user_id"],
                "name": names_by_id.get(row["user_id"] or "", "Unknown"),
                "week": row["week"].date().isoformat() if row["week"] else None,
                "approved": approved,
                "edited": edited_only,
                "rejected": rejected,
                "clean": clean,
                "edits_pct": round(edited_only * 1000 / approved) / 10 if approved else 0.0,
                "rejection_pct": round(rejected * 1000 / approved) / 10 if approved else 0.0,
                "clean_pct": round(clean * 1000 / approved) / 10 if approved else 0.0,
            }
        )
    rows.sort(key=lambda r: (r["week"] or "", -r["approved"]))
    return rows


def _load_weekly_display_names(db: Session, user_ids: List[Any]) -> Dict[str, str]:
    ids = {str(u) for u in user_ids if u}
    if not ids:
        return {}
    out: Dict[str, str] = {}
    for uid, name, email in (
        db.query(User.id, User.name, User.email).filter(User.id.in_(ids)).all()
    ):
        label = (name or "").strip() or (email or "").strip() or str(uid)
        out[str(uid)] = label
    return out
