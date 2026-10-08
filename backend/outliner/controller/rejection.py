"""Segment rejection helpers and mutations."""
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from outliner.models.outliner import OutlinerSegment
from outliner.repository import outliner_repository as outliner_repo
from outliner.controller.common import none_check
from outliner.utils.outliner_utils import validate_segment_status_transition


def update_segment_with_rejection_fields(db: Session, segment_list: List[dict]) -> None:
    """Attach nested `rejection` onto segment_list dicts (annotator document payload)."""
    outliner_repo.update_segment_with_rejection_fields(db, segment_list)


def latest_rejection_reason_for_orm_segment(
    db: Optional[Session], segment: OutlinerSegment
) -> Optional[str]:
    """Reason from the most recent rejection row, only meaningful when status is rejected."""
    return outliner_repo.latest_rejection_reason_for_orm_segment(db, segment)


def latest_rejection_reviewer_for_orm_segment(
    db: Optional[Session], segment: OutlinerSegment
) -> Optional[Dict[str, Any]]:
    """Reviewer profile from users via latest segment_rejections.reviewer_id → users.id."""
    return outliner_repo.latest_rejection_reviewer_for_orm_segment(db, segment)


def latest_rejection_resolved_for_orm_segment(
    db: Optional[Session], segment: OutlinerSegment
) -> Optional[bool]:
    """`resolved` on the latest segment_rejections row (annotator addressed reviewer feedback)."""
    return outliner_repo.latest_rejection_resolved_for_orm_segment(db, segment)


def latest_rejection_marked_spans_for_orm_segment(
    db: Optional[Session], segment: OutlinerSegment
) -> Optional[List[Dict[str, Any]]]:
    """Reviewer-marked wrong-text spans on the latest rejection row."""
    return outliner_repo.latest_rejection_marked_spans_for_orm_segment(db, segment)


def latest_rejection_title_author_for_orm_segment(
    db: Optional[Session], segment: OutlinerSegment
) -> Tuple[Optional[str], Optional[str]]:
    """Reviewer title/author saved on the latest rejection row."""
    return outliner_repo.latest_rejection_title_author_for_orm_segment(db, segment)


def reject_segment(
    db: Session,
    segment_id: str,
    reviewer_id: Optional[str] = None,
    rejection_reason: Optional[str] = None,
    marked_spans: Optional[List[Dict[str, Any]]] = None,
) -> OutlinerSegment:
    """Reject a checked segment and record the rejection event"""
    segment = outliner_repo.get_segment_plain(db, segment_id)
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")

    is_valid, error_msg = validate_segment_status_transition(segment.status, "rejected")
    if not is_valid:
        raise HTTPException(status_code=422, detail=error_msg)

    reason = none_check(rejection_reason, "Rejection comment is required")
    document = outliner_repo.fetch_document_by_id(db, segment.document_id)
    annotator_id = document.user_id if document else None

    outliner_repo.apply_rejection_to_segment(
        db, segment, annotator_id, reviewer_id, reason, _clamp_spans_to_segment(segment, marked_spans)
    )
    return segment


def _clamp_spans_to_segment(
    segment: OutlinerSegment, marked_spans: Optional[List[Dict[str, Any]]]
) -> Optional[List[Dict[str, Any]]]:
    """
    Keep only marks that fall inside the segment's own document range, clipped to it.

    Guards against a stale client sending offsets from a segment that has since been
    split or re-bounded, which would otherwise highlight text the reviewer never marked.
    """
    if not marked_spans:
        return None
    lo, hi = segment.span_start, segment.span_end
    cleaned: List[Dict[str, Any]] = []
    for span in marked_spans:
        start = max(int(span["start"]), lo)
        end = min(int(span["end"]), hi)
        if end <= start:
            continue
        entry: Dict[str, Any] = {"start": start, "end": end}
        note = (span.get("note") or "").strip()
        if note:
            entry["note"] = note
        cleaned.append(entry)
    return cleaned or None


def reject_segments_bulk(
    db: Session,
    segment_ids: List[str],
    reviewer_id: Optional[str] = None,
    rejection_reason: Optional[str] = None,
) -> List[OutlinerSegment]:
    """Reject multiple checked segments at once"""
    if not segment_ids:
        raise HTTPException(status_code=400, detail="segment_ids is required")

    reason = none_check(rejection_reason, "Rejection comment is required")
    try:
        return outliner_repo.reject_segments_bulk(db, segment_ids, reviewer_id, reason)
    except ValueError as e:
        if str(e) == "No segments found":
            raise HTTPException(status_code=404, detail=str(e)) from e
        raise


def get_segment_rejection_count(db: Session, segment_id: str) -> int:
    """Get the number of times a segment has been rejected"""
    return outliner_repo.get_segment_rejection_count(db, segment_id)


def list_segment_rejections(db: Session, segment_id: str) -> List[Dict[str, Any]]:
    """Full rejection history for a segment (newest first)."""
    segment = outliner_repo.get_segment_plain(db, segment_id)
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    return outliner_repo.list_rejections_for_segment(db, segment_id)
