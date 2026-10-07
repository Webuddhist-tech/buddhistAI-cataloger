"""
Utility functions for outliner operations.
"""
import re
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from fastapi import HTTPException
from sqlalchemy.orm import Session, defer
from sqlalchemy.orm.attributes import set_committed_value
from sqlalchemy import func
from core.redis import (
    get_document_content_from_cache,
    set_document_content_in_cache,
)
from outliner.models.outliner import (
    OutlinerDocument,
    OutlinerSegment,
    SegmentLabels,
    SegmentStatus,
    SEGMENT_STATUS_TRANSITIONS,
)


def segment_body_from_document(content: Optional[str], span_start: int, span_end: int) -> str:
    """
    Slice [span_start, span_end) from full document content with safe bounds.
    Segment body is not stored redundantly in DB; use this with document.content (or cache).
    """
    if not content:
        return ""
    n = len(content)
    s = max(0, min(int(span_start), n))
    e = max(s, min(int(span_end), n))
    return content[s:e]





def resolve_document_content(db: Session, document_id: str) -> Optional[str]:
    """
    Full document text: Redis first, then a single SELECT of the content column only.
    Populates the cache on DB read. Returns None if the document row does not exist.
    """
    cached = get_document_content_from_cache(document_id)
    if cached is not None:
        return cached
    content = (
        db.query(OutlinerDocument.content)
        .filter(OutlinerDocument.id == document_id)
        .scalar()
    )
    if content is not None:
        set_document_content_in_cache(document_id, content)
    return content


def get_document_with_cache(db: Session, document_id: str) -> Optional[OutlinerDocument]:
    """
    Get document from database, checking Redis cache first for content.
    If content is in cache, use it; otherwise fetch from DB and cache it.
    
    Args:
        db: Database session
        document_id: Document ID
        
    Returns:
        OutlinerDocument if found, None otherwise
    """
    # Try to get content from cache first
    cached_content = get_document_content_from_cache(document_id)

    if cached_content is not None:
        # Metadata from DB only — do not load `content` column (use cache).
        document = (
            db.query(OutlinerDocument)
            .options(defer(OutlinerDocument.content))
            .filter(OutlinerDocument.id == document_id)
            .first()
        )
        if document:
            # Populate as already-loaded, not as an edit: a plain assignment marks the row dirty
            # and the request's commit rewrites the whole volume text back to the DB.
            set_committed_value(document, "content", cached_content)
        return document
    # Content not in cache: load row once (includes content) and warm cache
    document = db.query(OutlinerDocument).filter(OutlinerDocument.id == document_id).first()
    if document:
        set_document_content_in_cache(document_id, document.content)
    return document




def incremental_update_document_progress(
    db: Session,
    document_id: str,
    total_delta: int = 0,
    annotated_delta: int = 0,
):
    """
    Placeholder for incremental document progress updates.
    
    Currently a no-op — progress is computed via COUNT queries in get_documents.
    Once cached progress columns are added to OutlinerDocument, this function
    will apply deltas atomically instead.
    
    Args:
        db: Database session
        document_id: Document ID to update
        total_delta: Change in total_segments count (+1 for create, -1 for delete, 0 for update)
        annotated_delta: Change in annotated_segments count (+1 when annotation added, -1 when removed, 0 for no change)
    """
    pass


def get_annotation_status_delta(
    old_is_annotated: bool,
    new_is_annotated: bool
) -> int:
    """
    Calculate the delta for annotated_segments count based on annotation status change.
    
    Returns:
        +1 if segment became annotated (False -> True)
        -1 if segment became unannotated (True -> False)
        0 if status unchanged
    """
    if old_is_annotated and not new_is_annotated:
        return -1
    elif not old_is_annotated and new_is_annotated:
        return 1
    return 0


def get_comments_list(segment: OutlinerSegment) -> List[Dict[str, Any]]:
    """
    Helper function to extract comments list from segment.comment field.
    
    Args:
        segment: OutlinerSegment instance
        
    Returns:
        List of comment dictionaries
    """
    import json
    if not segment.comment:
        return []
    
    try:
        # New format: comments are stored directly as an array
        if isinstance(segment.comment, list):
            # Return a copy to avoid mutating the original list
            return list(segment.comment)
        
        
    
            
    except Exception:
        return [{"content": str(segment.comment), "username": "Unknown", "timestamp": datetime.utcnow().isoformat()}]
    
    return []


VALID_SEGMENT_STATUSES = {s.value for s in SegmentStatus}


def validate_segment_status_transition(
    current_status: Optional[str],
    new_status: str
) -> Tuple[bool, str]:
    """
    Validate that a segment status transition is allowed.
    
    Returns:
        (is_valid, error_message) tuple
    """
    if new_status not in VALID_SEGMENT_STATUSES:
        return False, f"Invalid status '{new_status}'. Must be one of: {', '.join(VALID_SEGMENT_STATUSES)}"
    
    current = SegmentStatus(current_status) if current_status else SegmentStatus.UNCHECKED
    target = SegmentStatus(new_status)
    
    allowed = SEGMENT_STATUS_TRANSITIONS.get(current, set())
    if target not in allowed:
        allowed_str = ', '.join(s.value for s in allowed) if allowed else 'none'
        return False, f"Cannot transition from '{current.value}' to '{target.value}'. Allowed transitions: {allowed_str}"
    
    return True, ""


# Tibetan section headings typical of front / paratext (publisher’s note, foreword, etc.).
# Matched only against the segment heading (stored title, or first line of body if no title),
# not the full segment body — avoids false positives when the same phrases appear in prose.
FRONT_MATTER_PHRASES: Tuple[str, ...] = (
    "དཔེ་སྐྲུན་གསལ་བཤད",
    "སྔོན་གླེང",
    "རྩོམ་བསྒྲིགས་པའི་གཏམ",
    "ཐོར་བུ",
    "སྤར་བྱང་སྨོན་ཚིག",
    "མཇུག་བྱང",
    "རྩོམ་པ་པོས་དོ་སྣང་མཛད་དགོས་པའི་གནད་དོན་འགའ་ཞིག",
    "དུས་དེབ་མངགས་ཉོའི་གསལ་བརྡ",
    "རྩོམ་པ་པོའི་ངོ་སྤྲོད་མདོར་བསྡུས",
    "བསྡུ་སྒྲིག་པའི་གླེང་བརྗོད",
    "བསྒྲིགས་རྗེས་ཀྱི་གཏམ",
)


def segment_heading_for_label_inference(title: Optional[str], body_text: str) -> str:
    """
    Text used when inferring FRONT_MATTER / TOC for a new segment: stored title if set,
    otherwise the first line of the segment body (never the full body).
    """
    t = (title or "").strip()
    if t:
        return t
    if not body_text:
        return ""
    return body_text.split("\n", 1)[0].strip()


def infer_segment_label_for_new_segment(title: Optional[str], body_text: str) -> SegmentLabels:
    """Infer label from heading only (title or first line): front matter phrases, then TOC, else body."""
    heading = segment_heading_for_label_inference(title, body_text)
    if any(phrase in heading for phrase in FRONT_MATTER_PHRASES):
        return SegmentLabels.FRONT_MATTER
    if "དཀར་ཆག" in heading:
        return SegmentLabels.TOC
    return SegmentLabels.TEXT
