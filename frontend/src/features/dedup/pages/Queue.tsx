import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, Settings } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MyItemsState, ReviewItem } from '../api/review';
import { useBatchName, useClaimItems, useMyItems } from '../hooks/useReview';
import { hasIssue, isDecided, verdictLabel } from '../utils';

const STATE_TABS: { key: MyItemsState; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'To do' },
  { key: 'done', label: 'Done' },
];

const VERDICT_STYLE: Record<string, string> = {
  same: 'bg-green-50 text-green-700',
  different: 'bg-red-50 text-red-700',
};

const isDone = (it: ReviewItem) => isDecided(it) || hasIssue(it);

type RowStatus = 'done' | 'progress' | 'new';
// A flagged issue also counts as done; "In progress" = opened but not answered.
function rowStatus(it: ReviewItem): RowStatus {
  if (isDone(it)) return 'done';
  return it.assignment?.first_opened_at ? 'progress' : 'new';
}
const STATUS_LABEL: Record<RowStatus, string> = { done: 'Done', progress: 'In progress', new: 'Not started' };
const STATUS_STYLE: Record<RowStatus, string> = {
  done: 'bg-green-50 text-green-700',
  progress: 'bg-amber-50 text-amber-800',
  new: 'bg-gray-100 text-gray-600',
};

export default function Queue() {
  const navigate = useNavigate();
  const batchName = useBatchName();
  const { user } = useUser();
  const [state, setState] = useState<MyItemsState>('all');
  const [q, setQ] = useState('');

  const items = useMyItems(state);
  const openItems = useMyItems('open');
  // Numbered from the full list so an item keeps its number in every tab.
  const allItems = useMyItems('all');
  const numberOf = useMemo(
    () => new Map((allItems.data ?? []).map((it, i) => [it.item_id, i + 1])),
    [allItems.data],
  );
  const claim = useClaimItems();

  const loaded = useMemo(() => items.data ?? [], [items.data]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return loaded;
    return loaded.filter(
      (it) =>
        (it.evidence.a?.title_bo ?? '').toLowerCase().includes(needle) ||
        (it.evidence.b?.title_bo ?? '').toLowerCase().includes(needle),
    );
  }, [loaded, q]);

  const myOpen = openItems.data?.length ?? 0;
  const openItem = (itemId: number) => navigate(`/dedup/item/${itemId}`);

  const assignWork = async () => {
    try {
      const res = await claim.mutateAsync();
      if (res.items.length === 0) toast.info('No items left to review right now');
      else if (res.claimed > 0) toast.success(`${res.claimed} new items assigned to you`);
    } catch (e) {
      toast.error(`Could not assign work: ${(e as Error).message}`);
    }
  };

  let emptyText = 'No items here.';
  if (q) emptyText = `No titles match “${q}”.`;
  else if (state !== 'done') emptyText = 'Nothing to do right now. Click “Assign me work” to get your next set.';

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Deduplicator</h1>
          <p className="mt-1 text-sm text-gray-600">
            Review whether two texts are copies of the same work.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
        {user?.role === 'admin' && (
          <Button asChild variant="outline" className="cursor-pointer">
            <Link to="/dedup-admin">
              <Settings className="h-4 w-4" /> Admin
            </Link>
          </Button>
        )}
        <Button
          className="flex-1 cursor-pointer sm:flex-none"
          onClick={assignWork}
          disabled={claim.isPending || myOpen > 0}
          title={myOpen > 0 ? 'Finish your current items first' : undefined}
        >
          {claim.isPending ? 'Assigning…' : 'Assign me work'}
        </Button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md bg-gray-100 p-1" role="tablist">
          {STATE_TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={state === t.key}
              onClick={() => setState(t.key)}
              className={`cursor-pointer rounded px-3 py-1 text-sm font-medium transition-colors ${
                state === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles…"
          className="w-full sm:w-72"
        />
      </div>

      {items.error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load items: {items.error.message}
        </div>
      )}

      <ul className="space-y-2 sm:hidden">
        {items.isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="h-28 animate-pulse rounded-lg bg-gray-100" />
          ))}
        {rows.map((it) => {
          const done = isDone(it);
          const status = rowStatus(it);
          return (
            <li key={it.item_id}>
              <button
                onClick={() => openItem(it.item_id)}
                className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm active:bg-gray-50"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span className="tabular-nums" title={`Item ${it.item_id}`}>
                    No. {numberOf.get(it.item_id) ?? '—'} · {batchName(it.batch_id)}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 font-medium ${STATUS_STYLE[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <div className="mt-2 break-words font-monlam text-base leading-relaxed text-gray-900">
                  {it.evidence.a?.title_bo || '—'}
                </div>
                <div className="break-words font-monlam text-sm leading-relaxed text-gray-500">
                  {it.evidence.b?.title_bo || '—'}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <DecisionBadge item={it} />
                  <span
                    className={`inline-flex items-center gap-1 text-sm font-medium ${done ? 'text-gray-600' : 'text-blue-700'}`}
                  >
                    {done ? (
                      <>
                        <Eye className="h-3.5 w-3.5" /> View
                      </>
                    ) : (
                      <>
                        Review <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
        {!items.isLoading && rows.length === 0 && (
          <li className="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">{emptyText}</li>
        )}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm sm:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-16 px-4 py-3 font-medium">No.</th>
              <th className="px-4 py-3 font-medium">Texts</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Batch</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Decision</th>
              <th className="w-32 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-10 animate-pulse rounded bg-gray-100" />
                  </td>
                </tr>
              ))}
            {rows.map((it) => {
              const done = isDone(it);
              const status = rowStatus(it);
              return (
                <tr
                  key={it.item_id}
                  onClick={() => openItem(it.item_id)}
                  className="cursor-pointer transition-colors hover:bg-gray-50"
                >
                  <td className="px-4 py-4 tabular-nums text-gray-500" title={`Item ${it.item_id}`}>
                    {numberOf.get(it.item_id) ?? '—'}
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-monlam text-base leading-relaxed text-gray-900">
                      {it.evidence.a?.title_bo || '—'}
                    </div>
                    <div className="font-monlam text-sm leading-relaxed text-gray-500">
                      {it.evidence.b?.title_bo || '—'}
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-sm text-gray-600 md:table-cell" title={it.batch_id}>
                    {batchName(it.batch_id)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 sm:table-cell">
                    <DecisionBadge item={it} />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openItem(it.item_id);
                      }}
                      className={
                        done
                          ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
                          : 'border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800'
                      }
                    >
                      {done ? (
                        <>
                          <Eye className="h-3.5 w-3.5" /> View
                        </>
                      ) : (
                        <>
                          Review <ArrowRight className="h-3.5 w-3.5" />
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!items.isLoading && rows.length === 0 && (
          <p className="py-12 text-center text-sm text-gray-500">{emptyText}</p>
        )}
      </div>

      <div className="mt-3 text-sm text-gray-600">
        {q ? (
          <>
            {rows.length} {rows.length === 1 ? 'match' : 'matches'} in {loaded.length} items
          </>
        ) : (
          <>
            <strong className="text-gray-900">{loaded.length}</strong> {loaded.length === 1 ? 'item' : 'items'}
          </>
        )}
      </div>
    </div>
  );
}

function DecisionBadge({ item }: { item: ReviewItem }) {
  if (item.verdict) {
    return (
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          VERDICT_STYLE[item.verdict] ?? 'bg-gray-100 text-gray-700'
        }`}
      >
        {verdictLabel(item.verdict)}
      </span>
    );
  }
  if (hasIssue(item)) {
    return (
      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        Issue flagged
      </span>
    );
  }
  return <span className="text-gray-300">—</span>;
}
