import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { MyItemsState, ReviewItem } from '../api/review';
import { useAdminOverview, useAnnotatorItems, useAnnotators, useReassign } from '../hooks/useReview';
import { batchNames, hasIssue, isDecided, verdictLabel } from '../utils';
import { Person } from './AdminAnnotators';
import InfoTip from './InfoTip';

const TABS: { key: MyItemsState; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'To do' },
  { key: 'done', label: 'Done' },
];

// Only unfinished items can be moved: an answered item belongs to whoever answered it.
const isFinished = (it: ReviewItem) => Boolean(it.assignment?.completed_at);

type Pending = { kind: 'reassign'; to: string } | { kind: 'release' };

export default function AdminAnnotator() {
  const { userId = '' } = useParams();
  const [state, setState] = useState<MyItemsState>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [target, setTarget] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);

  const annotators = useAnnotators();
  const items = useAnnotatorItems(userId, state);
  const overview = useAdminOverview();
  const reassign = useReassign();

  const person = annotators.data?.find((a) => a.user_id === userId);
  const targets = (annotators.data ?? []).filter((a) => a.has_access && a.user_id !== userId);
  const targetPerson = targets.find((a) => a.user_id === target);
  const names = useMemo(() => batchNames(overview.data?.batches ?? []), [overview.data?.batches]);

  const rows = items.data ?? [];
  const movable = rows.filter((it) => !isFinished(it));
  const allMovableSelected = movable.length > 0 && movable.every((it) => selected.has(it.item_id));

  // Drop selections that are no longer on screen or no longer movable.
  useEffect(() => {
    setSelected((prev) => new Set([...prev].filter((id) => movable.some((it) => it.item_id === id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.data]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = async () => {
    if (!pending) return;
    try {
      const res = await reassign.mutateAsync({
        itemIds: [...selected],
        toUserId: pending.kind === 'reassign' ? pending.to : null,
      });
      const verb = pending.kind === 'reassign' ? `moved to ${targetPerson?.name || targetPerson?.email}` : 'unassigned';
      toast.success(`${res.moved.length} ${res.moved.length === 1 ? 'pair' : 'pairs'} ${verb}`);
      if (res.skipped.length) {
        toast.info(`${res.skipped.length} skipped: already answered or no longer assigned here`);
      }
      setSelected(new Set());
      setPending(null);
    } catch (e) {
      toast.error(`Could not update: ${(e as Error).message}`);
    }
  };

  const n = selected.size;
  const itemsWord = n === 1 ? 'pair' : 'pairs';

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8" style={{ paddingBottom: n ? 112 : undefined }}>
      <Link to="/dedup-admin/annotators" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Annotators
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        {person ? <Person a={person} /> : <div className="h-8" />}
        {person && (
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-green-50 px-3 py-1 text-green-700">
              <strong className="tabular-nums">{person.done}</strong> answered
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">
              <strong className="tabular-nums">{person.in_progress}</strong> opened
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
              <strong className="tabular-nums">{person.not_started}</strong> not opened
            </span>
          </div>
        )}
      </div>

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
          Tick unanswered pairs to move them. <Lock className="h-3.5 w-3.5" /> Answered pairs stay.
        </p>
      </div>

      {items.error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load items: {items.error.message}
        </div>
      )}

      {/* Phones */}
      <ul className="space-y-2 sm:hidden">
        {items.isLoading &&
          Array.from({ length: 3 }).map((_, i) => <li key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />)}
        {rows.map((it) => {
          const finished = isFinished(it);
          const picked = selected.has(it.item_id);
          return (
            <li key={it.item_id}>
              <div
                role={finished ? undefined : 'checkbox'}
                aria-checked={finished ? undefined : picked}
                tabIndex={finished ? undefined : 0}
                onClick={() => !finished && toggle(it.item_id)}
                onKeyDown={(e) => {
                  if (!finished && (e.key === ' ' || e.key === 'Enter')) {
                    e.preventDefault();
                    toggle(it.item_id);
                  }
                }}
                className={`flex gap-3 rounded-lg border p-3 ${
                  finished
                    ? 'border-gray-200 bg-gray-50'
                    : `cursor-pointer bg-white ${picked ? 'border-blue-300 bg-blue-50/60' : 'border-gray-200'}`
                }`}
              >
                <span className="pt-0.5">
                  {finished ? (
                    <Lock className="h-4 w-4 text-gray-400" />
                  ) : (
                    <input type="checkbox" readOnly tabIndex={-1} checked={picked} className="pointer-events-none" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                    <span className="tabular-nums">
                      Pair {it.item_id} · {names[it.batch_id] ?? it.batch_id}
                    </span>
                    <ItemStatus item={it} />
                  </div>
                  <div className={`mt-1 break-words font-monlam text-base leading-relaxed ${finished ? 'text-gray-500' : 'text-gray-900'}`}>
                    {it.evidence.a?.title_bo || '—'}
                  </div>
                  <div className="break-words font-monlam text-sm leading-relaxed text-gray-500">
                    {it.evidence.b?.title_bo || '—'}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        {!items.isLoading && rows.length === 0 && (
          <li className="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">No pairs here.</li>
        )}
      </ul>

      {/* Tablets and up */}
      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm sm:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all unfinished items"
                  className="cursor-pointer"
                  disabled={movable.length === 0}
                  checked={allMovableSelected}
                  onChange={() =>
                    setSelected(allMovableSelected ? new Set() : new Set(movable.map((it) => it.item_id)))
                  }
                />
              </th>
              <th className="px-3 py-3 font-medium">Pair</th>
              <th className="px-3 py-3 font-medium">Texts</th>
              <th className="hidden px-3 py-3 font-medium md:table-cell">Batch</th>
              <th className="px-3 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-8 animate-pulse rounded bg-gray-100" />
                  </td>
                </tr>
              ))}
            {rows.map((it) => {
              const finished = isFinished(it);
              return (
                <tr
                  key={it.item_id}
                  onClick={() => !finished && toggle(it.item_id)}
                  className={
                    finished
                      ? 'bg-gray-50 text-gray-400'
                      : `cursor-pointer hover:bg-gray-50 ${selected.has(it.item_id) ? 'bg-blue-50/60' : ''}`
                  }
                >
                  <td className="px-4 py-3">
                    {finished ? (
                      <span title="Answered: stays with this annotator" className="inline-flex text-gray-400">
                        <Lock className="h-4 w-4" />
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        aria-label={`Select pair ${it.item_id}`}
                        className="cursor-pointer"
                        checked={selected.has(it.item_id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggle(it.item_id)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-gray-500">{it.item_id}</td>
                  <td className="px-3 py-3">
                    <div className={`break-words font-monlam text-base leading-relaxed ${finished ? 'text-gray-500' : 'text-gray-900'}`}>
                      {it.evidence.a?.title_bo || '—'}
                    </div>
                    <div className={`break-words font-monlam text-sm leading-relaxed ${finished ? 'text-gray-400' : 'text-gray-500'}`}>
                      {it.evidence.b?.title_bo || '—'}
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-3 text-gray-600 md:table-cell" title={it.batch_id}>
                    {names[it.batch_id] ?? it.batch_id}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <ItemStatus item={it} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items.isLoading && rows.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-500">No pairs here.</p>
        )}
      </div>

      {n > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
            <span className="text-sm font-medium text-gray-900">
              {n} {itemsWord} selected
            </span>
            <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full min-w-0 cursor-pointer rounded-md border border-gray-300 bg-white px-2 py-2 text-sm sm:w-auto sm:max-w-xs"
                aria-label="Reassign to"
              >
                <option value="">Reassign to…</option>
                {targets.map((a) => (
                  <option key={a.user_id} value={a.user_id}>
                    {a.name || a.email} ({a.assigned - a.done} open)
                  </option>
                ))}
              </select>
              <Button
                className="cursor-pointer"
                disabled={!target}
                onClick={() => setPending({ kind: 'reassign', to: target })}
              >
                Reassign
              </Button>
              <span className="inline-flex items-center gap-1">
                <Button variant="outline" className="cursor-pointer" onClick={() => setPending({ kind: 'release' })}>
                  Unassign
                </Button>
                <InfoTip
                  text="Takes these pairs away from this person without choosing someone else. The next annotator who clicks “Assign me work” gets them."
                />
              </span>
              <Button variant="ghost" className="cursor-pointer" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={pending != null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === 'reassign'
                ? `Move ${n} ${itemsWord} to ${targetPerson?.name || targetPerson?.email}?`
                : `Unassign ${n} ${itemsWord}?`}
            </DialogTitle>
            <DialogDescription>
              {pending?.kind === 'reassign'
                ? `They move from ${person?.name || person?.email || 'this annotator'}'s list to ${targetPerson?.name || targetPerson?.email}'s To do list.`
                : `They leave ${person?.name || person?.email || 'this annotator'}'s list. The next annotator who clicks “Assign me work” gets them.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button className="cursor-pointer" onClick={confirm} disabled={reassign.isPending}>
              {reassign.isPending ? 'Saving…' : pending?.kind === 'reassign' ? 'Move' : 'Unassign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemStatus({ item }: Readonly<{ item: ReviewItem }>) {
  if (isDecided(item) || hasIssue(item)) {
    return (
      <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
        {item.verdict ? verdictLabel(item.verdict) : 'Issue flagged'}
      </span>
    );
  }
  if (item.assignment?.first_opened_at) {
    return <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">Opened</span>;
  }
  return <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">Not opened</span>;
}
