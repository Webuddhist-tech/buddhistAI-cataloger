import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DocumentsTab } from '../components/admin';
import MyReviewedSegmentsFab from '../components/admin/documents/MyReviewedSegmentsFab';
import { isHideTestRejected } from '../components/admin/documents/HideTestRejectedToggle';
import { SimplePagination } from '../components/ui/simple-pagination';
import type { Document } from '../components/admin/shared/types';
import { useDocuments } from '../hooks';
import type { DocumentFilters } from '../hooks';

function OutlinerAdminDocument() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const status = searchParams.get('status') || undefined;
  const annotator = searchParams.get('annotator') || undefined;
  const reviewer = searchParams.get('reviewer') || undefined;
  const debouncedTitle = searchParams.get('title') || undefined;
  const includeApproved = searchParams.get('include_approved') === 'true';
  const includeSkipped = searchParams.get('include_skipped') === 'true';
  const hideTestRejected = isHideTestRejected(searchParams);
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
  const filters: DocumentFilters = useMemo(
    () => ({
      status,
      userId: annotator,
      reviewerId: reviewer,
      title: debouncedTitle || undefined,
      page,
      pageSize: 20,
      includeApproved,
      includeSkipped,
      excludeOwnAssignedDocuments: true,
      hideTestRejected,
    }),
    [status, annotator, reviewer, debouncedTitle, page, includeApproved, includeSkipped, hideTestRejected]
  );

  const { hasPrevPage, hasNextPage, isFetching,handleNextPage,handlePrevPage } = useDocuments(filters);

  const handleDocumentSelectAction = (document: Document) => {
    navigate(`/outliner-admin/documents/${document.id}`);
  };


  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4  p-4">
      <DocumentsTab
        onDocumentSelect={handleDocumentSelectAction}
      />
      <MyReviewedSegmentsFab />
      {(hasPrevPage || hasNextPage) && (
        <div className="shrink-0">
          <SimplePagination
            canGoPrev={hasPrevPage}
            canGoNext={hasNextPage}
            onPrev={handlePrevPage}
            onNext={handleNextPage}
            label={`Page ${page}`}
            labelPosition="left"
            isDisabled={isFetching}
          />
        </div>
      )}
    </div>
  );
}

export default OutlinerAdminDocument;
