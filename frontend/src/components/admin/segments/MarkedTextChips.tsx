import { useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DraftMark } from './markedSpans';

interface MarkedTextChipsProps {
  readonly text: string;
  readonly marks: DraftMark[];
  readonly onScrollTo: (start: number, end: number) => void;
  readonly onRemove: (start: number) => void;
  readonly onNoteChange: (start: number, note: string) => void;
  readonly onClearAll: () => void;
  /** Reviewer can split this segment now; adds the split instruction to the hint. */
  readonly canSplit?: boolean;
}

/** Longest chip label before truncating; keeps rows readable when marks are long. */
const CHIP_MAX_CHARS = 24;

/**
 * Slicing by code unit can cut between a consonant and its subjoined letter or
 * vowel sign, which renders as a broken glyph; cut at a tsek (syllable mark)
 * instead, unless that would leave the chip near-empty.
 */
const TSEK = '་';
function truncateLabel(label: string): string {
  if (label.length <= CHIP_MAX_CHARS) return label;
  const cut = label.slice(0, CHIP_MAX_CHARS);
  const lastTsek = cut.lastIndexOf(TSEK);
  const safe = lastTsek > CHIP_MAX_CHARS / 2 ? cut.slice(0, lastTsek + 1) : cut;
  return `${safe}…`;
}

/**
 * Marking happens by selecting in the body itself. The body text is left
 * unpainted (so it stays selectable and copyable), which makes these chips the
 * only place marks are shown — click one to jump to it, ✕ to remove it.
 */
export function MarkedTextChips({
  text,
  marks,
  onScrollTo,
  onRemove,
  onNoteChange,
  onClearAll,
  canSplit = false,
}: MarkedTextChipsProps) {
  const [noteOpenStart, setNoteOpenStart] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const prevCount = useRef(marks.length);

  /** Close a stale note editor if its mark was removed from under it. */
  useEffect(() => {
    if (noteOpenStart !== null && !marks.some((m) => m.start === noteOpenStart)) {
      setNoteOpenStart(null);
    }
    prevCount.current = marks.length;
  }, [marks, noteOpenStart]);

  if (marks.length === 0) {
    return (
      <p className="mt-2 text-xs text-gray-500">
        Select any incorrect text above to mark it for the annotator. Marked
        passages are listed here; the text itself stays selectable so you can copy it.
        {canSplit && (
          <>
            {' '}
            To start a new segment, double-click the first word of the new text and choose{' '}
            <span className="font-medium text-emerald-700">Split here</span>.
          </>
        )}
      </p>
    );
  }

  const commitNote = (start: number) => {
    onNoteChange(start, noteDraft.trim());
    setNoteOpenStart(null);
    setNoteDraft('');
  };

  return (
    <div className="mt-2 rounded-md border border-red-200 bg-red-50/60 px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-xs font-medium text-red-900">
          {marks.length} marked as incorrect
          <span className="ml-1.5 font-normal text-red-700/80">
            · saved when you reject this segment
          </span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onClearAll}
          className="h-6 shrink-0 text-xs text-red-800 hover:bg-red-100"
        >
          Clear all
        </Button>
      </div>

      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {marks.map((mark) => {
          const label = text.slice(mark.start, mark.end);
          const isOpen = noteOpenStart === mark.start;
          return (
            <li key={mark.start} className="flex max-w-full">
              {isOpen ? (
                <span className="flex min-w-0 items-center gap-1 rounded-full border border-red-300 bg-white px-1.5 py-0.5">
                  <Input
                    autoFocus
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onBlur={() => commitNote(mark.start)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitNote(mark.start);
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setNoteOpenStart(null);
                      }
                    }}
                    placeholder="Note (optional)"
                    className="h-6 w-40 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
                  />
                </span>
              ) : (
                /* py-1, not py-0.5: Tibetan vowel signs clip at the tighter padding. */
                <span className="flex min-w-0 items-center gap-0.5 rounded-full border border-red-300 bg-white pl-2 pr-0.5 py-1">
                  <button
                    type="button"
                    onClick={() => onScrollTo(mark.start, mark.end)}
                    title={`Select “${label}” in the text`}
                    className="min-w-0 truncate font-monlam text-xs leading-relaxed py-0.5 text-gray-800 hover:underline"
                  >
                    {truncateLabel(label)}
                  </button>
                  {mark.note ? (
                    <span
                      className="max-w-[10rem] shrink truncate text-xs text-gray-500"
                      title={mark.note}
                    >
                      — {mark.note}
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setNoteDraft(mark.note ?? '');
                      setNoteOpenStart(mark.start);
                    }}
                    title={mark.note ? 'Edit note' : 'Add a note for this mark'}
                    aria-label={mark.note ? 'Edit note' : 'Add note'}
                    className="h-5 w-5 shrink-0 p-0 text-gray-400 hover:text-gray-700"
                  >
                    <MessageSquarePlus className="h-3 w-3" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => onRemove(mark.start)}
                    title="Remove this mark"
                    aria-label={`Remove mark on “${label}”`}
                    className="h-5 w-5 shrink-0 p-0 text-gray-400 hover:text-red-600"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
