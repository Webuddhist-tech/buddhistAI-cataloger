"""Shared helpers for segment controllers (serialization, bulk ORM construction)."""
import uuid
from typing import Any, Dict, List

from fastapi import HTTPException

from outliner.models.outliner import OutlinerSegment
from outliner.utils.outliner_utils import infer_segment_label_for_new_segment


def _normalize_reviewer_title_value(value: Any) -> Any:
    """Reviewer title suggestions must not be stored as empty strings (use NULL)."""
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return None if stripped == "" else stripped
    return value


def segment_to_response_dict (seg: OutlinerSegment) -> Dict[str, Any]:
    """Flat dict for SegmentResponseDocument (stable across commit / session expiry)."""
    return {
        "id": seg.id,
        "segment_index": seg.segment_index,
        "span_start": seg.span_start,
        "span_end": seg.span_end,
        "title": seg.title,
        "author": seg.author,
        "title_span_start": seg.title_span_start,
        "title_span_end": seg.title_span_end,
        "updated_title": seg.updated_title,
        "author_span_start": seg.author_span_start,
        "author_span_end": seg.author_span_end,
        "updated_author": seg.updated_author,
        "reviewer_title": seg.reviewer_title,
        "reviewer_author": seg.reviewer_author,
        "title_bdrc_id": seg.title_bdrc_id,
        "author_bdrc_id": seg.author_bdrc_id,
        "parent_segment_id": seg.parent_segment_id,
        "is_annotated": seg.is_annotated,
        "is_attached": seg.is_attached,
        "status": seg.status,
        "label": seg.label.name if seg.label else None,
        "is_supplied_title": seg.is_supplied_title,
        "reviewed_by_id": seg.reviewed_by_id,
        "reviewed_at": seg.reviewed_at,
        "updated_at": seg.updated_at,
        "created_by_id": seg.created_by_id,
        "corrected_by_reviewer": seg.corrected_by_reviewer,
    }


def _segment_orms_from_bulk_data(
    document_id: str,
    document_content: str,
    segments_data: List[Dict[str, Any]],
) -> List[OutlinerSegment]:
    """Build OutlinerSegment instances for bulk insert (not yet added to the session)."""
    db_segments: List[OutlinerSegment] = []
    for segment_data in segments_data:
        segment_text = segment_data.get("text")
        if not segment_text:
            span_start = segment_data["span_start"]
            span_end = segment_data["span_end"]
            if span_start < 0 or span_end > len(document_content):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid span addresses for segment at index {segment_data['segment_index']}",
                )
            segment_text = document_content[span_start:span_end]

        title_val = segment_data.get("title")
        label = infer_segment_label_for_new_segment(title_val, segment_text)
        db_segment = OutlinerSegment(
            id=str(uuid.uuid4()),
            document_id=document_id,
            text="",
            segment_index=segment_data["segment_index"],
            span_start=segment_data["span_start"],
            span_end=segment_data["span_end"],
            title=title_val,
            label=label,
            author=segment_data.get("author"),
            title_bdrc_id=segment_data.get("title_bdrc_id"),
            author_bdrc_id=segment_data.get("author_bdrc_id"),
            parent_segment_id=segment_data.get("parent_segment_id"),
            status="unchecked",
        )
        db_segment.update_annotation_status()
        db_segments.append(db_segment)
    return db_segments
