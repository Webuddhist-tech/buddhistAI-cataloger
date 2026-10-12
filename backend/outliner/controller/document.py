"""Outliner document controller."""
import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session
from types import SimpleNamespace

from bdrc.volume import update_volume_status
from core.redis import invalidate_document_content_cache, set_document_content_in_cache
from outliner.models.outliner import OutlinerDocument
from outliner.repository import outliner_repository as outliner_repo
from outliner.utils.outliner_utils import (
    get_document_with_cache,
    resolve_document_content,
)
from outliner.controller.segment import (
    _segment_orms_from_bulk_data,
    segment_to_response_dict ,
)
from user.models.user import User

logger = logging.getLogger(__name__)



def create_document(
    db: Session,
    content: str,
    filename: Optional[str] = None,
    user_id: Optional[str] = None
) -> OutlinerDocument:
    """Create a new outliner document with full text content"""
    db_document = outliner_repo.insert_document(db, content, filename, user_id)
    set_document_content_in_cache(db_document.id, db_document.content)
    return db_document



def list_my_reviewed_segments_grouped(
    db: Session,
    reviewer_id: str,
    page: int = 1,
    page_size: int = 30,
) -> Dict[str, Any]:
    """Approved segments attributed to this reviewer, grouped by document (paginated)."""
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    skip = (page - 1) * page_size
    groups, total_groups, total_approved = outliner_repo.list_my_reviewed_approved_counts_by_document(
        db, reviewer_id, skip=skip, limit=page_size
    )
    return {
        "groups": groups,
        "total_approved_segments": total_approved,
        "total_groups": total_groups,
        "page": page,
        "page_size": page_size,
        "has_next": skip + len(groups) < total_groups,
    }


def list_documents(
    db: Session,
    user_id: Optional[str] = None,
    reviewer_id: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    include_deleted: bool = False,
    include_approved: bool = False,
    include_skipped: bool = False,
    title: Optional[str] = None,
    exclude_document_user_id: Optional[str] = None,
    hide_test_rejected: bool = False,
) -> List[Dict[str, Any]]:
    """
    List all outliner documents, optionally filtered by user, status, and deletion status.

    Args:
        db: Database session
        user_id: Filter documents by user ID
        status: Filter documents by status (active, completed, approved, etc.)
        skip: Number of documents to skip (pagination)
        limit: Maximum number of documents to return
        include_deleted: If False (default), exclude deleted documents. If True, include all documents.
        title: If set, case-insensitive substring match on document filename (list UI title).
        exclude_document_user_id: If set, omit documents whose owner/assignee user_id equals this value.
        hide_test_rejected: TEMP. If True, omit Tsenlek (mmBERT test) documents that are fully reviewed and have a rejected segment.
    """
    return outliner_repo.list_documents(
        db,
        user_id=user_id,
        reviewer_id=reviewer_id,
        status=status,
        skip=skip,
        limit=limit,
        include_deleted=include_deleted,
        include_approved=include_approved,
        include_skipped=include_skipped,
        title=title,
        exclude_document_user_id=exclude_document_user_id,
        hide_test_rejected=hide_test_rejected,
    )



def get_document(
    db: Session,
    document_id: str,
    include_segments: bool = True
) -> OutlinerDocument:
    """Get a document by ID with all its segments"""
    document = get_document_with_cache(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if include_segments:
        document.segment_list = outliner_repo.segment_list_for_document(db, document_id)

    return document


def get_document_for_workspace(
    db: Session,
    document_id: str,
    include_segments: bool = True,
) -> SimpleNamespace:
    """
    Annotator workspace: minimal document columns (id, filename, status) plus content from
    Redis when available, otherwise a single read of the content column (not the full ORM row).
    Segments are loaded only from outliner_segments for this document_id.
    """
    row = outliner_repo.fetch_document_workspace_row(db, document_id)
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")

    content = resolve_document_content(db, document_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Document not found")

    segment_list: List[dict] = (
        outliner_repo.segment_list_for_document(db, document_id) if include_segments else []
    )

    return SimpleNamespace(
        id=row.id,
        filename=row.filename,
        status=row.status,
        content=content,
        segment_list=segment_list,
    )

def get_document_by_filename(db: Session, filename: str) -> OutlinerDocument:
    """Get a document by filename"""
    document = outliner_repo.fetch_document_by_filename(db, filename)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document

def update_document_content(
    db: Session,
    document_id: str,
    content: str
) -> Dict[str, str]:
    """Update the full text content of a document"""
    if not outliner_repo.update_document_content(db, document_id, content):
        raise HTTPException(status_code=404, detail="Document not found")

    invalidate_document_content_cache(document_id)
    set_document_content_in_cache(document_id, content)
    
    return {"message": "Document content updated", "document_id": document_id}


def normalize_ai_toc_for_storage(entries: Any) -> Optional[Any]:
    """
    Normalize TOC payload for JSON storage.

    Accepts:
    - dict mapping title (str) -> page number (int), optionally JSON-serialized as a string
    - list of title strings (legacy: page numbers are assigned when serving the API)
    - list of dicts with title + page_no (or page)
    """
    if entries is None:
        return None
    if isinstance(entries, str):
        s = entries.strip()
        if not s:
            return None
        try:
            return normalize_ai_toc_for_storage(json.loads(s))
        except json.JSONDecodeError:
            return [s]
    if isinstance(entries, dict):
        out: Dict[str, int] = {}
        for k, v in entries.items():
            title = str(k).strip()
            if not title:
                continue
            try:
                out[title] = int(v)
            except (TypeError, ValueError):
                continue
        return out if out else None
    if isinstance(entries, (list, tuple)):
        if not entries:
            return None
        first = entries[0]
        if isinstance(first, dict):
            out_map: Dict[str, int] = {}
            for el in entries:
                if not isinstance(el, dict):
                    continue
                tit = el.get("title")
                pn = el.get("page_no", el.get("page"))
                if tit is None or pn is None:
                    continue
                try:
                    out_map[str(tit).strip()] = int(pn)
                except (TypeError, ValueError):
                    continue
            return out_map if out_map else None
        lines = [str(x).strip() for x in entries if str(x).strip()]
        return lines if lines else None
    return None


def ai_toc_db_value_to_api_items(raw: Any) -> List[Dict[str, Any]]:
    """Turn stored ``ai_toc_entries`` into sorted ``[{page_no, title}, ...]`` for the API."""
    if raw is None:
        return []
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return []
        try:
            return ai_toc_db_value_to_api_items(json.loads(s))
        except json.JSONDecodeError:
            return [{"page_no": 1, "title": s}]
    if isinstance(raw, dict):
        items: List[Dict[str, Any]] = []
        for title, page in raw.items():
            t = str(title).strip()
            if not t:
                continue
            try:
                items.append({"page_no": int(page), "title": t})
            except (TypeError, ValueError):
                continue
        items.sort(key=lambda x: (x["page_no"], x["title"]))
        return items
    if isinstance(raw, (list, tuple)):
        if not raw:
            return []
        if isinstance(raw[0], dict):
            out: List[Dict[str, Any]] = []
            for el in raw:
                if not isinstance(el, dict):
                    continue
                pn = el.get("page_no", el.get("page"))
                tit = el.get("title", el.get("name"))
                if pn is None or tit is None:
                    continue
                try:
                    out.append({"page_no": int(pn), "title": str(tit).strip()})
                except (TypeError, ValueError):
                    continue
            out.sort(key=lambda x: (x["page_no"], x["title"]))
            return out
        result: List[Dict[str, Any]] = []
        for i, s in enumerate(raw):
            t = str(s).strip()
            if t:
                result.append({"page_no": i + 1, "title": t})
        return result
    return []




def get_document_ai_toc_entries(
    db: Session,
    document_id: str,
) -> Any:
    """Return raw stored ``ai_toc_entries`` (dict, list, or JSON string)."""
    document = outliner_repo.fetch_document_by_id(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document.ai_toc_entries


def delete_document(db: Session, document_id: str) -> None:
    """Delete a document and all its segments"""
    if not outliner_repo.delete_document(db, document_id):
        raise HTTPException(status_code=404, detail="Document not found")
    invalidate_document_content_cache(document_id)


async def _sync_skip_status_to_bdrc(
    document: OutlinerDocument,
    previous_status: Optional[str],
    status: str,
) -> None:
    """Mirror skip/unskip on the BDRC volume when the document has a volume id."""
    volume_id = (document.filename or "").strip()
    if not volume_id:
        return

    try:
        if status == "skipped":
            await update_volume_status(volume_id, "skipped")
        elif status == "active" and previous_status == "skipped":
            await update_volume_status(volume_id, "in_progress")
    except (TimeoutError, ConnectionError, RuntimeError) as e:
        bdrc_status = "skipped" if status == "skipped" else "in_progress"
        logger.warning(
            "BDRC volume status sync failed document_id=%s volume_id=%s bdrc_status=%s error=%s",
            document.id,
            volume_id,
            bdrc_status,
            e,
        )
        raise HTTPException(
            status_code=502,
            detail=f"Failed to update BDRC volume status to '{bdrc_status}': {e}",
        ) from e


async def update_document_status(
    db: Session,
    document_id: str,
    status: str,
    user_id: Optional[str] = None
) -> Dict[str, str]:
    """
    Update document status.
    
    When restoring a deleted document (changing status from 'deleted' to 'active'),
    the user_id parameter must be provided and must match the document's user_id
    to ensure only the document owner can restore it.

    Skip/unskip also updates the linked BDRC volume status (skipped ↔ in_progress).
    """
    # Validate status value
    valid_statuses = ['active', 'completed', 'deleted', 'approved', 'rejected','skipped']
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Status must be one of: {', '.join(valid_statuses)}"
        )
    
    document = outliner_repo.fetch_document_by_id(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    previous_status = document.status

    # If restoring a deleted document (changing to 'active'), verify ownership
    if previous_status == 'deleted' and status == 'active':
        if not user_id:
            raise HTTPException(
                status_code=400,
                detail="user_id parameter is required to restore a deleted document"
            )
        if document.user_id != user_id:
            raise HTTPException(
                status_code=403,
                detail="You can only restore documents that belong to you"
            )

    # Sync BDRC before local commit so a BDRC failure leaves DB unchanged
    await _sync_skip_status_to_bdrc(document, previous_status, status)
    
    outliner_repo.set_document_status_and_refresh(db, document, status)

    return {"message": "Document status updated", "document_id": document_id, "status": status}


def update_document_assignee(
    db: Session,
    document_id: str,
    user_id: str,
) -> Dict[str, str]:
    document = outliner_repo.fetch_document_by_id(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    clean_user_id = user_id.strip()
    if not clean_user_id:
        raise HTTPException(status_code=400, detail="User ID is required")

    user_exists = db.query(User.id).filter(User.id == clean_user_id).first()
    if not user_exists:
        raise HTTPException(status_code=404, detail="User not found")

    if document.reviewer_id and document.reviewer_id == clean_user_id:
        raise HTTPException(
            status_code=403,
            detail="Cannot assign this annotator: they are the document's reviewer",
        )

    outliner_repo.set_document_user_and_refresh(db, document, clean_user_id)
    return {
        "message": "Document assignee updated",
        "document_id": document_id,
        "user_id": clean_user_id,
    }


def assign_reviewr(
    db: Session,
    reviewer_id: str,
) -> Dict[str, str]:
    document = outliner_repo.fetch_random_completed_unassigned_document(
        db, exclude_user_id=reviewer_id
    )
    if not document:
        raise HTTPException(
            status_code=404,
            detail="No completed unassigned document available",
        )

    outliner_repo.set_document_reviewer_and_refresh(db, document, reviewer_id)
    return {
        "message": "Reviewer assigned",
        "document_id": document.id,
        "reviewer_id": reviewer_id,
    }


def assign_document_reviewer(
    db: Session,
    document_id: str,
    reviewer_id: str,
) -> Dict[str, str]:
    """Assign the current user as reviewer on a specific document (if unassigned)."""
    document = outliner_repo.fetch_document_by_id(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.user_id and document.user_id == reviewer_id:
        raise HTTPException(
            status_code=403,
            detail="You cannot review a document you annotated",
        )

    if document.reviewer_id and document.reviewer_id != reviewer_id:
        raise HTTPException(
            status_code=400,
            detail="Document is already assigned to another reviewer",
        )

    outliner_repo.set_document_reviewer_and_refresh(db, document, reviewer_id)
    return {
        "message": "Reviewer assigned",
        "document_id": document_id,
        "reviewer_id": reviewer_id,
    }


def get_document_progress(db: Session, document_id: str) -> Dict[str, Any]:
    """Get progress statistics for a document"""
    data = outliner_repo.get_document_progress(db, document_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return data


def reset_segments(db: Session, document_id: str) -> None:
    # check if the document has any approved segments
    segments = outliner_repo.segments_by_document_id(db,document_id=document_id)
    for segment in segments:
        if segment.status == "approved":
            raise HTTPException(status_code=400, detail="Document has approved segments")
    """Delete all segments for a document"""
    if not outliner_repo.reset_segments(db, document_id):
        raise HTTPException(status_code=404, detail="Document not found")

def get_assign_volume_eligibility(db: Session, user_id: str) -> Dict[str, bool]:
   
    allowed = outliner_repo.allow_user_to_assign_volume(db, user_id)
    return {"allowed": allowed}


def list_completed_document_ids_all_segments_checked(
    db: Session,
    only_document_ids: Optional[List[str]] = None,
) -> List[str]:

    return outliner_repo.list_completed_document_ids_all_segments_checked(
        db, only_document_ids=only_document_ids
    )


def random_reviewed_document_ids(db: Session, limit: int = 5) -> Dict[str, List[Dict[str, Optional[str]]]]:
    """Random approved documents with id and filename (see POST …/approve)."""
    pairs = outliner_repo.fetch_random_reviewed_document_ids(db, limit=limit)
    return {
        "documents": [{"id": doc_id, "filename": fn} for doc_id, fn in pairs],
    }


def replace_segments_and_toc (
    db: Session,
    document_id: str,
    segments_data: List[Dict[str, Any]],
    toc_entries: Any,
) -> Tuple[OutlinerDocument, List[Dict[str, Any]]]:

    document = get_document_with_cache(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    normalized = normalize_ai_toc_for_storage(toc_entries)
    db_segments = _segment_orms_from_bulk_data(document_id, document.content, segments_data)
    segment_payload = [segment_to_response_dict (s) for s in db_segments]
    outliner_repo.replace_segments_and_ai_toc(db, document, db_segments, normalized)
    return document, segment_payload


def _benchmark_spans(segments: List[Dict[str, Any]]) -> List[Dict[str, int]]:
    """Reduce segment dicts to the benchmark shape: segment_index, span_start, span_end."""
    return [
        {
            "segment_index": s["segment_index"],
            "span_start": s["span_start"],
            "span_end": s["span_end"],
        }
        for s in segments
    ]


def save_ai_outline_run(
    db: Session,
    document_id: str,
    segments_data: List[Dict[str, Any]],
    created_by_id: Optional[str] = None,
    detector: str = "rule",
) -> None:
    """Freeze the AI's predicted split as a new run row (one per AI-button click)."""
    outliner_repo.insert_ai_outline_run(
        db,
        document_id,
        _benchmark_spans(segments_data),
        created_by_id,
        detector=detector,
    )


def save_annotator_ai_final_segments(db: Session, document_id: str) -> None:
    """Snapshot the annotator's final segments — only for documents where the AI outline was used.

    Manual documents (no AI run) have nothing to benchmark against, so the column stays NULL.
    """
    if not outliner_repo.document_has_ai_outline_run(db, document_id):
        return
    segments = outliner_repo.segment_list_for_document(db, document_id)
    outliner_repo.save_annotator_ai_final_segments(
        db, document_id, _benchmark_spans(segments)
    )

