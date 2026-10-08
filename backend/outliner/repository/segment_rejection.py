"""SQLAlchemy data access for segment_rejection rows and related lookups."""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from user.models.user import User
from outliner.models.outliner import OutlinerSegment, SegmentRejection
from outliner.repository.segment_review import (
    apply_segment_review_metadata,
    apply_segment_review_title_author_tracking,
)


def latest_rejection_row_per_segment_subquery(db: Session):
    """Row-numbered segment_rejections: rn=1 is the newest row per segment."""
    rn = (
        func.row_number()
        .over(
            partition_by=SegmentRejection.segment_id,
            order_by=SegmentRejection.created_at.desc(),
        )
        .label("rn")
    )
    return (
        db.query(
            SegmentRejection.segment_id.label("segment_id"),
            SegmentRejection.resolved.label("resolved"),
            SegmentRejection.created_at.label("latest_rejection_at"),
            rn,
        ).subquery()
    )


def rejection_counts_reasons_reviewers_by_segment_ids(
    db: Session, segment_ids: List[str]
) -> Tuple[
    Dict[str, int],
    Dict[str, Optional[str]],
    Dict[str, Optional[Dict[str, Any]]],
    Dict[str, Optional[bool]],
    Dict[str, Optional[List[Dict[str, Any]]]],
    Dict[str, Tuple[Optional[str], Optional[str]]],
]:
    if not segment_ids:
        return {}, {}, {}, {}, {}, {}
    rows = (
        db.query(
            SegmentRejection.segment_id,
            SegmentRejection.created_at,
            SegmentRejection.id,
            SegmentRejection.rejection_reason,
            SegmentRejection.reviewer_id,
            SegmentRejection.resolved,
            User.name,
            User.picture,
            SegmentRejection.marked_spans,
            SegmentRejection.reviewer_title,
            SegmentRejection.reviewer_author,
        )
        .outerjoin(User, User.id == SegmentRejection.reviewer_id)
        .filter(SegmentRejection.segment_id.in_(segment_ids))
        .all()
    )
    by_seg: Dict[str, List[Any]] = {}
    for (
        segment_id,
        created_at,
        rid,
        rejection_reason,
        reviewer_id,
        resolved,
        name,
        picture,
        marked_spans,
        reviewer_title,
        reviewer_author,
    ) in rows:
        by_seg.setdefault(segment_id, []).append(
            (
                created_at,
                rid,
                rejection_reason,
                reviewer_id,
                name,
                picture,
                resolved,
                marked_spans,
                reviewer_title,
                reviewer_author,
            )
        )
    counts: Dict[str, int] = {}
    reasons: Dict[str, Optional[str]] = {}
    reviewers: Dict[str, Optional[Dict[str, Any]]] = {}
    latest_resolved: Dict[str, Optional[bool]] = {}
    latest_spans: Dict[str, Optional[List[Dict[str, Any]]]] = {}
    latest_title_author: Dict[str, Tuple[Optional[str], Optional[str]]] = {}
    for sid, items in by_seg.items():
        counts[sid] = len(items)
        latest = max(
            items,
            key=lambda t: (
                t[0] if t[0] is not None else datetime.min,
                t[1] or "",
            ),
        )
        reasons[sid] = latest[2]
        rev_id, rev_name, rev_pic = latest[3], latest[4], latest[5]
        latest_resolved[sid] = latest[6]
        latest_spans[sid] = latest[7] or None
        latest_title_author[sid] = (latest[8], latest[9])
        if not rev_id:
            reviewers[sid] = None
        else:
            reviewers[sid] = {"id": rev_id, "name": rev_name, "picture": rev_pic}
    return counts, reasons, reviewers, latest_resolved, latest_spans, latest_title_author


def latest_rejection_notice_by_document_ids(
    db: Session, document_ids: List[str]
) -> Dict[str, Optional[Dict[str, Any]]]:
    """Newest unresolved rejection per document, only for segments still in status ``rejected``."""
    if not document_ids:
        return {}
    rn = (
        func.row_number()
        .over(
            partition_by=OutlinerSegment.document_id,
            order_by=SegmentRejection.created_at.desc(),
        )
        .label("rn")
    )
    subq = (
        db.query(
            OutlinerSegment.document_id.label("document_id"),
            SegmentRejection.segment_id.label("segment_id"),
            SegmentRejection.rejection_reason.label("rejection_reason"),
            SegmentRejection.reviewer_id.label("reviewer_id"),
            User.name.label("reviewer_name"),
            User.picture.label("reviewer_picture"),
            rn,
        )
        .select_from(SegmentRejection)
        .join(OutlinerSegment, SegmentRejection.segment_id == OutlinerSegment.id)
        .outerjoin(User, SegmentRejection.reviewer_id == User.id)
        .filter(OutlinerSegment.document_id.in_(document_ids))
        .filter(OutlinerSegment.status == "rejected")
        .filter(
            or_(
                SegmentRejection.resolved.is_(False),
                SegmentRejection.resolved.is_(None),
            )
        )
        .subquery()
    )
    rows = (
        db.query(
            subq.c.document_id,
            subq.c.segment_id,
            subq.c.rejection_reason,
            subq.c.reviewer_id,
            subq.c.reviewer_name,
            subq.c.reviewer_picture,
        )
        .filter(subq.c.rn == 1)
        .all()
    )
    out: Dict[str, Optional[Dict[str, Any]]] = {}
    for doc_id, seg_id, reason, reviewer_id, rev_name, rev_pic in rows:
        rev_user = None
        if reviewer_id:
            pic = rev_pic
            if pic is not None:
                pic = str(pic).strip() or None
            rev_user = {"name": rev_name, "picture": pic}
        out[doc_id] = {
            "message": (reason or "").strip(),
            "document_id": doc_id,
            "segment_id": seg_id,
            "reviewer_user": rev_user,
        }
    return out


def document_ids_with_resolved_reviewer_rejection(
    db: Session, document_ids: List[str]
) -> Set[str]:
    """
    Documents where at least one segment is ``checked`` and its latest ``segment_rejection``
    row was by a reviewer, marked resolved (annotator addressed the rejection).
    """
    if not document_ids:
        return set()
    rn = (
        func.row_number()
        .over(
            partition_by=SegmentRejection.segment_id,
            order_by=SegmentRejection.created_at.desc(),
        )
        .label("rn")
    )
    subq = (
        db.query(
            OutlinerSegment.document_id.label("document_id"),
            rn,
            SegmentRejection.resolved.label("resolved"),
            SegmentRejection.reviewer_id.label("reviewer_id"),
            OutlinerSegment.status.label("seg_status"),
        )
        .select_from(SegmentRejection)
        .join(OutlinerSegment, SegmentRejection.segment_id == OutlinerSegment.id)
        .filter(OutlinerSegment.document_id.in_(document_ids))
        .subquery()
    )
    rows = (
        db.query(subq.c.document_id)
        .filter(subq.c.rn == 1)
        .filter(subq.c.seg_status == "checked")
        .filter(subq.c.resolved.is_(True))
        .filter(subq.c.reviewer_id.is_not(None))
        .distinct()
        .all()
    )
    return {r[0] for r in rows}


def update_segment_with_rejection_fields(db: Session, segment_list: List[dict]) -> None:
    if not segment_list:
        return
    ids = [s["id"] for s in segment_list]
    (
        counts,
        reasons,
        reviewers,
        latest_resolved,
        latest_spans,
        latest_title_author,
    ) = rejection_counts_reasons_reviewers_by_segment_ids(db, ids)
    for s in segment_list:
        sid = s["id"]
        count = counts.get(sid, 0)
        if count == 0 and s.get("status") != "rejected":
            s["rejection"] = None
            continue
        reason = None
        reviewer_payload = None
        spans = None
        rejected_title, rejected_author = None, None
        if s.get("status") == "rejected":
            reason = reasons.get(sid)
            spans = latest_spans.get(sid)
            rejected_title, rejected_author = latest_title_author.get(sid, (None, None))
        rr = reviewers.get(sid)
        if rr and rr.get("id"):
            p = rr.get("picture")
            if p is not None:
                p = str(p).strip() or None
            reviewer_payload = {
                "user_id": rr["id"],
                "picture": p,
                "name": rr.get("name"),
            }
        s["rejection"] = {
            "count": count,
            "reason": reason,
            "reviewer": reviewer_payload,
            "resolved": latest_resolved.get(sid),
            "marked_spans": spans,
            "reviewer_title": rejected_title,
            "reviewer_author": rejected_author,
        }


def latest_rejection_reason_for_orm_segment(
    db: Optional[Session], segment: OutlinerSegment
) -> Optional[str]:
    if segment.status != "rejected":
        return None
    rel = getattr(segment, "rejections", None)
    if rel:
        latest = max(rel, key=lambda r: r.created_at)
        return latest.rejection_reason
    if db is None:
        return None
    row = (
        db.query(SegmentRejection)
        .filter(SegmentRejection.segment_id == segment.id)
        .order_by(SegmentRejection.created_at.desc())
        .first()
    )
    return row.rejection_reason if row else None


def latest_rejection_resolved_for_orm_segment(
    db: Optional[Session], segment: OutlinerSegment
) -> Optional[bool]:
    """`resolved` flag on the most recent rejection row for this segment."""
    rel = getattr(segment, "rejections", None)
    if rel:
        latest = max(rel, key=lambda r: r.created_at)
        return latest.resolved
    if db is None:
        return None
    row = (
        db.query(SegmentRejection.resolved)
        .filter(SegmentRejection.segment_id == segment.id)
        .order_by(SegmentRejection.created_at.desc())
        .first()
    )
    return row[0] if row else None


def latest_rejection_marked_spans_for_orm_segment(
    db: Optional[Session], segment: OutlinerSegment
) -> Optional[List[Dict[str, Any]]]:
    """Marked wrong-text spans on the newest rejection row; only while still rejected."""
    if segment.status != "rejected":
        return None
    rel = getattr(segment, "rejections", None)
    if rel:
        latest = max(rel, key=lambda r: r.created_at)
        return latest.marked_spans or None
    if db is None:
        return None
    row = (
        db.query(SegmentRejection.marked_spans)
        .filter(SegmentRejection.segment_id == segment.id)
        .order_by(SegmentRejection.created_at.desc())
        .first()
    )
    return (row[0] or None) if row else None


def latest_rejection_title_author_for_orm_segment(
    db: Optional[Session], segment: OutlinerSegment
) -> Tuple[Optional[str], Optional[str]]:
    """Reviewer title/author saved on the newest rejection row; only while still rejected."""
    if segment.status != "rejected":
        return None, None
    rel = getattr(segment, "rejections", None)
    if rel:
        latest = max(rel, key=lambda r: r.created_at)
        return latest.reviewer_title, latest.reviewer_author
    if db is None:
        return None, None
    row = (
        db.query(SegmentRejection.reviewer_title, SegmentRejection.reviewer_author)
        .filter(SegmentRejection.segment_id == segment.id)
        .order_by(SegmentRejection.created_at.desc())
        .first()
    )
    return (row[0], row[1]) if row else (None, None)


def mark_latest_rejection_resolved(db: Session, segment_id: str) -> None:
    """Set `resolved` on the newest rejection row when the annotator saves the segment."""
    row = (
        db.query(SegmentRejection)
        .filter(SegmentRejection.segment_id == segment_id)
        .order_by(SegmentRejection.created_at.desc())
        .first()
    )
    if row is not None and row.resolved is not True:
        row.resolved = True


def delete_latest_rejection(db: Session, segment_id: str) -> bool:
    """Remove the newest rejection row when a reviewer undoes their rejection."""
    row = (
        db.query(SegmentRejection)
        .filter(SegmentRejection.segment_id == segment_id)
        .order_by(SegmentRejection.created_at.desc())
        .first()
    )
    if row is None:
        return False
    db.delete(row)
    return True


def handle_segment_leaving_rejected_status(
    db: Session,
    segment_id: str,
    *,
    reviewer_undo: bool,
) -> None:
    """Annotator fix keeps history (resolved); reviewer undo removes the latest rejection."""
    if reviewer_undo:
        delete_latest_rejection(db, segment_id)
    else:
        mark_latest_rejection_resolved(db, segment_id)


def latest_rejection_reviewer_for_orm_segment(
    db: Optional[Session], segment: OutlinerSegment
) -> Optional[Dict[str, Any]]:
    if segment.status != "rejected":
        return None
    if db is not None:
        row = (
            db.query(SegmentRejection.reviewer_id, User.name, User.picture)
            .outerjoin(User, User.id == SegmentRejection.reviewer_id)
            .filter(SegmentRejection.segment_id == segment.id)
            .order_by(SegmentRejection.created_at.desc())
            .first()
        )
        if not row:
            return None
        reviewer_id, name, picture = row[0], row[1], row[2]
        if not reviewer_id:
            return None
        return {"id": reviewer_id, "name": name, "picture": picture}
    rel = getattr(segment, "rejections", None)
    if not rel:
        return None
    latest = max(rel, key=lambda r: r.created_at)
    rid = latest.reviewer_id
    if not rid:
        return None
    return {"id": rid, "name": None, "picture": None}


def apply_rejection_to_segment(
    db: Session,
    segment: OutlinerSegment,
    annotator_id: Optional[str],
    reviewer_id: Optional[str],
    reason: str,
    marked_spans: Optional[List[Dict[str, Any]]] = None,
) -> None:
    rejection = SegmentRejection(
        id=str(uuid.uuid4()),
        segment_id=segment.id,
        user_id=annotator_id,
        reviewer_id=reviewer_id,
        rejection_reason=reason,
        resolved=False,
        marked_spans=marked_spans or None,
        # Snapshot before apply_segment_review_title_author_tracking clears them below.
        reviewer_title=segment.reviewer_title,
        reviewer_author=segment.reviewer_author,
    )
    db.add(rejection)
    old_st = segment.status
    apply_segment_review_metadata(segment, old_st, "rejected", None)
    apply_segment_review_title_author_tracking(segment, old_st, "rejected")
    segment.status = "rejected"
    segment.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(segment)


def get_segment_rejection_count(db: Session, segment_id: str) -> int:
    return db.query(func.count(SegmentRejection.id)).filter(
        SegmentRejection.segment_id == segment_id
    ).scalar() or 0


def list_rejections_for_segment(db: Session, segment_id: str) -> List[Dict[str, Any]]:
    """All rejection rows for a segment, newest first."""
    rows = (
        db.query(
            SegmentRejection.id,
            SegmentRejection.created_at,
            SegmentRejection.rejection_reason,
            SegmentRejection.resolved,
            SegmentRejection.reviewer_id,
            User.name,
            User.picture,
            SegmentRejection.marked_spans,
            SegmentRejection.reviewer_title,
            SegmentRejection.reviewer_author,
        )
        .outerjoin(User, User.id == SegmentRejection.reviewer_id)
        .filter(SegmentRejection.segment_id == segment_id)
        .order_by(SegmentRejection.created_at.desc())
        .all()
    )
    out: List[Dict[str, Any]] = []
    for (
        rid,
        created_at,
        reason,
        resolved,
        reviewer_id,
        name,
        picture,
        marked_spans,
        reviewer_title,
        reviewer_author,
    ) in rows:
        reviewer_payload = None
        if reviewer_id:
            pic = picture
            if pic is not None:
                pic = str(pic).strip() or None
            reviewer_payload = {
                "user_id": reviewer_id,
                "name": name,
                "picture": pic,
            }
        reason_text = (reason or "").strip() or None
        out.append(
            {
                "id": rid,
                "created_at": created_at,
                "reason": reason_text,
                "resolved": resolved,
                "reviewer": reviewer_payload,
                "marked_spans": marked_spans or None,
                "reviewer_title": reviewer_title,
                "reviewer_author": reviewer_author,
            }
        )
    return out
