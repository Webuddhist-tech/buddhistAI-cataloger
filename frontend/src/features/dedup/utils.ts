import i18n from '@/i18n/config';
import type { ReviewItem } from './api/review';

// Labels below read the current language's `dedup.*` texts from the translation files
// (src/i18n/locales/<lang>/translation.json); anything untranslated shows in English.
const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

const TIBETAN_DIGITS = '༠༡༢༣༤༥༦༧༨༩';

/** A count for display: grouped digits ("136,011"), in Tibetan digits when the app is in Tibetan. */
export function formatNumber(n: number): string {
  const s = n.toLocaleString();
  return i18n.language?.startsWith('bo') ? s.replace(/\d/g, (d) => TIBETAN_DIGITS[Number(d)]) : s;
}

/** "First batch" … "Tenth batch", then "Batch 11". */
export function ordinalBatch(n: number): string {
  return n >= 1 && n <= 10 ? t(`dedup.batch.ordinal${n}`) : t('dedup.batch.numbered', { n });
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

/** same | different | contains | part_of | not_sure | source_dup, as a label. */
export function verdictLabel(verdict: string): string {
  return t(`dedup.verdict.${verdict}`, { defaultValue: verdict });
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
  if (j >= 0.8) return t('dedup.overlap.strong');
  if (j >= 0.5) return t('dedup.overlap.partial');
  return t('dedup.overlap.weak');
}

export function sourceLabel(etextSource: string | null | undefined): string | null {
  if (!etextSource) return null;
  return t(`dedup.source.${etextSource}`, { defaultValue: etextSource });
}

/** Why an annotator could not answer (verdict not_sure). */
export function abstentionLabel(reason: string): string {
  return t(`dedup.abstention.${reason}`, { defaultValue: reason });
}

/** How an adjudicator settled a disputed pair. */
export function resolutionLabel(resolution: string): string {
  return t(`dedup.resolution.${resolution}`, { defaultValue: resolution });
}

/** An answer as a short label: "Can't answer" for not_sure. */
export function answerLabel(verdict: string | null | undefined): string {
  if (!verdict) return '—';
  return verdict === 'not_sure' ? t('dedup.answer.cantAnswer') : verdictLabel(verdict);
}

// Answers grouped like the answer buttons: "Contains / part of" covers its dialog's
// three choices. `text`/`bar` are the group's colours as text and as a bar segment.
const ANSWER_GROUPS = [
  { id: 'same', keys: ['same'], badge: 'bg-green-50 text-green-700', text: 'text-green-700', bar: 'bg-green-500' },
  { id: 'different', keys: ['different'], badge: 'bg-red-50 text-red-700', text: 'text-red-700', bar: 'bg-red-500' },
  {
    id: 'contains',
    keys: ['contains', 'part_of', 'source_dup'],
    badge: 'bg-gray-100 text-gray-700',
    text: 'text-gray-600',
    bar: 'bg-gray-400',
  },
  { id: 'cantAnswer', keys: ['not_sure'], badge: 'bg-amber-50 text-amber-800', text: 'text-amber-700', bar: 'bg-amber-400' },
] as const;

const ANSWER_DETAIL: Record<string, string> = {
  contains: 'dedup.answer.detail.contains',
  part_of: 'dedup.answer.detail.part_of',
  source_dup: 'dedup.answer.detail.source_dup',
};

/** Per-group counts of a person's answers (pass `{}` for the labels alone), plus a hover
 * text with the exact split. */
export function answerGroups(answers: Record<string, number>) {
  return ANSWER_GROUPS.map((g) => ({
    ...g,
    label: t(`dedup.answerGroup.${g.id}`),
    n: g.keys.reduce((s, k) => s + (answers[k] ?? 0), 0),
    detail:
      g.keys.length > 1
        ? g.keys.map((k) => `${ANSWER_DETAIL[k] ? t(ANSWER_DETAIL[k]) : k}: ${answers[k] ?? 0}`).join(' · ')
        : undefined,
  }));
}

/** A reported data problem, as a label. */
export function issueLabel(kind: string): string {
  return t(`dedup.issue.${kind}`, { defaultValue: kind });
}

/** 75 -> "1 min 15 s". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const s = Math.round(seconds);
  if (s < 60) return t('dedup.duration.seconds', { s });
  const m = Math.floor(s / 60);
  if (m < 60) return t('dedup.duration.minutes', { m, s: s % 60 });
  return t('dedup.duration.hours', { h: Math.floor(m / 60), m: m % 60 });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
