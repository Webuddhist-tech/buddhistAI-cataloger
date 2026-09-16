import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { SkeletonLarger } from '@/components/ui/skeleton';
import { useStatistics } from '@/hooks/useStatistics';
import { useOutlinerUsers } from '@/hooks';
import type { DashboardStatsFilters } from '@/hooks';
import { UserFilter } from '@/components/admin/documents/UserFilter';
import DateRangeFilter from '@/components/admin/documents/DateRangeFilter';
import { Button } from '@/components/ui/button';
import { getDefaultDateRange } from '@/components/admin/documents/utils';
import type { AnnotatorApprovedRow, ReviewerApprovedRow } from '@/api/outliner';

type AnnotatorSortField = 'name' | 'segments_approved' | 'edited_segments' | 'rejection_rate';
type ReviewerSortField = 'name' | 'segments_reviewed' | 'edited_segments' | 'rejection_rate';
type SortDir = 'asc' | 'desc';

const rejectionRate = (approved: number, rejected: number) =>
  approved > 0 ? (rejected / approved) * 100 : 0;
const REJECTION_RATE_FORMULA =
  'Rejection % = rejection_count / segments_reviewed × 100';

const annotatorRejectionRate = (approved: number, rejectedSegments: number) => {
  const denom = approved + rejectedSegments;
  return denom > 0 ? (rejectedSegments / denom) * 100 : 0;
};
const ANNOTATOR_REJECTION_RATE_FORMULA =
  'Rejection % = rejected_segments / (segments_approved + rejected_segments) × 100';

const editedRate = (edited: number, denom: number) =>
  denom > 0 ? (edited / denom) * 100 : 0;
const annotatorApprovalRate = (approved: number, rejectedSegments: number) => {
  const denom = approved + rejectedSegments;
  return denom > 0 ? (approved / denom) * 100 : 0;
};
const ANNOTATOR_APPROVAL_RATE_FORMULA =
  'Approved % = segments_approved / (segments_approved + rejected_segments) × 100';
const ANNOTATOR_EDITED_RATE_FORMULA =
  'Edited % = edited_segments / segments_approved × 100';
const REVIEWER_EDITED_RATE_FORMULA =
  'Edited % = edited_segments / segments_reviewed × 100';

const cardPanel =
  'rounded-2xl border border-border/70 bg-card/95 p-6 shadow-elegant backdrop-blur-[2px]';

function SortIcon<F extends string>({
  field,
  active,
  dir,
}: Readonly<{ field: F; active: F; dir: SortDir }>) {
  if (field !== active) return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
  return dir === 'desc'
    ? <ArrowDown className="ml-1 inline h-3.5 w-3.5" />
    : <ArrowUp className="ml-1 inline h-3.5 w-3.5" />;
}

function ReviewerTable({
  rows,
  eyebrow,
  heading,
  emptyMessage,
  sortField,
  sortDir,
  onToggleSort,
}: Readonly<{
  rows: ReviewerApprovedRow[];
  eyebrow: string;
  heading: string;
  emptyMessage: string;
  sortField: ReviewerSortField;
  sortDir: SortDir;
  onToggleSort: (field: ReviewerSortField) => void;
}>) {
  const total = rows.reduce((s, r) => s + r.segments_reviewed, 0);
  const editedTotal = rows.reduce((s, r) => s + r.edited_segments, 0);
  const rejectedTotal = rows.reduce((s, r) => s + r.rejection_count, 0);

  return (
    <section className={cardPanel}>
      <div className="mb-4 min-w-0 border-l-[3px] border-primary pl-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
        <h3 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">{heading}</h3>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-200/80 bg-stone-50/40 py-12 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <div className="max-h-[min(640px,60vh)] overflow-y-auto overflow-x-auto rounded-lg border border-stone-200/80 bg-white/60">
          <table className="w-full min-w-[24rem] border-collapse text-sm">
            <thead className="sticky top-0 z-[1] shadow-[0_1px_0_0_rgb(231_229_228)]">
              <tr className="border-b border-stone-200 bg-stone-50/95 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                <th className="px-4 py-3">No.</th>
                <th className="px-4 py-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 transition-colors hover:text-foreground"
                    onClick={() => onToggleSort('name')}
                  >
                    Reviewer
                    <SortIcon<ReviewerSortField> field="name" active={sortField} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 text-right tabular-nums">
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 transition-colors hover:text-foreground"
                    onClick={() => onToggleSort('segments_reviewed')}
                  >
                    Segments Reviewed
                    <SortIcon<ReviewerSortField>
                      field="segments_reviewed"
                      active={sortField}
                      dir={sortDir}
                    />
                  </button>
                </th>
                <th className="px-4 py-3 text-right tabular-nums">
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 transition-colors hover:text-foreground"
                    onClick={() => onToggleSort('edited_segments')}
                  >
                    Edited
                    <SortIcon<ReviewerSortField>
                      field="edited_segments"
                      active={sortField}
                      dir={sortDir}
                    />
                  </button>
                </th>
                <th className="px-4 py-3 text-right tabular-nums" title={REJECTION_RATE_FORMULA}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 transition-colors hover:text-foreground"
                    onClick={() => onToggleSort('rejection_rate')}
                  >
                    Rejected
                    <SortIcon<ReviewerSortField>
                      field="rejection_rate"
                      active={sortField}
                      dir={sortDir}
                    />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.user_id ?? row.name}
                  className="border-b border-stone-100 last:border-0 hover:bg-stone-50/80"
                >
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{idx + 1}</td>
                  <td className="max-w-[14rem] px-4 py-3 font-medium leading-snug text-foreground sm:max-w-none sm:whitespace-normal">
                    <span className="break-words">{row.name}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-blue-700">
                    {row.segments_reviewed.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-600">
                    {row.edited_segments.toLocaleString()}{' '}
                    <span className="text-muted-foreground" title={REVIEWER_EDITED_RATE_FORMULA}>
                      ({editedRate(row.edited_segments, row.segments_reviewed).toFixed(1)}%)
                    </span>
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums text-red-600"
                    title={REJECTION_RATE_FORMULA}
                  >
                    {row.rejection_count.toLocaleString()}{' '}
                    <span className="text-muted-foreground">
                      ({rejectionRate(row.segments_reviewed, row.rejection_count).toFixed(1)}%)
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-stone-50/95 shadow-[0_-1px_0_0_rgb(231_229_228)]">
              <tr className="border-t border-stone-200 text-xs font-semibold text-muted-foreground">
                <td className="px-4 py-3" colSpan={2}>Total</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-blue-700">
                  {total.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-600">
                  {editedTotal.toLocaleString()}{' '}
                  <span
                    className="font-normal text-muted-foreground"
                    title={REVIEWER_EDITED_RATE_FORMULA}
                  >
                    ({editedRate(editedTotal, total).toFixed(1)}%)
                  </span>
                </td>
                <td
                  className="px-4 py-3 text-right tabular-nums font-semibold text-red-600"
                  title={REJECTION_RATE_FORMULA}
                >
                  {rejectedTotal.toLocaleString()}{' '}
                  <span className="font-normal text-muted-foreground">
                    ({rejectionRate(total, rejectedTotal).toFixed(1)}%)
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

function OutlinerAdminStatistics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const startDate = searchParams.get('startDate') || defaultRange.start;
  const endDate = searchParams.get('endDate') || defaultRange.end;
  const dataParse = (date: string) => new Date(date).toISOString().split('T')[0];

  const selectedUserId = searchParams.get('annotator') || undefined;

  const initialFilters: DashboardStatsFilters = {
    userId: selectedUserId,
    startDate: startDate ? dataParse(startDate) : undefined,
    endDate: endDate ? dataParse(endDate) : undefined,
  };

  const { data, isLoading } = useStatistics({
    userId: selectedUserId,
    startDate: startDate ? new Date(startDate).toISOString() : undefined,
    endDate: endDate ? `${endDate}T23:59:59` : undefined,
  });

  const [filters, setFilters] = useState<DashboardStatsFilters>(initialFilters);

  const [annotatorSortField, setAnnotatorSortField] =
    useState<AnnotatorSortField>('segments_approved');
  const [annotatorSortDir, setAnnotatorSortDir] = useState<SortDir>('desc');
  const [reviewerSortField, setReviewerSortField] =
    useState<ReviewerSortField>('segments_reviewed');
  const [reviewerSortDir, setReviewerSortDir] = useState<SortDir>('desc');

  const toggleAnnotatorSort = (field: AnnotatorSortField) => {
    if (annotatorSortField === field) setAnnotatorSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setAnnotatorSortField(field);
      setAnnotatorSortDir('desc');
    }
  };

  const toggleReviewerSort = (field: ReviewerSortField) => {
    if (reviewerSortField === field) setReviewerSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setReviewerSortField(field);
      setReviewerSortDir('desc');
    }
  };

  const startDateParsed = filters.startDate ? dataParse(filters.startDate) : '';
  const endDateParsed = filters.endDate ? dataParse(filters.endDate) : '';

  const applyFilters = () => {
    setSearchParams((params) => {
      params.set('startDate', startDateParsed);
      params.set('endDate', endDateParsed);
      if (filters.userId && filters.userId !== 'all') {
        params.set('annotator', filters.userId);
      } else {
        params.delete('annotator');
      }
      return params;
    });
  };

  const checkApplyButtonDisabled = () =>
    startDateParsed === initialFilters.startDate &&
    endDateParsed === initialFilters.endDate &&
    (filters.userId || 'all') === (initialFilters.userId || 'all');

  // filtered user's name for the review-output headings; same cached query as UserFilter
  const { users } = useOutlinerUsers();
  const selectedUserName = selectedUserId
    ? users.find((u) => u.id === selectedUserId)?.name
    : undefined;

  const annotatorRows: AnnotatorApprovedRow[] = data?.annotators ?? [];
  const reviewerRows: ReviewerApprovedRow[] = data?.reviewers ?? [];
  const reviewedByUserRows: ReviewerApprovedRow[] = data?.reviewed_by_user ?? [];

  const sortedAnnotators = useMemo(() => {
    const dir = annotatorSortDir === 'desc' ? -1 : 1;
    const valueOf = (r: AnnotatorApprovedRow) => {
      if (annotatorSortField === 'rejection_rate')
        return annotatorRejectionRate(r.segments_approved, r.rejected_segments);
      if (annotatorSortField === 'edited_segments')
        return editedRate(r.edited_segments, r.segments_approved);
      return annotatorApprovalRate(r.segments_approved, r.rejected_segments);
    };
    return [...annotatorRows].sort((a, b) =>
      annotatorSortField === 'name'
        ? dir * a.name.localeCompare(b.name)
        : dir * (valueOf(a) - valueOf(b)),
    );
  }, [annotatorRows, annotatorSortField, annotatorSortDir]);

  const sortReviewers = useCallback(
    (rows: ReviewerApprovedRow[]) => {
      const dir = reviewerSortDir === 'desc' ? -1 : 1;
      const valueOf = (r: ReviewerApprovedRow) => {
        if (reviewerSortField === 'rejection_rate')
          return rejectionRate(r.segments_reviewed, r.rejection_count);
        if (reviewerSortField === 'edited_segments')
          return editedRate(r.edited_segments, r.segments_reviewed);
        return r.segments_reviewed;
      };
      return [...rows].sort((a, b) =>
        reviewerSortField === 'name'
          ? dir * a.name.localeCompare(b.name)
          : dir * (valueOf(a) - valueOf(b)),
      );
    },
    [reviewerSortField, reviewerSortDir],
  );

  const sortedReviewers = useMemo(
    () => sortReviewers(reviewerRows),
    [reviewerRows, sortReviewers],
  );
  const sortedReviewedByUser = useMemo(
    () => sortReviewers(reviewedByUserRows),
    [reviewedByUserRows, sortReviewers],
  );

  const annotatorTotal = sortedAnnotators.reduce((s, r) => s + r.segments_approved, 0);
  const annotatorEditedTotal = sortedAnnotators.reduce((s, r) => s + r.edited_segments, 0);
  const annotatorRejectedTotal = sortedAnnotators.reduce((s, r) => s + r.rejection_count, 0);
  const annotatorRejectedSegmentsTotal = sortedAnnotators.reduce(
    (s, r) => s + r.rejected_segments,
    0,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      {/* Filters bar */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3 bg-gray-50/80">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Filters</span>
        <UserFilter
          value={filters.userId || 'all'}
          onChange={(userId) => setFilters({ ...filters, userId })}
        />
        <DateRangeFilter
          onUpdateStartDate={(sd) => setFilters({ ...filters, startDate: sd })}
          onUpdateEndDate={(ed) => setFilters({ ...filters, endDate: ed })}
        />
        <Button disabled={checkApplyButtonDisabled()} onClick={applyFilters}>
          Apply Filters
        </Button>
      </div>

      {isLoading && <SkeletonLarger />}

      {!isLoading && !data && (
        <p className={`${cardPanel} border-dashed py-16 text-center text-sm text-muted-foreground`}>
          No data available.
        </p>
      )}

      {data && (
        <div className="flex flex-col gap-6">
          {/* Annotator table */}
          <section className={cardPanel}>
            <div className="mb-4 min-w-0 border-l-[3px] border-primary pl-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                Per Annotator
              </p>
              <h3 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">
                Annotator Approved Segments
              </h3>
            </div>

            {sortedAnnotators.length === 0 ? (
              <p className="rounded-lg border border-dashed border-stone-200/80 bg-stone-50/40 py-12 text-center text-sm text-muted-foreground">
                No data for this period.
              </p>
            ) : (
              <div className="max-h-[min(640px,60vh)] overflow-y-auto overflow-x-auto rounded-lg border border-stone-200/80 bg-white/60">
                <table className="w-full min-w-[24rem] border-collapse text-sm">
                  <thead className="sticky top-0 z-[1] shadow-[0_1px_0_0_rgb(231_229_228)]">
                    <tr className="border-b border-stone-200 bg-stone-50/95 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                      <th className="px-4 py-3">No.</th>
                      <th className="px-4 py-3">
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 transition-colors hover:text-foreground"
                          onClick={() => toggleAnnotatorSort('name')}
                        >
                          Annotator
                          <SortIcon<AnnotatorSortField>
                            field="name"
                            active={annotatorSortField}
                            dir={annotatorSortDir}
                          />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right tabular-nums">
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 transition-colors hover:text-foreground"
                          onClick={() => toggleAnnotatorSort('segments_approved')}
                        >
                          Approved
                          <SortIcon<AnnotatorSortField>
                            field="segments_approved"
                            active={annotatorSortField}
                            dir={annotatorSortDir}
                          />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right tabular-nums">
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 transition-colors hover:text-foreground"
                          onClick={() => toggleAnnotatorSort('edited_segments')}
                        >
                          Edited
                          <SortIcon<AnnotatorSortField>
                            field="edited_segments"
                            active={annotatorSortField}
                            dir={annotatorSortDir}
                          />
                        </button>
                      </th>
                      <th
                        className="px-4 py-3 text-right tabular-nums"
                        title={ANNOTATOR_REJECTION_RATE_FORMULA}
                      >
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 transition-colors hover:text-foreground"
                          onClick={() => toggleAnnotatorSort('rejection_rate')}
                        >
                          Rejected
                          <SortIcon<AnnotatorSortField>
                            field="rejection_rate"
                            active={annotatorSortField}
                            dir={annotatorSortDir}
                          />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAnnotators.map((row, idx) => (
                      <tr
                        key={row.user_id ?? row.name}
                        className="border-b border-stone-100 last:border-0 hover:bg-stone-50/80"
                      >
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">{idx + 1}</td>
                        <td className="max-w-[14rem] px-4 py-3 font-medium leading-snug text-foreground sm:max-w-none sm:whitespace-normal">
                          <span className="break-words">{row.name}</span>
                        </td>
                        <td
                          className="px-4 py-3 text-right tabular-nums text-emerald-700"
                          title={ANNOTATOR_APPROVAL_RATE_FORMULA}
                        >
                          {row.segments_approved.toLocaleString()}{' '}
                          <span className="text-muted-foreground">
                            (
                            {annotatorApprovalRate(
                              row.segments_approved,
                              row.rejected_segments,
                            ).toFixed(1)}
                            %)
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-600">
                          {row.edited_segments.toLocaleString()}{' '}
                          <span
                            className="text-muted-foreground"
                            title={ANNOTATOR_EDITED_RATE_FORMULA}
                          >
                            ({editedRate(row.edited_segments, row.segments_approved).toFixed(1)}%)
                          </span>
                        </td>
                        <td
                          className="px-4 py-3 text-right tabular-nums text-red-600"
                          title={ANNOTATOR_REJECTION_RATE_FORMULA}
                        >
                          {row.rejection_count.toLocaleString()}{' '}
                          <span className="text-muted-foreground">
                            (
                            {annotatorRejectionRate(
                              row.segments_approved,
                              row.rejected_segments,
                            ).toFixed(1)}
                            %)
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-stone-50/95 shadow-[0_-1px_0_0_rgb(231_229_228)]">
                    <tr className="border-t border-stone-200 text-xs font-semibold text-muted-foreground">
                      <td className="px-4 py-3" colSpan={2}>Total</td>
                      <td
                        className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700"
                        title={ANNOTATOR_APPROVAL_RATE_FORMULA}
                      >
                        {annotatorTotal.toLocaleString()}{' '}
                        <span className="font-normal text-muted-foreground">
                          (
                          {annotatorApprovalRate(
                            annotatorTotal,
                            annotatorRejectedSegmentsTotal,
                          ).toFixed(1)}
                          %)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-600">
                        {annotatorEditedTotal.toLocaleString()}{' '}
                        <span
                          className="font-normal text-muted-foreground"
                          title={ANNOTATOR_EDITED_RATE_FORMULA}
                        >
                          ({editedRate(annotatorEditedTotal, annotatorTotal).toFixed(1)}%)
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-right tabular-nums font-semibold text-red-600"
                        title={ANNOTATOR_REJECTION_RATE_FORMULA}
                      >
                        {annotatorRejectedTotal.toLocaleString()}{' '}
                        <span className="font-normal text-muted-foreground">
                          (
                          {annotatorRejectionRate(
                            annotatorTotal,
                            annotatorRejectedSegmentsTotal,
                          ).toFixed(1)}
                          %)
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <ReviewerTable
            rows={sortedReviewers}
            eyebrow="Per Reviewer"
            heading="Reviewer Approved Segments"
            emptyMessage="No data for this period."
            sortField={reviewerSortField}
            sortDir={reviewerSortDir}
            onToggleSort={toggleReviewerSort}
          />

          {selectedUserId && (
            <ReviewerTable
              rows={sortedReviewedByUser}
              eyebrow={selectedUserName ? `Reviews By ${selectedUserName}` : 'Reviews By This User'}
              heading={
                selectedUserName
                  ? `Segments Reviewed By ${selectedUserName}`
                  : 'Segments They Reviewed'
              }
              emptyMessage={
                selectedUserName
                  ? `${selectedUserName} reviewed no segments in this period.`
                  : 'No segments reviewed in this period.'
              }
              sortField={reviewerSortField}
              sortDir={reviewerSortDir}
              onToggleSort={toggleReviewerSort}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default OutlinerAdminStatistics;
