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
