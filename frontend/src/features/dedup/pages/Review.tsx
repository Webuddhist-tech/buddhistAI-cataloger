import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Columns2, Flag, GitCompareArrows } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { DecisionInput } from '../api/review';
import CantAnswerDialog, { type CantAnswerStart } from '../components/CantAnswerDialog';
import FullTextDialog, { type FullTextView } from '../components/FullTextDialog';
import PreferredCopyDialog, { type PreferredChoice } from '../components/PreferredCopyDialog';
import WitnessPanel from '../components/WitnessPanel';
import { useActiveTimer } from '../hooks/useActiveTimer';
import { useBatchName, useItem, useMyItems, useSaveDecision } from '../hooks/useReview';
import { hasIssue, isDecided, overlapNote, pct, verdictLabel } from '../utils';

const CONFIDENCE = [1, 2, 3, 4, 5];
// The shared Button has no pointer cursor; added here to leave other features untouched.
const PTR = 'cursor-pointer';
const CHOSEN_NEUTRAL = 'border-gray-800 bg-gray-800 text-white hover:bg-gray-900 hover:text-white';

// Keys (plan §11): J same, F different, C contains / part-of, Space can't answer,
// X flag issue, 1-5 confidence, arrows move.
export default function Review() {
  const { itemId: itemIdParam } = useParams();
  const itemId = Number(itemIdParam);
  const navigate = useNavigate();
  const batchName = useBatchName();

  const itemQuery = useItem(itemId);
  const list = useMyItems('all');
  const loaded = useMemo(() => list.data ?? [], [list.data]);
  const total = loaded.length;
  const index = loaded.findIndex((i) => i.item_id === itemId);

  const prevId = index > 0 ? loaded[index - 1].item_id : null;
  const nextId = index >= 0 && index < loaded.length - 1 ? loaded[index + 1].item_id : null;
  const goTo = useCallback(
    (id: number | null) => {
      if (id != null) navigate(`/dedup/item/${id}`);
    },
    [navigate],
  );

  const item = itemQuery.data;
  const save = useSaveDecision();
  // Only for the pair's own annotator (an admin viewing it is not doing the work).
  const { commit: commitActiveTime } = useActiveTimer(
    item?.item_id,
    Boolean(item && loaded.some((i) => i.item_id === item.item_id)),
    Boolean(item && (isDecided(item) || hasIssue(item))),
  );
  const [confidence, setConfidence] = useState<number | null>(null);
  const [dialog, setDialog] = useState<CantAnswerStart | null>(null);
  const [fullText, setFullText] = useState<FullTextView | null>(null);
  const [askPreferred, setAskPreferred] = useState(false);
  const advanceTimer = useRef<number | undefined>(undefined);
  // The docked action bar wraps onto several rows on a phone; the page keeps its
  // height free so nothing is hidden behind it.
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);
  const hasItem = itemQuery.data != null;
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasItem]);

  useEffect(() => {
    setConfidence(item?.confidence ?? null);
  }, [item?.item_id, item?.confidence]);

  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  const submit = useCallback(
    async (fields: DecisionInput) => {
      if (!item) return;
      const body: DecisionInput = {
        // Only "same" carries a preferred copy; clear a stale one.
        ...(fields.verdict && fields.verdict !== 'same' ? { partner_payload: null } : {}),
        ...fields,
        // Confidence only means something alongside a verdict.
        ...(fields.verdict && confidence != null ? { confidence } : {}),
      };
      commitActiveTime();
      try {
        await save.mutateAsync({ itemId: item.item_id, fields: body });
        advanceTimer.current = window.setTimeout(() => goTo(nextId), 250);
      } catch (e) {
        toast.error(`Could not save: ${(e as Error).message}`);
        throw e;
      }
    },
    [item, confidence, save, goTo, nextId, commitActiveTime],
  );

  const decide = useCallback(
    (verdict: 'same' | 'different') => {
      if (verdict === 'same') {
        setAskPreferred(true);
        return;
      }
      submit({ verdict, status: 'finalized' }).catch(() => {});
    },
    [submit],
  );

  const saveSame = useCallback(
    (preferred: PreferredChoice) =>
      submit({ verdict: 'same', status: 'finalized', partner_payload: { preferred_mw_id: preferred } }),
    [submit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || fullText || askPreferred || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k === 'j') decide('same');
      else if (k === 'f') decide('different');
      else if (k === 'c') setDialog('contains');
      else if (k === 'x') setDialog('issue');
      else if (k === ' ') {
        e.preventDefault();
        setDialog('default');
      } else if (k >= '1' && k <= '5') setConfidence(Number(k));
      else if (k === 'arrowleft') goTo(prevId);
      else if (k === 'arrowright') goTo(nextId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, fullText, askPreferred, decide, goTo, prevId, nextId]);

  if (itemQuery.isLoading) {
    return <div className="py-24 text-center text-gray-500">Loading item…</div>;
  }
  if (itemQuery.error || !item) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load item {itemIdParam}: {itemQuery.error?.message ?? 'not found'}
        </div>
      </div>
    );
  }

  const ev = item.evidence;
  const m = ev.metrics ?? {};
  const cardA = ev.a ?? { mw_id: item.subject.a_mw ?? '' };
  const cardB = ev.b ?? { mw_id: item.subject.b_mw ?? '' };
  const isChosen = (...v: string[]) => item.verdict != null && v.includes(item.verdict);
  const tick = (...v: string[]) => (isChosen(...v) ? <Check className="h-4 w-4" /> : null);
  // Same title, clearly different author: the author data cannot settle it.
  const authorConflict =
    m.title_lev != null && m.title_lev >= 0.95 && m.author_lev != null && m.author_lev < 0.5;
  // The saved "which copy" answer: undefined = never asked, null = no preference.
  const preferred = item.partner_payload?.preferred_mw_id as PreferredChoice | undefined;
  let preferredNote = '';
  if (item.verdict === 'same' && preferred !== undefined) {
    if (preferred === null) preferredNote = ' · no preference';
    else preferredNote = preferred === cardA.mw_id ? ' · A is better' : ' · B is better';
  }
  const recorded = item.verdict
    ? verdictLabel(item.verdict) + preferredNote
    : hasIssue(item)
      ? `Issue flagged: ${item.issues!.at(-1)!.kind}`
      : null;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6" style={{ paddingBottom: barHeight + 24 }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/dedup" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> My items
          <span className="ml-1 text-xs text-gray-400" title={item.batch_id}>· {batchName(item.batch_id)}</span>
        </Link>
        <div className="flex items-center gap-2">
          {index >= 0 && (
            <span className="mr-1 text-xs tabular-nums text-gray-500">
              Item {index + 1} of {total}
            </span>
          )}
          <Button variant="outline" size="sm" className={PTR} onClick={() => goTo(prevId)} disabled={prevId == null} aria-label="Previous item">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Previous</span>
          </Button>
          <Button variant="outline" size="sm" className={PTR} onClick={() => goTo(nextId)} disabled={nextId == null} aria-label="Next item">
            <span className="hidden sm:inline">Next</span> <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {m.jaccard != null ? (
          <div className="inline-flex min-w-0 items-center gap-3 rounded-md border border-gray-200 border-l-4 border-l-gray-800 bg-white px-4 py-2 shadow-sm">
            <span className="text-2xl font-semibold tabular-nums text-gray-900">{pct(m.jaccard)}</span>
            <span className="leading-tight">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                shared wording
              </span>
              <span className="block text-sm text-gray-800">{overlapNote(m.jaccard)}</span>
            </span>
          </div>
        ) : (
          <span />
        )}
          <div className="flex w-full overflow-hidden rounded-md border border-violet-200 bg-violet-50 shadow-sm sm:inline-flex sm:w-auto">
          <button
            onClick={() => setFullText('side')}
            className={`${PTR} inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap px-3.5 py-2 text-sm font-medium text-violet-800 transition-colors hover:bg-violet-100 sm:flex-none`}
          >
            <Columns2 className="h-4 w-4 shrink-0" /> <span className="sm:hidden">Full texts</span>
            <span className="hidden sm:inline">Compare full texts</span>
          </button>
          <span className="w-px bg-violet-200" />
          <button
            onClick={() => setFullText('diff')}
            className={`${PTR} inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap px-3.5 py-2 text-sm font-medium text-violet-800 transition-colors hover:bg-violet-100 sm:flex-none`}
          >
            <GitCompareArrows className="h-4 w-4 shrink-0" /> <span className="sm:hidden">Differences</span>
            <span className="hidden sm:inline">Show differences</span>
          </button>
        </div>
      </div>

      {authorConflict && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <strong>These two share a title but list different authors.</strong> The author data cannot
          settle this, so if the texts look the same, flag it as an issue rather than guessing.
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WitnessPanel tag="A" card={cardA} />
        <WitnessPanel tag="B" card={cardB} />
      </div>

      {/* Collapsed by default: the scores anchor reviewers toward agreeing with the machine. */}
      <details className="mt-4 rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm text-gray-600 hover:text-gray-900">
          Show similarity details
        </summary>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-gray-200 px-4 py-4 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-5">
          <Metric k="Shared wording" v={pct(m.jaccard)} note="Jaccard" />
          <Metric k="Containment" v={pct(m.containment)} note="how much of the shorter is in the longer" />
          <Metric k="Opening similarity" v={pct(m.head_sim)} />
          <Metric k="Ending similarity" v={pct(m.tail_sim)} />
          <Metric k="Title match" v={pct(m.title_lev)} />
          <Metric k="Author match" v={pct(m.author_lev)} note={m.author_lev == null ? 'no author data' : undefined} />
          <Metric k="Length ratio" v={m.len_ratio != null ? m.len_ratio.toFixed(2) : '—'} note="1.00 = same length" />
          <Metric k="Same scan" v={m.same_rep == null ? '—' : m.same_rep ? 'yes' : 'no'} note="both from one reproduction" />
          {ev.why && (
            <div className="col-span-full break-all border-t border-gray-100 pt-3 font-mono text-xs text-gray-400">
              {ev.why}
            </div>
          )}
        </div>
      </details>

      <div
        ref={barRef}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur"
      >
        <div className="mx-auto grid max-w-7xl grid-cols-2 items-center gap-2 px-4 py-3 sm:flex sm:flex-wrap sm:px-6 lg:px-8">
          <Button
            variant="outline"
            className={`${PTR} ${
              isChosen('same')
                ? 'border-green-600 bg-green-600 text-white hover:bg-green-700 hover:text-white'
                : 'border-green-300 text-green-700 hover:bg-green-50'
            }`}
            onClick={() => decide('same')}
            disabled={save.isPending}
            aria-pressed={isChosen('same')}
          >
            {tick('same')} Same work <Kbd>J</Kbd>
          </Button>
          <Button
            variant="outline"
            className={`${PTR} ${
              isChosen('different')
                ? 'border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white'
                : 'border-red-300 text-red-700 hover:bg-red-50'
            }`}
            onClick={() => decide('different')}
            disabled={save.isPending}
            aria-pressed={isChosen('different')}
          >
            {tick('different')} Different <Kbd>F</Kbd>
          </Button>
          <Button
            variant="outline"
            className={`${PTR} ${isChosen('contains', 'part_of') ? CHOSEN_NEUTRAL : ''}`}
            onClick={() => setDialog('contains')}
            disabled={save.isPending}
            aria-pressed={isChosen('contains', 'part_of')}
          >
            {tick('contains', 'part_of')} Contains / part-of <Kbd>C</Kbd>
          </Button>
          <Button
            variant="outline"
            className={`${PTR} ${isChosen('not_sure') ? CHOSEN_NEUTRAL : ''}`}
            onClick={() => setDialog('default')}
            disabled={save.isPending}
            aria-pressed={isChosen('not_sure')}
          >
            {tick('not_sure')} Can&rsquo;t answer <Kbd>Space</Kbd>
          </Button>
          <Button variant="ghost" className={`${PTR} col-span-2 sm:col-span-1`} onClick={() => setDialog('issue')} disabled={save.isPending}>
            <Flag className="h-4 w-4" /> Flag issue <Kbd>X</Kbd>
          </Button>

          <div className="col-span-2 flex items-center justify-center gap-1 sm:ml-2 sm:justify-start">
            <span className="mr-1 text-[11px] uppercase tracking-wide text-gray-500">Confidence</span>
            {CONFIDENCE.map((n) => (
              <button
                key={n}
                onClick={() => setConfidence(confidence === n ? null : n)}
                className={`h-8 w-8 cursor-pointer rounded border text-sm tabular-nums sm:h-7 sm:w-7 ${
                  confidence === n
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-300 text-gray-600 hover:border-gray-500'
                }`}
                title={`Confidence ${n} of 5`}
              >
                {n}
              </button>
            ))}
          </div>

          <span className="col-span-2 text-center text-sm empty:hidden sm:ml-auto sm:text-right">
            {save.isPending && <span className="text-gray-400">Saving…</span>}
            {!save.isPending && recorded && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                <Check className="h-3.5 w-3.5" /> Saved: {recorded}
              </span>
            )}
          </span>
        </div>
      </div>

      {fullText && (
        <FullTextDialog a={cardA} b={cardB} view={fullText} onViewChange={setFullText} onClose={() => setFullText(null)} />
      )}

      <PreferredCopyDialog
        open={askPreferred}
        onOpenChange={setAskPreferred}
        a={cardA}
        b={cardB}
        current={item.verdict === 'same' ? preferred : undefined}
        onPick={saveSame}
      />

      <CantAnswerDialog
        open={dialog != null}
        onOpenChange={(o) => !o && setDialog(null)}
        item={item}
        start={dialog ?? 'default'}
        onSubmit={submit}
      />
    </div>
  );
}

function Metric({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{k}</div>
      <div className={`text-sm tabular-nums ${v === '—' || v === 'not scored' ? 'text-gray-400' : 'text-gray-900'}`}>
        {v}
      </div>
      {note && <div className="text-[11px] text-gray-400">{note}</div>}
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="ml-1 hidden rounded border border-current px-1 font-mono text-[10px] opacity-60 sm:inline">{children}</kbd>
  );
}
