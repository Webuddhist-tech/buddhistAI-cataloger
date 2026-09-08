import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  checkDocumentSanity,
  type SanityCheckFinding,
  type SanityCheckReport,
  type SanityCheckSegmentInput,
} from '@/api/outliner';
import type { Segment } from '../shared/types';

/** Shared by the runner and by read-only observers, so they see one result. */
function sanityCheckQueryKey(documentId: string | undefined) {
  return ['admin-document-sanity-check', documentId] as const;
}

function groupBySegmentId(report: SanityCheckReport | null) {
  const map = new Map<string, SanityCheckFinding[]>();
  for (const finding of report?.findings ?? []) {
    const existing = map.get(finding.segment_id);
    if (existing) {
      existing.push(finding);
    } else {
      map.set(finding.segment_id, [finding]);
    }
  }
  return map;
}

/**
 * On-demand segmentation sanity check for the reviewer's document view.
 *
 * Held above the toolbar button so the dialog and the per-segment alert icons share one
 * result and never disagree about what is flagged. Never runs on its own; call `runCheck`.
 */
export function useAdminSanityCheck(documentId: string | undefined, segments: Segment[]) {
  const sanityCheckSegments: SanityCheckSegmentInput[] = useMemo(
    () =>
      segments
        .filter(
          (segment) =>
            typeof segment.span_start === 'number' && typeof segment.span_end === 'number'
        )
        .map((segment) => ({
          id: segment.id,
          start: segment.span_start as number,
          end: segment.span_end as number,
          label: segment.label ?? null,
        })),
    [segments]
  );

  const sanityQuery = useQuery({
    queryKey: sanityCheckQueryKey(documentId),
    queryFn: ({ signal }) => checkDocumentSanity(documentId!, sanityCheckSegments, signal),
    enabled: false,
    retry: 1,
  });

  const report = sanityQuery.data ?? null;
  const findingsBySegmentId = useMemo(() => groupBySegmentId(report), [report]);
  const refetch = sanityQuery.refetch;

  return {
    report,
    findingsBySegmentId,
    isChecking: sanityQuery.isFetching,
    checkFailed: sanityQuery.isError,
    runCheck: () => {
      if (documentId) refetch();
    },
  };
}

/**
 * Read-only view of the same result, for the segment sidebar — a sibling pane of the
 * document view, so it cannot receive the findings as a prop. Never fetches; it re-renders
 * off the shared query and shows nothing until a check has been run.
 */
export function useAdminSanityFindings(documentId: string | undefined) {
  const { data } = useQuery({
    queryKey: sanityCheckQueryKey(documentId),
    enabled: false,
  });

  const report = (data as SanityCheckReport | undefined) ?? null;
  return useMemo(() => groupBySegmentId(report), [report]);
}
