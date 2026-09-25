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
