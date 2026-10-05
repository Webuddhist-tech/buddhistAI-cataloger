import type { ReviewItem } from './api/review';

const ORDINAL = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

export function ordinalBatch(n: number): string {
  return ORDINAL[n - 1] ? `${ORDINAL[n - 1]} batch` : `Batch ${n}`;
}

/**
 * Batch ids restart their counter for every similarity band, so names follow the order
 * batches were added (created_at, then id), the same order work is handed out in.
 */
export function batchNames(batches: { batch_id: string; created_at: string | null }[]): Record<string, string> {
  const sorted = [...batches].sort(
    (a, b) =>
      (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.batch_id.localeCompare(b.batch_id),
  );
  return Object.fromEntries(sorted.map((b, i) => [b.batch_id, ordinalBatch(i + 1)]));
}

export const VERDICT_LABEL: Record<string, string> = {
  same: 'Same work',
  different: 'Different',
  contains: 'A contains B',
  part_of: 'B contains A',
  not_sure: 'Not sure',
  source_dup: 'Source duplicate',
};

export function verdictLabel(verdict: string): string {
  return VERDICT_LABEL[verdict] ?? verdict;
}

export function isDecided(item: Pick<ReviewItem, 'verdict'>): boolean {
  return Boolean(item.verdict);
}

export function hasIssue(item: Pick<ReviewItem, 'issues'>): boolean {
  return Array.isArray(item.issues) && item.issues.length > 0;
}

/**
 * Text as shown on screen, the same clean-up BDRC's API applies to full texts
 * (`normalize_text`): drop the `_` word-boundary markers some TEI sources carry, and
 * show runs of blank lines (OCR page breaks, empty scan areas) as at most one empty
 * line. Display only: the stored text is unchanged.
 */
export function displayText(text: string): string {
  return text.replace(/_/g, '').replace(/\n[ \t\u00a0]*(?:\n[ \t\u00a0]*)+\n/g, '\n\n');
}

export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

/** One-line reading of the jaccard for reviewers; the raw `evidence.why` stays in the details. */
export function overlapNote(j: number): string {
  if (j >= 0.8) return 'Strong overlap — likely the same work';
  if (j >= 0.5) return 'Partial overlap — needs your decision';
  return 'Weak overlap — read both carefully';
}

const SOURCE_LABEL: Record<string, string> = {
  tei: 'Typed transcription',
  paddleocr_v2: 'Scanned · OCR',
};

export function sourceLabel(etextSource: string | null | undefined): string | null {
  if (!etextSource) return null;
  return SOURCE_LABEL[etextSource] ?? etextSource;
}

export const ABSTENTION_LABEL: Record<string, string> = {
  insufficient_evidence: "Can't tell from what's shown",
  genuinely_ambiguous: 'Genuinely ambiguous',
  needs_image_or_metadata: 'Needs scans or catalogue details',
  technical_failure: 'Text garbled or unreadable',
  out_of_scope: 'Outside this review',
};

// How an adjudicator settled a disputed pair.
export const RESOLUTION_LABEL: Record<string, string> = {
  sided_with_1: 'Agreed with annotator 1',
  sided_with_2: 'Agreed with annotator 2',
  new_label: 'Chose a different answer',
  unresolved: 'Unresolved (also could not answer)',
};

/** An answer as a short label: "Can't answer" for not_sure. */
export function answerLabel(verdict: string | null | undefined): string {
  if (!verdict) return '—';
  return verdict === 'not_sure' ? "Can't answer" : verdictLabel(verdict);
}

// Answers grouped like the answer buttons: "Contains / part of" covers its dialog's
// three choices. `text`/`bar` are the group's colours as text and as a bar segment.
export const ANSWER_GROUPS = [
  { label: 'Same', keys: ['same'], badge: 'bg-green-50 text-green-700', text: 'text-green-700', bar: 'bg-green-500' },
  { label: 'Different', keys: ['different'], badge: 'bg-red-50 text-red-700', text: 'text-red-700', bar: 'bg-red-500' },
  {
    label: 'Contains / part of',
    keys: ['contains', 'part_of', 'source_dup'],
    badge: 'bg-gray-100 text-gray-700',
    text: 'text-gray-600',
    bar: 'bg-gray-400',
  },
  { label: "Can't answer", keys: ['not_sure'], badge: 'bg-amber-50 text-amber-800', text: 'text-amber-700', bar: 'bg-amber-400' },
] as const;

const ANSWER_DETAIL: Record<string, string> = {
  contains: 'A contains B',
  part_of: 'B contains A',
  source_dup: 'Same source entered twice',
};

/** Per-group counts of a person's answers, plus a hover text with the exact split. */
export function answerGroups(answers: Record<string, number>) {
  return ANSWER_GROUPS.map((g) => ({
    ...g,
    n: g.keys.reduce((s, k) => s + (answers[k] ?? 0), 0),
    detail: g.keys.length > 1 ? g.keys.map((k) => `${ANSWER_DETAIL[k] ?? k}: ${answers[k] ?? 0}`).join(' · ') : undefined,
  }));
}

export const ISSUE_LABEL: Record<string, string> = {
  author_conflict: 'Authors conflict',
  wrong_author: 'Author is wrong',
  undersegmented: 'One text holds several works',
  oversegmented: 'One work split across documents',
  convention: 'Divided at different places',
  anthology_suspected: 'Looks like an anthology',
  source_dup: 'Passage repeated inside a text',
  other: 'Other problem',
};

/** 75 -> "1 min 15 s". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
