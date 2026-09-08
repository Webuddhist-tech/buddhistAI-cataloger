import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { List, useListRef, type RowComponentProps } from 'react-window';
import { useDocument } from '@/hooks';
import { getLabelColor, getStatusColor } from '@/components/outliner/utils';
import type { Segment } from '../shared/types';
import type { SanityCheckFinding } from '@/api/outliner';
import { useActiveSegmentId, useDocumentSegmentNav } from './DocumentSegmentNavContext';
import { useAdminSanityFindings } from './useAdminSanityCheck';
import AdminSanityFindingIndicator from './AdminSanityFindingIndicator';

const ROW_HEIGHT = 60;

function SegmentNavRow({
  index,
  style,
  segments,
  activeSegmentId,
  onSelect,
  sanityFindingsBySegmentId,
  documentContent,
}: RowComponentProps<{
  segments: Segment[];
  activeSegmentId: string | null;
  onSelect: (segmentId: string) => void;
  sanityFindingsBySegmentId: Map<string, SanityCheckFinding[]>;
  documentContent: string;
}>) {
  const segment = segments[index];
  if (!segment) return null;
  const isActive = segment.id === activeSegmentId;
  const findings = sanityFindingsBySegmentId.get(segment.id);
  return (
    <div style={style} className="box-border px-2 pb-1">
      <button
        type="button"
        aria-current={isActive ? 'true' : undefined}
        onClick={() => onSelect(segment.id)}
        className={`flex h-full w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-gray-100 ${
          isActive ? 'bg-gray-100 ring-1 ring-gray-300' : ''
        }`}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${getStatusColor(
            segment.status
          )}`}
        >
          {index + 1}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          {(segment.label || Boolean(findings?.length)) && (
          <span className="mb-0.5 flex items-center gap-1">
            {segment.label && (
              <span
                className={`w-fit rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${getLabelColor(
                  segment.label
                )}`}
              >
                {segment.label.charAt(0).toUpperCase() + segment.label.slice(1).toLowerCase()}
              </span>
            )}
            <AdminSanityFindingIndicator findings={findings} textContent={documentContent} />
          </span>
          )}
          <span className="block truncate font-monlam text-sm text-gray-800">
            {segment.title?.trim() || segment.text?.trim() || '—'}
          </span>
        </span>
      </button>
    </div>
  );
}

function DocumentSegmentsSidebar() {
  const { documentId } = useParams<{ documentId: string }>();
  const { document, isLoading } = useDocument(documentId);
  const { requestScrollToSegment } = useDocumentSegmentNav();
  const activeSegmentId = useActiveSegmentId();
  const segments = document?.segments ?? [];
  const listRef = useListRef(null);
  // Read-only; empty until the document toolbar runs a check.
  const sanityFindingsBySegmentId = useAdminSanityFindings(documentId);

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    segments.forEach((segment, index) => map.set(segment.id, index));
    return map;
  }, [segments]);

  useEffect(() => {
    if (!activeSegmentId) return;
    const index = indexById.get(activeSegmentId);
    if (index == null) return;
    listRef.current?.scrollToRow({ index, align: 'smart' });
  }, [activeSegmentId, indexById, listRef]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-gray-200 p-3">
        <Link
          to="/outliner-admin/documents"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Documents
        </Link>
        <p className="mt-2 truncate text-sm font-semibold text-gray-900" title={document?.filename ?? undefined}>
          {document?.filename || (documentId ? `Document ${documentId.slice(0, 8)}` : '')}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">{segments.length} segments</p>
      </div>

      <div className="min-h-0 flex-1 p-1">
        {isLoading ? (
          <p className="px-2 py-4 text-sm text-gray-500">Loading…</p>
        ) : (
          <List
            listRef={listRef}
            className="min-h-0 w-full scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
            style={{ height: '100%' }}
            rowComponent={SegmentNavRow}
            rowCount={segments.length}
            rowHeight={ROW_HEIGHT}
            rowProps={{
              segments,
              activeSegmentId,
              onSelect: requestScrollToSegment,
              sanityFindingsBySegmentId,
              documentContent: document?.content ?? '',
            }}
          />
        )}
      </div>
    </div>
  );
}

export default DocumentSegmentsSidebar;
