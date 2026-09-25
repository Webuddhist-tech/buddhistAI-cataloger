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
import { Textarea } from '@/components/ui/textarea';
import type { DecisionInput, ReviewItem } from '../api/review';

// Values from the review plan (§5 decision / issue, §10 abstention reasons):
//   verdict -> a judgment about the pair
//   abstain -> verdict "not_sure" + an abstention_reason
//   issue   -> not a verdict: appended to issues[] to report broken upstream data
type Write =
  | { kind: 'verdict'; verdict: string }
  | { kind: 'abstain'; abstention_reason: string }
  | { kind: 'issue'; issueKind: string };

type Reason = { key: string; label: string; help: string; write: Write; needsNote?: boolean };

const GROUPS: { title: string; reasons: Reason[] }[] = [
  {
    title: 'Relationship',
    reasons: [
      {
        key: 'a_contains_b',
        label: 'A contains B',
        help: 'B is an excerpt or chapter of A.',
        write: { kind: 'verdict', verdict: 'contains' },
      },
      {
        key: 'b_contains_a',
        label: 'B contains A',
        help: 'A is an excerpt or chapter of B.',
        write: { kind: 'verdict', verdict: 'part_of' },
      },
      {
        key: 'source_dup_verdict',
        label: 'Same source entered twice',
        help: 'Both come from the same scan or volume: a duplicate entry, not a separate edition.',
        write: { kind: 'verdict', verdict: 'source_dup' },
      },
    ],
  },
  {
    title: "Can't answer",
    reasons: [
      {
        key: 'insufficient_evidence',
        label: "Can't tell from what's shown",
        help: 'Not enough to judge, even with the full texts.',
        write: { kind: 'abstain', abstention_reason: 'insufficient_evidence' },
      },
      {
        key: 'genuinely_ambiguous',
        label: 'Genuinely ambiguous',
        help: 'I read both and still cannot say.',
        write: { kind: 'abstain', abstention_reason: 'genuinely_ambiguous' },
      },
      {
        key: 'needs_image_or_metadata',
        label: 'Need the scans or catalogue details',
        help: 'Deciding would need the page images or more information than is shown.',
        write: { kind: 'abstain', abstention_reason: 'needs_image_or_metadata' },
      },
      {
        key: 'technical_failure',
        label: 'Text is garbled or unreadable',
        help: 'OCR noise, empty text, or broken encoding.',
        write: { kind: 'abstain', abstention_reason: 'technical_failure' },
      },
      {
        key: 'out_of_scope',
        label: 'Outside this review',
        help: 'This pair is not something this review can decide.',
        write: { kind: 'abstain', abstention_reason: 'out_of_scope' },
      },
    ],
  },
  {
    title: 'Report a data problem',
    reasons: [
      {
        key: 'author_conflict',
        label: 'Authors conflict',
        help: 'Same text, but the two list different authors.',
        write: { kind: 'issue', issueKind: 'author_conflict' },
      },
      {
        key: 'wrong_author',
        label: 'Author is wrong',
        help: 'The listed author is simply incorrect.',
        write: { kind: 'issue', issueKind: 'wrong_author' },
      },
      {
        key: 'undersegmented',
        label: 'One text holds several works',
        help: 'This document should have been split.',
        write: { kind: 'issue', issueKind: 'undersegmented' },
      },
      {
        key: 'oversegmented',
        label: 'One work split across documents',
        help: 'These are fragments of a single work.',
        write: { kind: 'issue', issueKind: 'oversegmented' },
      },
      {
        key: 'convention',
        label: 'Divided at different places',
        help: 'The same work, but the two are split by different segmentation conventions.',
        write: { kind: 'issue', issueKind: 'convention' },
      },
      {
        key: 'anthology_suspected',
        label: 'Looks like an anthology',
        help: 'A text seems to contain many unrelated works.',
        write: { kind: 'issue', issueKind: 'anthology_suspected' },
      },
      {
        key: 'source_dup_issue',
        label: 'Passage repeated inside a text',
        help: 'A block of text is copied twice within one document (an import error).',
        write: { kind: 'issue', issueKind: 'source_dup' },
      },
      {
        key: 'other',
        label: 'Other problem',
        help: 'Describe it in the note.',
        write: { kind: 'issue', issueKind: 'other' },
        needsNote: true,
      },
    ],
  },
];

const REASONS: Reason[] = GROUPS.flatMap((g) => g.reasons);

export type CantAnswerStart = 'default' | 'contains' | 'issue';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ReviewItem;
  start: CantAnswerStart;
  onSubmit: (fields: DecisionInput) => Promise<void>;
}

export default function CantAnswerDialog({ open, onOpenChange, item, start, onSubmit }: Props) {
  // C opens on "A contains B", X on the first data problem, Space on "can't answer".
  let initialKey = 'insufficient_evidence';
  if (start === 'contains') initialKey = 'a_contains_b';
  else if (start === 'issue') initialKey = 'author_conflict';
  const [reasonKey, setReasonKey] = useState(initialKey);
  const [which, setWhich] = useState<'both' | 'a' | 'b'>('both');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReasonKey(initialKey);
      setWhich('both');
      setNote('');
    }
  }, [open, initialKey]);

  const reason = REASONS.find((r) => r.key === reasonKey) ?? REASONS[0];
  const isIssue = reason.write.kind === 'issue';
  const noteMissing = Boolean(reason.needsNote) && !note.trim();

  const submit = async () => {
    setBusy(true);
    const { a_mw, b_mw } = item.subject;
    try {
      const w = reason.write;
      if (w.kind === 'issue') {
        const mwIds = (which === 'a' ? [a_mw] : which === 'b' ? [b_mw] : [a_mw, b_mw]).filter(
          (x): x is string => Boolean(x),
        );
        // Flagged, not finalized: BDRC leaves the pair undecided until the data is fixed.
        await onSubmit({
          issues: [...(item.issues ?? []), { kind: w.issueKind, mw_ids: mwIds, note: note.trim() || null }],
          status: 'flagged',
        });
      } else if (w.kind === 'abstain') {
        await onSubmit({ verdict: 'not_sure', abstention_reason: w.abstention_reason, status: 'finalized' });
      } else {
        await onSubmit({ verdict: w.verdict, status: 'finalized' });
      }
      onOpenChange(false);
    } catch {
      // The caller already reported the error; keep the dialog open to retry.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Not a clean same / different?</DialogTitle>
          <DialogDescription>Pick the closest answer. Data problems are reported, not decided.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4" role="radiogroup">
          {GROUPS.map((g) => (
            <fieldset key={g.title} className="space-y-0.5">
              <legend className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">{g.title}</legend>
              {g.reasons.map((r) => (
                <label
                  key={r.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 ${
                    reasonKey === r.key ? 'border-gray-300 bg-gray-50' : 'border-transparent hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    className="mt-1 cursor-pointer"
                    checked={reasonKey === r.key}
                    onChange={() => setReasonKey(r.key)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900">{r.label}</span>
                    <span className="block text-xs text-gray-500">{r.help}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>

        {isIssue && (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-gray-600">Which text?</span>
              <select
                value={which}
                onChange={(e) => setWhich(e.target.value as 'both' | 'a' | 'b')}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="both">Both</option>
                <option value="a">A only</option>
                <option value="b">B only</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-gray-600">{reason.needsNote ? 'Note (required)' : 'Note (optional)'}</span>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="cursor-pointer" onClick={submit} disabled={busy || noteMissing}>
            {busy ? 'Saving…' : isIssue ? 'Flag issue' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
