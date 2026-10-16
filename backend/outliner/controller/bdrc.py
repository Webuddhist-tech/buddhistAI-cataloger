"""BDRC volume sync and document approval."""
import asyncio
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from bdrc.main import get_new_volume
from bdrc.volume import (
    SegmentInput,
    VolumeInput,
    aclose_http_client,
    get_volume,
    update_volume,
    update_volume_complete,
    update_volume_status,
)

from core.database import SessionLocal
from outliner.controller.group import group_for_new_volume
from outliner.models.outliner import OutlinerDocument
from outliner.repository import bdrc_sync_queue
from outliner.repository import outliner_repository as outliner_repo
from outliner.controller.document import (
    create_document,
    get_document,
    list_completed_document_ids_all_segments_checked,
    save_annotator_ai_final_segments,
    update_document_status,
)
from outliner.controller.sanity_check import (
    normalize_sanity_check_segments,
    run_sanity_check,
    segments_for_sanity_check,
)
from outliner.models.segment_enums import SegmentLabels
from user.models.user import User

# BDRC part_type derived purely from the annotator's segment label - unlabeled defaults
# to "text". Note BDRC rejects part_type="text" without a non-empty wa_id, so a
# TEXT/unlabeled segment not yet linked to a catalog work (wa_id) will fail that push.
_LABEL_TO_PART_TYPE = {
    SegmentLabels.TEXT: "text",
    SegmentLabels.FRONT_MATTER: "editorial",
    SegmentLabels.BACK_MATTER: "editorial",
    SegmentLabels.TOC: "TOC",
}


def _part_type_for_segment(label: Optional[SegmentLabels]) -> str:
    return _LABEL_TO_PART_TYPE.get(label, "text")


def _base_text_from_chunks(volume: Dict[str, Any]) -> str:
    """Reconstruct base_text from BDRC's own chunks, same as assign_volume() above.

    BDRC validates a pushed base_text against the concatenation of its own chunks for
    the volume, and can re-OCR/re-chunk a volume after document.content was last saved
    here - sending document.content directly can then fail that check ("base_text must
    exactly match the concatenation of chunks") even when it happens to be the same
    length as BDRC's current text. Building base_text from volume["chunks"] (BDRC's
    current state, just fetched via get_volume) can't trip that check, by construction.
    """
    return "".join(
        chunk["text_bo"] for chunk in volume.get("chunks", []) if chunk.get("text_bo") is not None
    )

# BDRC bulk sync progress: append-only log next to backend package (backend/sync_status.txt).
_SYNC_STATUS_LOG_PATH = Path(__file__).resolve().parents[2] / "sync_status.txt"

logger = logging.getLogger(__name__)


def _bdrc_bulk_sync_file_logger() -> logging.Logger:
    """Logger that writes BDRC bulk sync progress to sync_status.txt (handlers attached once)."""
    log = logging.getLogger("outliner.bdrc_bulk_sync_status")
    log.setLevel(logging.INFO)
    if not log.handlers:
        fh = logging.FileHandler(_SYNC_STATUS_LOG_PATH, encoding="utf-8", mode="a")
        fh.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
        )
        log.addHandler(fh)
    log.propagate = False
    return log


def _bdrc_modified_by_from_document(db: Session, document: OutlinerDocument) -> Optional[str]:
    """BDRC OTAPI `modified_by`: prefer catalog user email, else user id (same pattern as frontend BDRC modals)."""
    return outliner_repo.bdrc_modified_by_from_document(db, document)


def _validate_document_has_bdrc_volume(document: OutlinerDocument) -> None:
    if not document.filename or not str(document.filename).strip():
        raise HTTPException(
            status_code=400,
            detail="Document has no BDRC volume ID (filename); cannot sync to BDRC",
        )


async def assign_volume(db: Session, user: User, group_id: Optional[str] = None) -> OutlinerDocument:
    """Give the user the next volume from their group's batch, as a new document."""
    group = group_for_new_volume(db, user, group_id)
    user_id = user.id
    volume_data = await get_new_volume(group.batch_id)
    if volume_data is None:
        raise HTTPException(
            status_code=400,
            detail=f"No volumes left in batch {group.batch_id} for group {group.name!r}. Ask an admin to link the next batch.",
        )
    chunks = volume_data["chunks"]
    text = ""
    for chunk in chunks:
        if chunk["text_bo"] is not None:
            text += chunk["text_bo"]

    if text is None or user_id is None:
        raise HTTPException(status_code=400, detail="Text or user_id is required")
    volume_id = volume_data["id"]

    if outliner_repo.fetch_document_by_filename(db, volume_id):
        raise HTTPException(
            status_code=400,
            detail=f"Document already exists for volume {volume_id}",
        )

    document = create_document(
        db=db,
        content=text,
        filename=volume_id,
        user_id=user_id,
        group_id=group.id,
        batch_id=group.batch_id,
    )

    await update_volume_status(volume_id, "in_progress")
    return document


# ==================== Approval Operations ====================

async def _push_document_segments_to_bdrc(
    document: OutlinerDocument,
    bdrc_status: str,
    modified_by: Optional[str] = None,
) -> Dict[str, Any]:
    """Sync document content and segments to BDRC OTAPI for the volume in document.filename."""
    _validate_document_has_bdrc_volume(document)
    volume_id = str(document.filename).strip()
    volume = await get_volume(volume_id)
    rep_id = volume["rep_id"]
    vol_id = volume["vol_id"]
    vol_version = volume["vol_version"]
    base_text = _base_text_from_chunks(volume)
    if base_text != document.content:
        # document.content (and therefore the segment span_start/span_end used below)
        # was computed against an older snapshot of this volume's text than BDRC has
        # now - the push still succeeds since base_text is BDRC's current chunk text,
        # but cstart/cend may no longer point at the right passage. Needs a re-sync of
        # document.content from BDRC's chunks and re-segmentation to fix properly.
        logger.warning(
            "BDRC push volume_id=%s document_id=%s: document.content diverged from "
            "BDRC's current chunks - base_text sent is BDRC's chunk text, but existing "
            "segment cstart/cend were computed against the stale document.content",
            volume_id, document.id,
        )
    db_segments = document.segments
    segment_inputs = []
    for segment in db_segments:
        segment_start = int(segment.span_start)
        segment_end = int(segment.span_end)
        segment_title = segment.reviewer_title if segment.reviewer_title is not None else (segment.title or "")
        segment_author = segment.reviewer_author if segment.reviewer_author is not None else (segment.author or "")
        mw_id = f'{volume["mw_id"]}_{segment.id}'
        # BDRC rejects part_type="text" with an empty wa_id ("wa_id is mandatory when
        # part_type is 'text'") - "incomplete" is a placeholder for a segment not yet
        # linked to a catalog work, so the push isn't blocked while that's pending.
        wa_id = segment.title_bdrc_id or 'incomplete'
        part_type = _part_type_for_segment(segment.label)
        segment_inputs.append(SegmentInput(
            cstart=segment_start,
            cend=segment_end,
            title_bo=segment_title,
            author_name_bo=segment_author,
            mw_id=mw_id,
            wa_id=wa_id,
            part_type=part_type
        ))
    result = await update_volume(
        volume_id,
        VolumeInput(
            rep_id=rep_id,
            vol_id=vol_id,
            vol_version=vol_version,
            status=bdrc_status,
            base_text=base_text,
            segments=segment_inputs,
        ),
    )

    # `complete` has no place in the volume POST body, so it needs its own PATCH, sent
    # after the POST so the status above is already committed. BDRC defaults it to true.
    if document.is_complete is False:
        try:
            await update_volume_complete(volume_id, False)
        except (TimeoutError, ConnectionError, RuntimeError):
            # The segments pushed fine; losing the flag should not discard that.
            logger.exception(
                "BDRC complete flag PATCH failed volume_id=%s (segments were pushed)",
                volume_id,
            )

    return result


async def _push_with_client_cleanup(
    document: OutlinerDocument,
    bdrc_status: str,
    modified_by: Optional[str] = None,
) -> Dict[str, Any]:
    """Push, then close this loop's BDRC client so it never outlives the loop."""
    try:
        return await _push_document_segments_to_bdrc(
            document, bdrc_status, modified_by=modified_by
        )
    finally:
        await aclose_http_client()


def enqueue_push_document_segments_to_bdrc(
    document_id: str,
    bdrc_status: str,
    db: Optional[Session] = None,
    requested_by: Optional[str] = None,
) -> None:
    """Queue a BDRC push as a durable job row, picked up by ``bdrc_sync_worker``.

    A row rather than a thread is what makes the push survive a crash, deploy or restart.
    """
    owns_session = db is None
    session = db or SessionLocal()
    try:
        document = outliner_repo.fetch_document_by_id(session, document_id)
        if document is None:
            raise HTTPException(status_code=404, detail="Document not found")
        _validate_document_has_bdrc_volume(document)
        bdrc_sync_queue.enqueue_sync(
            session,
            document_id=document_id,
            volume_id=str(document.filename).strip(),
            target_status=bdrc_status,
            requested_by=requested_by,
        )
        # Set true again only once the worker's push succeeds.
        outliner_repo.set_document_synced_to_bdrc(session, document_id, False)
    finally:
        if owns_session:
            session.close()


async def check_document_sanity(
    db: Session, document_id: str, segments: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Run the segmentation sanity-check linter against caller-supplied segment spans.

    ``segments`` comes from the frontend editor (the spans/labels currently shown there);
    only the document's full text is read from the database. Read-only: submits nothing.
    Meant to be called up front (e.g. when the annotator opens the "Submit to Review"
    dialog) so they see every issue before deciding whether to fix segments or submit
    anyway, rather than only finding out after attempting to submit.
    """
    document = get_document(db, document_id, include_segments=False)
    sanity_report = run_sanity_check(
        document.content, normalize_sanity_check_segments(segments), volume_id=document.id
    )
    if sanity_report is None:
        return {"flagged_count": 0, "blocker_count": 0, "advisory_count": 0, "findings": []}
    return sanity_report


async def submit_document_to_bdrc_in_review(
    db: Session, document_id: str, is_complete: bool = True, ignore_sanity_warnings: bool = False
) -> Dict[str, Any]:
    """Queue BDRC in_review push in background, then set document status to completed.

    ``is_complete`` is False when the annotator marked the scanned volume as missing
    pages; it is persisted before queueing so the background push reads it back.

    Before submitting, the segmentation is run through the sanity-check linter. If it
    flags anything and ``ignore_sanity_warnings`` isn't set, submission is held and the
    report is returned so the caller can warn the annotator and let them either fix the
    segments or resubmit with the warning acknowledged.
    """
    document = get_document(db, document_id, include_segments=True)
    _validate_document_has_bdrc_volume(document)

    if not ignore_sanity_warnings:
        sanity_report = run_sanity_check(
            document.content, segments_for_sanity_check(document), volume_id=document.id
        )
        if sanity_report and sanity_report.get("flagged_count"):
            return {
                "success": False,
                "requires_confirmation": True,
                "sanity_report": sanity_report,
            }

    # Must land before enqueue: the worker re-reads the document in its own session.
    outliner_repo.set_document_is_complete(db, document_id, is_complete)
    enqueue_push_document_segments_to_bdrc(document_id, "in_review", db=db)
    await update_document_status(db, document_id, "completed")
    save_annotator_ai_final_segments(db, document_id)
    return {"success": True}


async def sync_outliner_document_to_bdrc_in_review(db: Session, document_id: str) -> Dict[str, Any]:
    """Queue BDRC in_review push in background; leaves local outliner document status unchanged."""
    document = get_document(db, document_id, include_segments=True)
    _validate_document_has_bdrc_volume(document)
    enqueue_push_document_segments_to_bdrc(document_id, "in_review", db=db)
    return {"success": True, "queued": True}


async def sync_completed_documents_to_bdrc_in_review(
    db: Session,
    only_document_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    For each completed outliner document whose segments are all `checked`, queue a background
    BDRC push as `in_review`. Per-document validation failures are collected; queued documents
    update ``synced_to_bdrc`` when the worker finishes.
    Progress is appended to backend/sync_status.txt.

    If `only_document_ids` is set, only those IDs are considered (must still satisfy completed / filename / all-checked).
    """
    sync_log = _bdrc_bulk_sync_file_logger()
    document_ids = list_completed_document_ids_all_segments_checked(db, only_document_ids=only_document_ids)
    total = len(document_ids)
    id_to_filename = outliner_repo.map_document_id_to_filename(db, document_ids)

    sync_log.info(
        "BDRC bulk sync start candidate_count=%s filter_document_ids=%s document_ids=%s",
        total,
        only_document_ids,
        document_ids,
    )

    queued: List[Dict[str, str]] = []
    failed: List[Dict[str, Any]] = []

    for i, document_id in enumerate(document_ids, start=1):
        filename = id_to_filename.get(document_id, "")
        sync_log.info(
            "BDRC bulk sync [%s/%s] queueing document_id=%s filename=%s",
            i,
            total,
            document_id,
            filename,
        )
        try:
            document = outliner_repo.fetch_document_by_id(db, document_id)
            if not document:
                failed.append(
                    {
                        "document_id": document_id,
                        "filename": filename,
                        "detail": "Document not found",
                        "status_code": 404,
                    }
                )
                sync_log.warning(
                    "BDRC bulk sync [%s/%s] FAILED document_id=%s filename=%s status_code=404 detail=Document not found",
                    i,
                    total,
                    document_id,
                    filename,
                )
                continue
            _validate_document_has_bdrc_volume(document)
            enqueue_push_document_segments_to_bdrc(document_id, "in_review", db=db)
            queued.append({"document_id": document_id, "filename": filename})
            sync_log.info(
                "BDRC bulk sync [%s/%s] QUEUED document_id=%s filename=%s",
                i,
                total,
                document_id,
                filename,
            )
        except HTTPException as e:
            detail = e.detail
            if not isinstance(detail, str):
                detail = str(detail)
            failed.append(
                {
                    "document_id": document_id,
                    "filename": filename,
                    "detail": detail,
                    "status_code": e.status_code,
                }
            )
            sync_log.warning(
                "BDRC bulk sync [%s/%s] FAILED document_id=%s filename=%s status_code=%s detail=%s",
                i,
                total,
                document_id,
                filename,
                e.status_code,
                detail,
            )
        except (TimeoutError, ConnectionError, RuntimeError) as e:
            failed.append({"document_id": document_id, "filename": filename, "detail": str(e)})
            sync_log.warning(
                "BDRC bulk sync [%s/%s] FAILED document_id=%s filename=%s error=%s",
                i,
                total,
                document_id,
                filename,
                e,
                exc_info=True,
            )
        except Exception as e:
            failed.append({"document_id": document_id, "filename": filename, "detail": str(e)})
            sync_log.exception(
                "BDRC bulk sync [%s/%s] FAILED document_id=%s filename=%s unexpected error",
                i,
                total,
                document_id,
                filename,
            )

    sync_log.info(
        "BDRC bulk sync finished candidate_count=%s queued=%s failed=%s",
        total,
        len(queued),
        len(failed),
    )
    return {
        "candidate_count": len(document_ids),
        "queued": queued,
        "succeeded": queued,
        "failed": failed,
    }


async def approve_document(db: Session, document_id: str) -> Dict[str, Any]:
    document = get_document(db, document_id, include_segments=True)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    non_approved = outliner_repo.count_non_approved_segments(db, document_id)
    if non_approved > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve document: {non_approved} segment(s) are not yet approved",
        )

    _validate_document_has_bdrc_volume(document)
    enqueue_push_document_segments_to_bdrc(document_id, "reviewed", db=db)
    await update_document_status(db, document_id, "approved")
    outliner_repo.increment_document_submit_count(db, document_id)
    return {"success": True}
