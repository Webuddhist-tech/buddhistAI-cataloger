"""
Outliner controller — re-exports split modules for backwards compatibility.

Use submodules directly, e.g. ``outliner.controller.document``, when adding new code.
"""
from outliner.controller.analytics import (
    get_annotator_performance_breakdown,
    get_annotator_weekly_quality,
    get_dashboard_stats,
    list_annotated_pending_review_documents,
)
from outliner.controller.bdrc import (
    approve_document,
    assign_volume,
    submit_document_to_bdrc_in_review,
    sync_completed_documents_to_bdrc_in_review,
    sync_outliner_document_to_bdrc_in_review,
)
from outliner.controller.comments import (
    add_segment_comment,
    delete_segment_comment,
    get_segment_comments,
    update_segment_comment,
)
from outliner.controller.common import none_check
from outliner.controller.document import (
    assign_document_reviewer,
    assign_reviewr,
    ai_toc_db_value_to_api_items,
    create_document,
    delete_document,
    get_document,
    get_document_ai_toc_entries,
    get_document_by_filename,
    get_document_for_workspace,
    get_document_progress,
    list_completed_document_ids_all_segments_checked,
    list_documents,
    list_my_reviewed_segments_grouped,
    normalize_ai_toc_for_storage,
    random_reviewed_document_ids,
    replace_segments_and_toc ,
    reset_segments,
    save_ai_outline_run,
    save_annotator_ai_final_segments,
    update_document_assignee,
    update_document_content,
    update_document_status,
)
from outliner.controller.rejection import (
    get_segment_rejection_count,
    latest_rejection_marked_spans_for_orm_segment,
    latest_rejection_title_author_for_orm_segment,
    latest_rejection_reason_for_orm_segment,
    latest_rejection_resolved_for_orm_segment,
    latest_rejection_reviewer_for_orm_segment,
    list_segment_rejections,
    reject_segment,
    reject_segments_bulk,
    update_segment_with_rejection_fields,
)
from outliner.controller.segment import (
    _segment_orms_from_bulk_data,
    bulk_segment_operations,
    create_segment,
    create_segments_bulk,
    delete_segment,
    get_segment,
    list_segments,
    merge_segments,
    segment_to_response_dict ,
    split_segment,
    update_segment,
    update_segment_status,
    update_segments_bulk,
)
