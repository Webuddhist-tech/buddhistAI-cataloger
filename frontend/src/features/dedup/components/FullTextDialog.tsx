import { useEffect, useMemo, useState } from 'react';
import { ChevronsUpDown, Columns2, Rows2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DiffGranularity, WitnessCard } from '../api/review';
import { buildDiffRows, foldRows, type DiffRow, type Piece } from '../diffRows';
import { useFullText, useTextDiff } from '../hooks/useReview';
import { SourceBadge, WitnessMeta } from './SourceBadge';

// Opens over the review page so Esc returns the reviewer to where they were. Full-text
// columns scroll independently: the copies rarely line up position for position.

export type FullTextView = 'side' | 'diff';

type Props = {
  a: WitnessCard;
  b: WitnessCard;
  view: FullTextView;
  onViewChange: (v: FullTextView) => void;
  onClose: () => void;
};

export default function FullTextDialog({ a, b, view, onViewChange, onClose }: Readonly<Props>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // Capture phase, so the review shortcuts underneath do not also fire.
    window.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex bg-gray-900/40 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Full texts">
      <div className="flex min-h-0 w-full flex-col overflow-hidden bg-white shadow-xl sm:rounded-xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="inline-flex rounded-md bg-gray-100 p-1" role="tablist">
            {(
              [
                ['side', 'Full texts'],
                ['diff', 'Differences'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={view === key}
                onClick={() => onViewChange(key)}
                className={`cursor-pointer rounded px-3 py-1 text-sm font-medium transition-colors ${
                  view === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {view === 'side' && (
            <span className="hidden text-xs text-gray-500 sm:inline">Each side scrolls on its own</span>
          )}
          <Button variant="outline" size="sm" className="ml-auto cursor-pointer" onClick={onClose}>
            <X className="h-4 w-4" /> Close <kbd className="ml-1 hidden rounded border px-1 font-mono text-[10px] opacity-60 sm:inline">Esc</kbd>
          </Button>
        </div>

        {view === 'side' ? (
          <SideBySide a={a} b={b} />
        ) : (
          <DiffView a={a} b={b} />
        )}
      </div>
    </div>
  );
}

// Below lg each text would only get half the sheet, so one is shown at a time.
function SideBySide({ a, b }: Readonly<{ a: WitnessCard; b: WitnessCard }>) {
  const [pane, setPane] = useState<'A' | 'B'>('A');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex border-b border-gray-200 lg:hidden" role="tablist">
        {(['A', 'B'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={pane === t}
            onClick={() => setPane(t)}
            className={`flex-1 cursor-pointer py-2 text-sm font-medium ${
              pane === t ? 'border-b-2 border-gray-900 text-gray-900' : 'text-gray-500'
            }`}
          >
            Text {t}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-gray-200">
        <TextPane tag="A" card={a} className={pane === 'A' ? 'flex' : 'hidden lg:flex'} />
        <TextPane tag="B" card={b} className={pane === 'B' ? 'flex' : 'hidden lg:flex'} />
      </div>
    </div>
  );
}

function PaneHeader({ tag, card }: Readonly<{ tag: 'A' | 'B'; card: WitnessCard }>) {
  return (
    <header className="border-b border-gray-200 bg-gray-50/60 px-4 py-3 sm:px-5">
      <div className="flex items-start gap-2.5">
        <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gray-200 text-sm font-semibold text-gray-700">
          {tag}
        </span>
        <div className="min-w-0">
          <div className="break-words font-monlam text-lg leading-relaxed text-gray-900 sm:text-xl">
            {card.title_bo || <span className="font-sans text-sm italic text-gray-400">no title</span>}
          </div>
          {card.author_name_bo && <div className="font-monlam text-base text-gray-700">{card.author_name_bo}</div>}
        </div>
      </div>
      <div className="mt-2">
        <WitnessMeta card={card} />
      </div>
    </header>
  );
}

function TextPane({ tag, card, className = 'flex' }: Readonly<{ tag: 'A' | 'B'; card: WitnessCard; className?: string }>) {
  const text = useFullText(card.mw_id);
  return (
    <section className={`${className} min-h-0 flex-col`}>
      <PaneHeader tag={tag} card={card} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {text.isLoading && <div className="py-12 text-center text-sm text-gray-500">Loading full text…</div>}
        {text.error && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Full text not available.</strong> {text.error.message}
          </div>
        )}
        {text.data && (
          <div className="whitespace-pre-wrap break-words font-monlam text-lg leading-loose text-gray-900 sm:text-xl">
            {text.data.text_bo}
          </div>
        )}
      </div>
    </section>
  );
}


type DiffLayout = 'split' | 'unified';

const GRANULARITIES: [DiffGranularity, string][] = [
  ['syllable', 'Syllable'],
  ['char', 'Character'],
  ['line', 'Line'],
];

function DiffView({ a, b }: Readonly<{ a: WitnessCard; b: WitnessCard }>) {
  const [granularity, setGranularity] = useState<DiffGranularity>('syllable');
  // Two columns are too narrow on a phone.
  const [layout, setLayout] = useState<DiffLayout>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'unified' : 'split',
  );
  const diff = useTextDiff(a.mw_id, b.mw_id, granularity);
  const rows = useMemo(() => buildDiffRows(diff.data?.diff ?? []), [diff.data]);
  const blocks = useMemo(() => foldRows(rows), [rows]);
  // Each side numbered on its own: a row only one copy has gets no number on the other.
  const nums = useMemo(() => numberRows(rows), [rows]);
  const changes = useMemo(() => (diff.data?.diff ?? []).filter((c) => c[0] !== 0).length, [diff.data]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm sm:px-4">
        <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5" role="radiogroup" aria-label="Layout">
          {(
            [
              ['split', 'Split', Columns2],
              ['unified', 'Unified', Rows2],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              role="radio"
              aria-checked={layout === key}
              onClick={() => setLayout(key)}
              title={key === 'split' ? 'A and B next to each other' : 'A and B in one column'}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors ${
                layout === key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {diff.data && (
          <span className="text-gray-600">
            <strong className="tabular-nums text-gray-900">{Math.round(diff.data.ratio * 100)}%</strong> the same ·{' '}
            <span className="tabular-nums">{changes.toLocaleString()}</span> {changes === 1 ? 'change' : 'changes'}
          </span>
        )}
        <label className="ml-auto inline-flex items-center gap-2 text-gray-600">
          Compare by
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as DiffGranularity)}
            className="cursor-pointer rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            {GRANULARITIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {layout === 'split' && (
        <div className="grid grid-cols-2 border-b border-gray-200 text-sm">
          <ColumnHead tag="A" card={a} tone="red" />
          <ColumnHead tag="B" card={b} tone="green" className="border-l border-gray-200" />
        </div>
      )}
      {layout === 'unified' && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-gray-200 px-4 py-2 text-sm">
          <ColumnHead tag="A" card={a} tone="red" bare />
          <ColumnHead tag="B" card={b} tone="green" bare />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {diff.isLoading && <div className="py-12 text-center text-sm text-gray-500">Comparing the two texts…</div>}
        {diff.error && (
          <div className="m-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Could not compare the texts.</strong> {diff.error.message}
          </div>
        )}
        {diff.data &&
          blocks.map((block) =>
            block.kind === 'fold' ? (
              <Fold key={`f${block.start}`} rows={block.rows} start={block.start} nums={nums} layout={layout} />
            ) : (
              block.rows.map((row, k) => (
                <Row key={block.start + k} row={row} num={nums[block.start + k]} layout={layout} />
              ))
            ),
          )}
      </div>
    </div>
  );
}

const TONE = {
  red: 'bg-red-100 text-red-800',
  green: 'bg-green-100 text-green-800',
};

function ColumnHead({
  tag,
  card,
  tone,
  className = '',
  bare = false,
}: Readonly<{ tag: string; card: WitnessCard; tone: keyof typeof TONE; className?: string; bare?: boolean }>) {
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 ${bare ? '' : 'px-3 py-2 sm:px-4'} ${className}`}>
      <span className={`rounded px-1.5 font-semibold ${TONE[tone]}`}>{tag}</span>
      <span className="truncate font-monlam text-base text-gray-800">{card.title_bo}</span>
      <SourceBadge source={card.etext_source} />
    </div>
  );
}

const TEXT = 'whitespace-pre-wrap break-words font-monlam text-base leading-loose sm:text-lg';
const LINE_NO = 'w-8 shrink-0 select-none px-1 pt-1.5 text-right font-sans text-xs tabular-nums text-gray-400 sm:w-12 sm:px-2';

function Pieces({ pieces, tone }: Readonly<{ pieces: Piece[]; tone: 'red' | 'green' }>) {
  const mark = tone === 'red' ? 'rounded-sm bg-red-200/80 text-red-950' : 'rounded-sm bg-green-200/80 text-green-950';
  return (
    <>
      {pieces.map((p, i) =>
        p.changed ? (
          <mark key={i} className={mark}>{p.text}</mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

type RowNum = { a: number | null; b: number | null };

function numberRows(rows: DiffRow[]): RowNum[] {
  let a = 0;
  let b = 0;
  return rows.map((r) => ({ a: r.a.length ? ++a : null, b: r.b.length ? ++b : null }));
}


function Side({ pieces, n, tone, changed, copy, className = '' }: Readonly<{
  pieces: Piece[];
  n: number | null;
  tone: 'red' | 'green';
  changed: boolean;
  copy: 'A' | 'B';
  className?: string;
}>) {
  const tint = tone === 'red' ? 'bg-red-50' : 'bg-green-50';
  if (n == null) return <div className={`bg-gray-50 ${className}`} aria-label={`Not in ${copy}`} />;
  return (
    <div className={`flex min-w-0 ${changed ? tint : ''} ${className}`}>
      <span className={LINE_NO}>{n}</span>
      <div className={`min-w-0 flex-1 py-1 pr-2 sm:pr-4 ${TEXT} text-gray-900`}>
        <Pieces pieces={pieces} tone={tone} />
      </div>
    </div>
  );
}

function Row({ row, num, layout }: Readonly<{ row: DiffRow; num: RowNum; layout: DiffLayout }>) {
  if (layout === 'split') {
    return (
      <div className="grid grid-cols-2 border-b border-gray-100">
        <Side pieces={row.a} n={num.a} tone="red" changed={row.changed} copy="A" />
        <Side pieces={row.b} n={num.b} tone="green" changed={row.changed} copy="B" className="border-l border-gray-200" />
      </div>
    );
  }
  // Unified: an unchanged row once; a changed row as A's version, then B's.
  if (!row.changed) {
    return (
      <div className="flex border-b border-gray-100">
        <span className={LINE_NO}>{num.a}</span>
        <span className="w-6 shrink-0" />
        <div className={`min-w-0 flex-1 py-1 pr-2 sm:pr-4 ${TEXT} text-gray-900`}>
          <Pieces pieces={row.a} tone="red" />
        </div>
      </div>
    );
  }
  return (
    <div className="border-b border-gray-100">
      {num.a != null && (
        <div className="flex bg-red-50">
          <span className={LINE_NO}>{num.a}</span>
          <span className="w-6 shrink-0 pt-1.5 text-center font-sans text-xs font-semibold text-red-700">A</span>
          <div className={`min-w-0 flex-1 py-1 pr-2 sm:pr-4 ${TEXT} text-gray-900`}>
            <Pieces pieces={row.a} tone="red" />
          </div>
        </div>
      )}
      {num.b != null && (
        <div className="flex bg-green-50">
          <span className={LINE_NO}>{num.b}</span>
          <span className="w-6 shrink-0 pt-1.5 text-center font-sans text-xs font-semibold text-green-700">B</span>
          <div className={`min-w-0 flex-1 py-1 pr-2 sm:pr-4 ${TEXT} text-gray-900`}>
            <Pieces pieces={row.b} tone="green" />
          </div>
        </div>
      )}
    </div>
  );
}

function Fold({ rows, start, nums, layout }: Readonly<{ rows: DiffRow[]; start: number; nums: RowNum[]; layout: DiffLayout }>) {
  const [open, setOpen] = useState(false);
  if (open) return <>{rows.map((row, k) => <Row key={start + k} row={row} num={nums[start + k]} layout={layout} />)}</>;
  return (
    <button
      onClick={() => setOpen(true)}
      className="flex w-full cursor-pointer items-center justify-center gap-2 border-b border-gray-200 bg-gray-50 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
    >
      <ChevronsUpDown className="h-3.5 w-3.5" />
      {rows.length.toLocaleString()} unchanged lines · Show
    </button>
  );
}
