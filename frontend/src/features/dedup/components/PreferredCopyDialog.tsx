import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { WitnessCard } from '../api/review';
import { SourceBadge } from './SourceBadge';

// After "Same work": the plan's preferred access witness (§6.5, Screen 3). Not "which
// reads better", which can reward OCR clean-up. Saved as partner_payload.preferred_mw_id
// (null = no preference).

export type PreferredChoice = string | null;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  a: WitnessCard;
  b: WitnessCard;
  current?: PreferredChoice;
  onPick: (mwId: PreferredChoice) => Promise<void>;
};

export default function PreferredCopyDialog({ open, onOpenChange, a, b, current, onPick }: Readonly<Props>) {
  const [busy, setBusy] = useState(false);

  const pick = async (mwId: PreferredChoice) => {
    if (busy) return;
    setBusy(true);
    try {
      await onPick(mwId);
      onOpenChange(false);
    } catch {
      // The caller already reported the error; keep the dialog open to retry.
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'a') pick(a.mw_id);
      else if (k === 'b') pick(b.mw_id);
      else if (k === 'n') pick(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, a.mw_id, b.mw_id, busy]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Which copy is better?</DialogTitle>
          <DialogDescription>The more complete and faithful one.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CopyOption tag="A" card={a} selected={current === a.mw_id} disabled={busy} onClick={() => pick(a.mw_id)} />
          <CopyOption tag="B" card={b} selected={current === b.mw_id} disabled={busy} onClick={() => pick(b.mw_id)} />
        </div>

        <button
          onClick={() => pick(null)}
          disabled={busy}
          className={`flex w-full cursor-pointer items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors disabled:cursor-wait disabled:opacity-60 ${
            current === null ? 'border-gray-800 bg-gray-50' : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
          }`}
        >
          <span>
            <span className="block font-medium text-gray-900">No preference</span>
            <span className="block text-xs text-gray-500">Equally good, or can&rsquo;t tell.</span>
          </span>
          <Kbd>N</Kbd>
        </button>

        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyOption({
  tag,
  card,
  selected,
  disabled,
  onClick,
}: Readonly<{ tag: 'A' | 'B'; card: WitnessCard; selected: boolean; disabled: boolean; onClick: () => void }>) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg border p-4 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${
        selected ? 'border-gray-800 bg-gray-50' : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
      }`}
    >
      <span className="flex items-center justify-between">
        <span className="flex h-7 w-7 items-center justify-center rounded bg-gray-100 text-sm font-semibold text-gray-700">
          {tag}
        </span>
        <Kbd>{tag}</Kbd>
      </span>
      <span className="break-words font-monlam text-base leading-relaxed text-gray-900">
        {card.title_bo || <span className="font-sans text-sm italic text-gray-400">no title</span>}
      </span>
      <span className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <SourceBadge source={card.etext_source} />
        <span className="tabular-nums">{(card.text_length ?? 0).toLocaleString()} characters</span>
      </span>
    </button>
  );
}

function Kbd({ children }: Readonly<{ children: string }>) {
  return (
    <kbd className="hidden rounded border border-gray-300 px-1.5 font-mono text-[10px] text-gray-500 sm:inline">
      {children}
    </kbd>
  );
}
