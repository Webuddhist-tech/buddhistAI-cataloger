import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, ListChecks } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AdjudicationItem, AnnotatorAnswer, MyItemsState } from '../api/review';
import { useAdjudicationQueue, useBatchName } from '../hooks/useReview';
import { formatDateTime, verdictLabel } from '../utils';

const STATE_TABS: { key: MyItemsState; label: string }[] = [
  { key: 'open', label: 'To do' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
];

const VERDICT_STYLE: Record<string, string> = {
  same: 'bg-green-50 text-green-700',
  different: 'bg-red-50 text-red-700',
};

type RowStatus = 'done' | 'progress' | 'new';
function rowStatus(it: AdjudicationItem): RowStatus {
  if (it.adjudication.completed_at) return 'done';
  return it.adjudication.first_opened_at ? 'progress' : 'new';
}
const STATUS_LABEL: Record<RowStatus, string> = { done: 'Settled', progress: 'In progress', new: 'Waiting' };
const STATUS_STYLE: Record<RowStatus, string> = {
  done: 'bg-green-50 text-green-700',
  progress: 'bg-amber-50 text-amber-800',
  new: 'bg-gray-100 text-gray-600',
};

/** How long a pair has been waiting, e.g. "3 h" or "2 d". */
function waited(iso: string): string {
  const t = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).getTime();
  const h = Math.max(0, Math.floor((Date.now() - t) / 3_600_000));
  if (h < 1) return '< 1 h';
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

function VerdictChip({ answer }: Readonly<{ answer: AnnotatorAnswer }>) {
  const label = answer.verdict === 'not_sure' ? "Can't answer" : answer.verdict ? verdictLabel(answer.verdict) : '—';
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
        (answer.verdict && VERDICT_STYLE[answer.verdict]) || 'bg-gray-100 text-gray-700'
      }`}
    >
      {label}
    </span>
  );
}

function Dispute({ item }: Readonly<{ item: AdjudicationItem }>) {
  const [first, second] = item.annotations;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {first && <VerdictChip answer={first} />}
      <span className="text-xs text-gray-400">vs</span>
      {second && <VerdictChip answer={second} />}
    </span>
  );
}

// Disputed pairs for adjudicators (reviewers, and admins on pairs they did not annotate).
export default function AdjudicationQueue() {
  const navigate = useNavigate();
  const batchName = useBatchName();
  const { user } = useUser();
  const [state, setState] = useState<MyItemsState>('open');
  const [q, setQ] = useState('');
  const items = useAdjudicationQueue(state);
  const allItems = useAdjudicationQueue('all');
  const numberOf = useMemo(
    () => new Map((allItems.data ?? []).map((it, i) => [it.item_id, i + 1])),
    [allItems.data],
  );

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
  const openItem = (itemId: number) => navigate(`/dedup/adjudicate/${itemId}`);

  let emptyText = 'No pairs here.';
  if (q) emptyText = `No titles match “${q}”.`;
  else if (state === 'open') emptyText = 'Nothing to adjudicate right now. Pairs appear here when two annotators disagree.';

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">To adjudicate</h1>
          <p className="mt-1 text-sm text-gray-600">
            Pairs where the two annotators did not agree. Read the texts and give the final answer.
          </p>
        </div>
        {user?.role === 'admin' && (
          <Button asChild variant="outline" className="cursor-pointer">
            <Link to="/dedup">
              <ListChecks className="h-4 w-4" /> My items
            </Link>
          </Button>
        )}
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
          Could not load pairs: {items.error.message}
        </div>
      )}

      <ul className="space-y-2 sm:hidden">
        {items.isLoading &&
          Array.from({ length: 4 }).map((_, i) => <li key={i} className="h-28 animate-pulse rounded-lg bg-gray-100" />)}
        {rows.map((it) => {
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
                  <Dispute item={it} />
                  <span className="text-xs text-gray-500">waiting {waited(it.adjudication.created_at)}</span>
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
              <th className="px-4 py-3 font-medium">Annotators said</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Final answer</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Waiting since</th>
              <th className="w-32 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-4 py-3">
                    <div className="h-10 animate-pulse rounded bg-gray-100" />
                  </td>
                </tr>
              ))}
            {rows.map((it) => {
              const status = rowStatus(it);
              const done = status === 'done';
              return (
                <tr key={it.item_id} onClick={() => openItem(it.item_id)} className="cursor-pointer transition-colors hover:bg-gray-50">
                  <td className="px-4 py-4 tabular-nums text-gray-500" title={`Item ${it.item_id}`}>
                    {numberOf.get(it.item_id) ?? '—'}
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-monlam text-base leading-relaxed text-gray-900">{it.evidence.a?.title_bo || '—'}</div>
                    <div className="font-monlam text-sm leading-relaxed text-gray-500">{it.evidence.b?.title_bo || '—'}</div>
                  </td>
                  <td className="px-4 py-4">
                    <Dispute item={it} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 md:table-cell">
                    {it.verdict ? (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          VERDICT_STYLE[it.verdict] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {it.verdict === 'not_sure' ? 'Unresolved' : verdictLabel(it.verdict)}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td
                    className="hidden whitespace-nowrap px-4 py-4 text-gray-600 lg:table-cell"
                    title={formatDateTime(it.adjudication.created_at)}
                  >
                    {waited(it.adjudication.created_at)}
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
                          Adjudicate <ArrowRight className="h-3.5 w-3.5" />
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items.isLoading && rows.length === 0 && <p className="py-12 text-center text-sm text-gray-500">{emptyText}</p>}
      </div>

      <div className="mt-3 text-sm text-gray-600">
        {q ? (
          <>
            {rows.length} {rows.length === 1 ? 'match' : 'matches'} in {loaded.length} pairs
          </>
        ) : (
          <>
            <strong className="text-gray-900">{loaded.length}</strong> {loaded.length === 1 ? 'pair' : 'pairs'}
          </>
        )}
      </div>
    </div>
  );
}
