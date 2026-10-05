import type { ReactNode } from 'react';
import { Columns2, GitCompareArrows } from 'lucide-react';
import type { PairEvidence as Evidence, WitnessCard } from '../api/review';
import type { FullTextView } from './FullTextDialog';
import WitnessPanel from './WitnessPanel';
import { overlapNote, pct } from '../utils';

// The shared Button has no pointer cursor; added here to leave other features untouched.
const PTR = 'cursor-pointer';

// What a pair shows whoever looks at it: shared wording, the two texts, the scores.
// Used by the answer screens and the read-only shared page; `children` goes between the
// score strip and the texts (the adjudicator's "Annotator answers").
export default function PairEvidence({
  evidence: ev,
  cardA,
  cardB,
  onFullText,
  children,
}: Readonly<{
  evidence: Evidence;
  cardA: WitnessCard;
  cardB: WitnessCard;
  onFullText: (view: FullTextView) => void;
  children?: ReactNode;
}>) {
  const m = ev.metrics ?? {};
  // Same title, clearly different author: the author data cannot settle it.
  const authorConflict =
    m.title_lev != null && m.title_lev >= 0.95 && m.author_lev != null && m.author_lev < 0.5;
  return (
    <>
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
              onClick={() => onFullText('side')}
              className={`${PTR} inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap px-3.5 py-2 text-sm font-medium text-violet-800 transition-colors hover:bg-violet-100 sm:flex-none`}
            >
              <Columns2 className="h-4 w-4 shrink-0" /> <span className="sm:hidden">Full texts</span>
              <span className="hidden sm:inline">Compare full texts</span>
            </button>
            <span className="w-px bg-violet-200" />
            <button
              onClick={() => onFullText('diff')}
              className={`${PTR} inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap px-3.5 py-2 text-sm font-medium text-violet-800 transition-colors hover:bg-violet-100 sm:flex-none`}
            >
              <GitCompareArrows className="h-4 w-4 shrink-0" /> <span className="sm:hidden">Differences</span>
              <span className="hidden sm:inline">Show differences</span>
            </button>
          </div>
        </div>

        {children}

        {authorConflict && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <strong>These two share a title but list different authors.</strong> The author data cannot
            settle this: judge by the texts, then use &ldquo;Report a data problem&rdquo; to report
            &ldquo;Authors conflict&rdquo;.
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
            {/* BDRC ids, so a pair can be looked up in the source data. */}
            <div className="col-span-full grid grid-cols-1 gap-x-6 gap-y-2 border-t border-gray-100 pt-3 sm:grid-cols-2">
              {[
                ['Text A id', cardA.mw_id],
                ['Text B id', cardB.mw_id],
              ].map(([k, id]) => (
                <div key={k} className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">{k}</div>
                  <div className="select-all break-all font-mono text-xs text-gray-700">{id || '—'}</div>
                </div>
              ))}
            </div>
            {ev.why && (
              <div className="col-span-full break-all border-t border-gray-100 pt-3 font-mono text-xs text-gray-400">
                {ev.why}
              </div>
            )}
          </div>
        </details>
    </>
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
