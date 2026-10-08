"""Write operations for outliner_segment rows (single-segment lifecycle, rejects)."""
import uuid
from datetime import datetime
from typing import Any, List, Optional

from sqlalchemy import update
from sqlalchemy.orm import Session

from outliner.models.outliner import OutlinerSegment, SegmentRejection
from outliner.repository.segment_review import (
    apply_segment_review_metadata,
    apply_segment_review_title_author_tracking,
)
from outliner.repository.segment_queries import fetch_following_segments_by_index, fetch_segments_by_ids
from outliner.utils.outliner_utils import validate_segment_status_transition


def insert_segment(db: Session, db_segment: OutlinerSegment) -> OutlinerSegment:
    db.add(db_segment)
    db.commit()
    db.refresh(db_segment)
    return db_segment


def insert_segments_bulk(db: Session, db_segments: List[OutlinerSegment]) -> None:
    db.add_all(db_segments)
    db.commit()


def add_segment_flush(db: Session, segment: OutlinerSegment) -> None:
    db.add(segment)
    db.flush()


def execute_bump_segment_indices_after(
    db: Session, document_id: str, segment_index: int
) -> None:
    db.execute(
        update(OutlinerSegment)
        .where(
            OutlinerSegment.document_id == document_id,
            OutlinerSegment.segment_index > segment_index,
        )
        .values(segment_index=OutlinerSegment.segment_index + 1)
    )


def add_segment(db: Session, segment: OutlinerSegment) -> None:
    db.add(segment)


def commit_session(db: Session) -> None:
    db.commit()


def delete_orm_entity(db: Session, entity: Any) -> None:
    db.delete(entity)


def refresh_entity(db: Session, entity: Any) -> None:
    db.refresh(entity)


def commit_and_refresh_segments(db: Session, segments: List[OutlinerSegment]) -> None:
    db.commit()
    for seg in segments:
        db.refresh(seg)


def merge_segments_persist(db: Session, first_segment: OutlinerSegment) -> None:
    db.commit()
    db.refresh(first_segment)


def delete_segment_and_reindex(db: Session, segment: OutlinerSegment) -> None:
    document_id = segment.document_id
    segment_index = segment.segment_index
    db.delete(segment)
    following_segments = fetch_following_segments_by_index(db, document_id, segment_index)
    for seg in following_segments:
        seg.segment_index -= 1
    db.commit()


def update_segment_status_persist(
    db: Session,
    segment: OutlinerSegment,
    status: str,
    reviewer_id: Optional[str] = None,
) -> None:
    old_status = segment.status
    apply_segment_review_metadata(segment, old_status, status, reviewer_id)
    apply_segment_review_title_author_tracking(segment, old_status, status)
    segment.status = status
    segment.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(segment)


def reject_segments_bulk(
    db: Session,
    segment_ids: List[str],
    reviewer_id: Optional[str],
    reason: str,
) -> List[OutlinerSegment]:
    from outliner.repository import document as document_repo

    segments = fetch_segments_by_ids(db, segment_ids)
    if not segments:
        raise ValueError("No segments found")
    doc_ids = {seg.document_id for seg in segments}
    documents = document_repo.fetch_documents_by_ids(db, list(doc_ids))
    doc_user_map = {doc.id: doc.user_id for doc in documents}

    rejected_segments: List[OutlinerSegment] = []
    for segment in segments:
        is_valid, _ = validate_segment_status_transition(segment.status, "rejected")
        if not is_valid:
            continue

        rejection = SegmentRejection(
            id=str(uuid.uuid4()),
            segment_id=segment.id,
            user_id=doc_user_map.get(segment.document_id),
            reviewer_id=reviewer_id,
            rejection_reason=reason,
            resolved=False,
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
        rejected_segments.append(segment)

    db.commit()
    for seg in rejected_segments:
        db.refresh(seg)

    return rejected_segments
