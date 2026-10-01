import { useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { AdminAdjudication, AnnotatorAnswer, MyItemsState } from '../api/review';
import { useAdminAdjudications, useAnnotators, useReassignAdjudications } from '../hooks/useReview';
import { RESOLUTION_LABEL, answerLabel, formatDateTime } from '../utils';
import InfoTip from './InfoTip';

const TABS: { key: MyItemsState; label: string }[] = [
  { key: 'open', label: 'Not settled' },
  { key: 'done', label: 'Settled' },
  { key: 'all', label: 'All' },
];

const VERDICT_STYLE: Record<string, string> = {
  same: 'bg-green-50 text-green-700',
  different: 'bg-red-50 text-red-700',
};

type Status = 'waiting' | 'progress' | 'settled';
function statusOf(a: AdminAdjudication): Status {
  if (a.completed_at) return 'settled';
  return a.adjudicator_id ? 'progress' : 'waiting';
}
const STATUS_LABEL: Record<Status, string> = { waiting: 'Waiting', progress: 'Being adjudicated', settled: 'Settled' };
const STATUS_STYLE: Record<Status, string> = {
  waiting: 'bg-gray-100 text-gray-600',
  progress: 'bg-amber-50 text-amber-800',
  settled: 'bg-green-50 text-green-700',
};

function Chip({ verdict }: Readonly<{ verdict: string | null }>) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
        (verdict && VERDICT_STYLE[verdict]) || 'bg-gray-100 text-gray-700'
      }`}
    >
      {answerLabel(verdict)}
    </span>
  );
}

// Disputed pairs (the two annotators did not agree), with names: admins only.
export default function AdminAdjudications() {
  const [state, setState] = useState<MyItemsState>('open');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [target, setTarget] = useState('');
  const list = useAdminAdjudications(state);
  const annotators = useAnnotators();
  const reassign = useReassignAdjudications();

  const nameOf = useMemo(() => {
    const m = new Map((annotators.data ?? []).map((a) => [a.user_id, a.name || a.email || a.user_id]));
    return (id: string | null | undefined) => (id ? m.get(id) ?? id : '—');
  }, [annotators.data]);
  // Anyone who may adjudicate: reviewers and admins. Pairs they annotated are skipped by the server.
  const adjudicators = (annotators.data ?? []).filter((a) => a.has_access && (a.role === 'reviewer' || a.role === 'admin'));

  const rows = list.data ?? [];
  const movable = rows.filter((a) => !a.completed_at);
  const allSelected = movable.length > 0 && movable.every((a) => selected.has(a.item_id));

  useEffect(() => {
    setSelected((prev) => new Set([...prev].filter((id) => movable.some((a) => a.item_id === id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = async (toUserId: string | null) => {
    try {
      const res = await reassign.mutateAsync({ itemIds: [...selected], toUserId });
      const verb = toUserId ? `handed to ${nameOf(toUserId)}` : 'put back in the queue';
      toast.success(`${res.moved.length} ${res.moved.length === 1 ? 'pair' : 'pairs'} ${verb}`);
      if (res.skipped.length) {
        toast.info(`${res.skipped.length} skipped: already settled, or that person annotated the pair`);
      }
      setSelected(new Set());
      setTarget('');
    } catch (e) {
      toast.error(`Could not update: ${(e as Error).message}`);
    }
  };

  const n = selected.size;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8" style={{ paddingBottom: n ? 112 : undefined }}>
      <h1 className="text-2xl font-semibold text-gray-900">Adjudications</h1>
      <p className="mt-1 text-sm text-gray-600">
        Pairs where the two annotators did not agree, or one of them could not answer. The adjudicator&rsquo;s answer is final.
      </p>

      <div className="mt-5 mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md bg-gray-100 p-1" role="tablist">
          {TABS.map((t) => (
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
        <p className="inline-flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          Tick unsettled pairs to hand them over. <Lock className="h-3.5 w-3.5" /> Settled pairs stay.
        </p>
      </div>

      {list.error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load disputed pairs: {list.error.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all unsettled pairs"
                  className="cursor-pointer"
                  disabled={movable.length === 0}
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(movable.map((a) => a.item_id)))}
                />
              </th>
              <th className="px-3 py-3 font-medium">Pair</th>
              <th className="px-3 py-3 font-medium">Texts</th>
              <th className="px-3 py-3 font-medium">Annotators said</th>
              <th className="px-3 py-3 font-medium">Adjudicator</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">
                <span className="inline-flex items-center gap-1">
                  Final answer <InfoTip text="The adjudicator's answer, and how it compares with the annotators'." />
                </span>
              </th>
              <th className="px-3 py-3 font-medium">Disputed since</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={8} className="px-4 py-3">
                    <div className="h-8 animate-pulse rounded bg-gray-100" />
                  </td>
                </tr>
              ))}
            {rows.map((a) => {
              const settled = Boolean(a.completed_at);
              const status = statusOf(a);
              return (
                <tr
                  key={a.item_id}
                  onClick={() => !settled && toggle(a.item_id)}
                  className={settled ? '' : `cursor-pointer hover:bg-gray-50 ${selected.has(a.item_id) ? 'bg-blue-50/60' : ''}`}
                >
                  <td className="px-4 py-3">
                    {settled ? (
                      <span title="Settled" className="inline-flex text-gray-400">
                        <Lock className="h-4 w-4" />
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        aria-label={`Select pair ${a.item_id}`}
                        className="cursor-pointer"
                        checked={selected.has(a.item_id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggle(a.item_id)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-gray-500">{a.item_id}</td>
                  <td className="max-w-xs px-3 py-3">
                    <div className="break-words font-monlam text-base leading-relaxed text-gray-900">{a.title_a || '—'}</div>
                    <div className="break-words font-monlam text-sm leading-relaxed text-gray-500">{a.title_b || '—'}</div>
                  </td>
                  <td className="px-3 py-3">
                    <ul className="space-y-1.5">
                      {a.annotations.map((ans: AnnotatorAnswer) => (
                        <li key={ans.label} className="flex flex-wrap items-center gap-1.5">
                          <span className="max-w-[10rem] truncate text-xs text-gray-600" title={nameOf(ans.annotator_id)}>
                            {nameOf(ans.annotator_id)}
                          </span>
                          <Chip verdict={ans.verdict} />
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-gray-700">{a.adjudicator_name ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {settled ? (
                      <div className="space-y-1">
                        <Chip verdict={a.verdict} />
                        {a.resolution && <div className="text-xs text-gray-500">{RESOLUTION_LABEL[a.resolution] ?? a.resolution}</div>}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-500">{formatDateTime(a.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.isLoading && rows.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-500">
            {state === 'open' ? 'No disputed pairs waiting.' : 'No pairs here.'}
          </p>
        )}
      </div>

      {n > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
            <span className="text-sm font-medium text-gray-900">
              {n} {n === 1 ? 'pair' : 'pairs'} selected
            </span>
            <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full min-w-0 cursor-pointer rounded-md border border-gray-300 bg-white px-2 py-2 text-sm sm:w-auto sm:max-w-xs"
                aria-label="Hand to adjudicator"
              >
                <option value="">Hand to…</option>
                {adjudicators.map((a) => (
                  <option key={a.user_id} value={a.user_id}>
                    {a.name || a.email}
                    {a.role === 'reviewer' ? ' (adjudicator)' : ' (admin)'}
                  </option>
                ))}
              </select>
              <Button className="cursor-pointer" disabled={!target || reassign.isPending} onClick={() => apply(target)}>
                Hand over
              </Button>
              <span className="inline-flex items-center gap-1">
                <Button variant="outline" className="cursor-pointer" disabled={reassign.isPending} onClick={() => apply(null)}>
                  Put back in queue
                </Button>
                <InfoTip text="Frees these pairs: the next adjudicator to open one takes it." />
              </span>
              <Button variant="ghost" className="cursor-pointer" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
