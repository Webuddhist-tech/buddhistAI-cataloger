import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useBatchName, useBatches } from '../hooks/useReview';

const KIND_LABEL: Record<string, string> = {
  pair: 'Compare two texts side by side',
};

// Batch list (not routed for now; kept for the admin dashboard).
export default function Dashboard() {
  const batches = useBatches();
  const batchName = useBatchName();

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Deduplicator</h1>
        <p className="mt-1 text-sm text-gray-600">
          Review whether two texts are copies of the same work.
        </p>
      </div>

      {batches.isLoading && (
        <div className="space-y-3">
          <div className="h-28 w-full animate-pulse rounded-xl bg-gray-100" />
          <div className="h-28 w-full animate-pulse rounded-xl bg-gray-100" />
        </div>
      )}

      {batches.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load batches: {batches.error.message}
        </div>
      )}

      {batches.data?.length === 0 && (
        <p className="py-16 text-center text-gray-500">No batches published yet.</p>
      )}

      <div className="space-y-3">
        {batches.data?.map((b) => {
          const counts = b.status_counts;
          const total = b.n_items || Object.values(counts).reduce((a, c) => a + c, 0);
          const done = counts.finalized ?? 0;
          // Anything that is neither 'new' nor 'finalized' is work in flight.
          const inProgress = Object.entries(counts)
            .filter(([k]) => k !== 'new' && k !== 'finalized')
            .reduce((a, [, c]) => a + c, 0);
          const pctDone = total ? Math.round((done / total) * 100) : 0;

          return (
            <div
              key={b.batch_id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-gray-900">{batchName(b.batch_id)}</h2>
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                      {b.batch_id}
                    </code>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {total} items to review
                    {KIND_LABEL[b.kind] && <> · {KIND_LABEL[b.kind]}</>}
                  </p>
                  {(b.my_open > 0 || b.my_done > 0) && (
                    <p className="mt-0.5 text-xs text-gray-500">
                      You: {b.my_done} done{b.my_open > 0 && <>, {b.my_open} waiting</>}
                    </p>
                  )}
                </div>
                <Button asChild>
                  <Link to="/dedup">
                    {b.my_open > 0 || b.my_done > 0 ? 'Continue' : 'Start reviewing'}
                  </Link>
                </Button>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <span className="h-full bg-green-600" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                  <span className="h-full bg-amber-400" style={{ width: `${total ? (inProgress / total) * 100 : 0}%` }} />
                </div>
                <span className="whitespace-nowrap text-xs tabular-nums text-gray-500">
                  {done === 0 ? 'Not started' : `${pctDone}% complete`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
