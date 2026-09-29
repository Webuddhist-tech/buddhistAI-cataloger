import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
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
import type { DecisionInput, ReviewIssue, ReviewItem } from '../api/review';
import { ISSUE_LABEL, hasIssue, verdictLabel } from '../utils';

// Values from the review plan (§5 decision / issue, §10 abstention reasons):
//   answer -> a verdict about the pair ("not_sure" + an abstention_reason for "can't answer")
//   issue  -> a data problem reported alongside the verdict, never instead of it
type Answer = { key: string; label: string; help: string; fields: DecisionInput };
type IssueOption = { kind: string; help: string; needsNote?: boolean };

export type CantAnswerStart = 'default' | 'contains' | 'issue';

// C = contains/part-of, Space = can't answer (plan §11 Screen 1). Both can also carry a
// data problem; X adds one to an answer already saved.
const ANSWER_GROUPS: { mode: CantAnswerStart; title: string; description: string; answers: Answer[] }[] = [
  {
    mode: 'contains',
    title: 'Contains / part-of',
    description: 'One text is inside the other, or both are the same source entered twice.',
    answers: [
      {
        key: 'a_contains_b',
        label: 'A contains B',
        help: 'B is an excerpt or chapter of A.',
        fields: { verdict: 'contains' },
      },
      {
        key: 'b_contains_a',
        label: 'B contains A',
        help: 'A is an excerpt or chapter of B.',
        fields: { verdict: 'part_of' },
      },
      {
        key: 'source_dup_verdict',
        label: 'Same source entered twice',
        help: 'Both come from the same scan or volume: a duplicate entry, not a separate edition.',
        fields: { verdict: 'source_dup' },
      },
    ],
  },
  {
    mode: 'default',
    title: "Can't answer",
    description: 'Pick the reason you cannot decide this pair.',
    answers: [
      {
        key: 'insufficient_evidence',
        label: "Can't tell from what's shown",
        help: 'Not enough to judge, even with the full texts.',
        fields: { verdict: 'not_sure', abstention_reason: 'insufficient_evidence' },
      },
      {
        key: 'genuinely_ambiguous',
        label: 'Genuinely ambiguous',
        help: 'I read both and still cannot say.',
        fields: { verdict: 'not_sure', abstention_reason: 'genuinely_ambiguous' },
      },
      {
        key: 'needs_image_or_metadata',
        label: 'Need the scans or catalogue details',
        help: 'Deciding would need the page images or more information than is shown.',
        fields: { verdict: 'not_sure', abstention_reason: 'needs_image_or_metadata' },
      },
      {
        key: 'technical_failure',
        label: 'Text is garbled or unreadable',
        help: 'OCR noise, empty text, or broken encoding.',
        fields: { verdict: 'not_sure', abstention_reason: 'technical_failure' },
      },
      {
        key: 'out_of_scope',
        label: 'Outside this review',
        help: 'This pair is not something this review can decide.',
        fields: { verdict: 'not_sure', abstention_reason: 'out_of_scope' },
      },
    ],
  },
];

const ISSUES: IssueOption[] = [
  { kind: 'author_conflict', help: 'Same text, but the two list different authors.' },
  { kind: 'wrong_author', help: 'The listed author is simply incorrect.' },
  { kind: 'undersegmented', help: 'This document should have been split.' },
  { kind: 'oversegmented', help: 'These are fragments of a single work.' },
  { kind: 'convention', help: 'The same work, but the two are split by different segmentation conventions.' },
  { kind: 'anthology_suspected', help: 'A text seems to contain many unrelated works.' },
  { kind: 'source_dup', help: 'A block of text is copied twice within one document (an import error).' },
  { kind: 'other', help: 'Describe it in the note.', needsNote: true },
];

type Which = 'both' | 'a' | 'b';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ReviewItem;
  start: CantAnswerStart;
  onSubmit: (fields: DecisionInput) => Promise<void>;
}

export default function CantAnswerDialog({ open, onOpenChange, item, start, onSubmit }: Props) {
  const group = start === 'issue' ? null : (ANSWER_GROUPS.find((g) => g.mode === start) ?? ANSWER_GROUPS[1]);
  const initialAnswer = group?.answers[0].key ?? '';
  const [answerKey, setAnswerKey] = useState(initialAnswer);
  // In the answer dialogs the data problem is optional and starts collapsed.
  const [reporting, setReporting] = useState(start === 'issue');
  const [issueKind, setIssueKind] = useState(ISSUES[0].kind);
  const [which, setWhich] = useState<Which>('both');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAnswerKey(initialAnswer);
      setReporting(start === 'issue');
      setIssueKind(ISSUES[0].kind);
      setWhich('both');
      setNote('');
    }
  }, [open, initialAnswer, start]);

  const answer = group?.answers.find((a) => a.key === answerKey) ?? group?.answers[0];
  const issue = ISSUES.find((i) => i.kind === issueKind) ?? ISSUES[0];
  const noteMissing = reporting && Boolean(issue.needsNote) && !note.trim();

  const newIssue = (): ReviewIssue => {
    const { a_mw, b_mw } = item.subject;
    let ids = [a_mw, b_mw];
    if (which === 'a') ids = [a_mw];
    else if (which === 'b') ids = [b_mw];
    return { kind: issueKind, mw_ids: ids.filter((x): x is string => Boolean(x)), note: note.trim() || null };
  };

  const submit = async () => {
    setBusy(true);
    try {
      const issues = reporting ? { issues: [...(item.issues ?? []), newIssue()] } : {};
      // Without an answer group this only adds the problem; the saved verdict stays.
      await onSubmit(answer ? { ...answer.fields, ...issues } : issues);
      onOpenChange(false);
    } catch {
      // The caller already reported the error; keep the dialog open to retry.
    } finally {
      setBusy(false);
    }
  };

  const issueForm = (
    <div className="space-y-3">
      {group && (
        <label className="block text-sm">
          <span className="mb-1 block text-gray-600">Problem</span>
          <select
            value={issueKind}
            onChange={(e) => setIssueKind(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            {ISSUES.map((i) => (
              <option key={i.kind} value={i.kind}>
                {ISSUE_LABEL[i.kind]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-gray-500">{issue.help}</span>
        </label>
      )}
      <label className="block text-sm">
        <span className="mb-1 block text-gray-600">Which text?</span>
        <select
          value={which}
          onChange={(e) => setWhich(e.target.value as Which)}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="both">Both</option>
          <option value="a">A only</option>
          <option value="b">B only</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-gray-600">{issue.needsNote ? 'Note (required)' : 'Note (optional)'}</span>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </label>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{group ? group.title : 'Report a data problem'}</DialogTitle>
          <DialogDescription>{group ? group.description : issueDescription(item)}</DialogDescription>
        </DialogHeader>

        {group ? (
          <>
            <RadioList
              label={group.title}
              options={group.answers.map((a) => ({ value: a.key, label: a.label, help: a.help }))}
              value={answerKey}
              onChange={setAnswerKey}
            />
            <div className="rounded-md border border-gray-200">
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setReporting((r) => !r)}
                aria-expanded={reporting}
              >
                {reporting ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Also report a data problem <span className="text-gray-400">(optional)</span>
              </button>
              {reporting && <div className="border-t border-gray-200 p-3">{issueForm}</div>}
            </div>
          </>
        ) : (
          <>
            {hasIssue(item) && (
              <p className="text-xs text-gray-500">
                Already reported: {item.issues!.map((i) => ISSUE_LABEL[i.kind] ?? i.kind).join(', ')}
              </p>
            )}
            <RadioList
              label="Data problem"
              options={ISSUES.map((i) => ({ value: i.kind, label: ISSUE_LABEL[i.kind], help: i.help }))}
              value={issueKind}
              onChange={setIssueKind}
            />
            {issueForm}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="cursor-pointer" onClick={submit} disabled={busy || noteMissing}>
            {busy ? 'Saving…' : group ? 'Save' : 'Report problem'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function issueDescription(item: ReviewItem): string {
  const answer = item.verdict ? ` (${verdictLabel(item.verdict)})` : '';
  return `Added to your answer${answer}, which stays as it is. Reported for fixing later.`;
}

function RadioList({
  label,
  options,
  value,
  onChange,
}: Readonly<{
  label: string;
  options: { value: string; label: string; help: string }[];
  value: string;
  onChange: (v: string) => void;
}>) {
  return (
    <div role="radiogroup" aria-label={label}>
      <fieldset className="space-y-0.5">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 ${
              value === o.value ? 'border-gray-300 bg-gray-50' : 'border-transparent hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name={label}
              className="mt-1 cursor-pointer"
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-900">{o.label}</span>
              <span className="block text-xs text-gray-500">{o.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
