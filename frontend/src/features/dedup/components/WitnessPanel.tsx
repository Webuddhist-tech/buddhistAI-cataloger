import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { WitnessCard } from '../api/review';
import { useFullText } from '../hooks/useReview';
import { WitnessMeta } from './SourceBadge';

// The item only carries `head` / `tail` (~220 characters each); the full text is
// fetched when asked for.
export default function WitnessPanel({ tag, card }: Readonly<{ tag: 'A' | 'B'; card: WitnessCard }>) {
  const [expanded, setExpanded] = useState(false);
  const full = useFullText(card.mw_id, expanded);
  const head = card.head ?? '';
  const tail = card.tail ?? '';
  const length = card.text_length ?? 0;
  const unseen = Math.max(0, length - head.length - tail.length);

  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
      <header className="border-b border-gray-200 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gray-100 text-sm font-semibold text-gray-600">
            {tag}
          </span>
          <div className="min-w-0">
            <h2 className="break-words font-monlam text-lg leading-relaxed text-gray-900 sm:text-xl">
              {card.title_bo || <span className="font-sans text-sm italic text-gray-400">no title</span>}
            </h2>
            {card.author_name_bo ? (
              <div className="font-monlam text-base text-gray-700">{card.author_name_bo}</div>
            ) : (
              <div className="text-sm italic text-gray-400">no author</div>
            )}
          </div>
        </div>
        <div className="mt-3">
          <WitnessMeta card={card} />
        </div>
      </header>

      {expanded ? (
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-gray-400">Full text</span>
            <ToggleButton onClick={() => setExpanded(false)}>
              <ChevronUp className="h-3.5 w-3.5" /> Show less
            </ToggleButton>
          </div>
          {full.isLoading && <div className="py-8 text-center text-sm text-gray-500">Loading full text…</div>}
          {full.error && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Full text not available.</strong> {full.error.message}
            </div>
          )}
          {full.data && (
            <div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap break-words pr-2 font-monlam text-lg leading-loose sm:text-xl text-gray-900">
              {full.data.text_bo}
            </div>
          )}
        </div>
      ) : (
        <div className="whitespace-pre-wrap break-words px-4 py-4 font-monlam text-lg leading-loose text-gray-900 sm:px-5 sm:py-5 sm:text-xl">
          <div className="mb-1 font-sans text-[11px] uppercase tracking-wide text-gray-400">Opening</div>
          {head || <span className="font-sans text-sm italic text-gray-400">no text returned</span>}

          {unseen > 0 && (
            <div className="my-4 flex items-center gap-3 font-sans">
              <span className="h-px flex-1 bg-gray-200" />
              <ToggleButton onClick={() => setExpanded(true)}>
                <ChevronDown className="h-3.5 w-3.5" /> Show full text
                <span className="hidden text-gray-400 sm:inline">· {unseen.toLocaleString()} more characters</span>
              </ToggleButton>
              <span className="h-px flex-1 bg-gray-200" />
            </div>
          )}

          {tail && (
            <>
              <div className="mb-1 font-sans text-[11px] uppercase tracking-wide text-gray-400">Ending</div>
              {tail}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ToggleButton({ onClick, children }: Readonly<{ onClick: () => void; children: React.ReactNode }>) {
  return (
    <button
      onClick={onClick}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 bg-white px-3 py-1 font-sans text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
    >
      {children}
    </button>
  );
}
