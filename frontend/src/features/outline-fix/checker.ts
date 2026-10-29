/**
 * Re-check outline issues against the current span values.
 *
 * Port of issue-checker.js from the original BDRC outline fixer (itself a port of
 * issue_checker.py), so a work shows the same ✔ / ✖ here as it would there.
 */
import type { OutlineIssue, SpanValues } from './api';

export type CheckStatus = 'resolved' | 'unresolved' | 'unknown';

export interface CheckResult {
  status: CheckStatus;
  detail: string;
}

const RANGE_DETAIL_RE =
  /^(?<a>\S+)\.start_page\s*\((?<a_start>\d+)\)\s*<\s*(?<b>\S+)\.end_page\s*\((?<b_end>\d+)\)\s*$/;
const MISSING_END_DETAIL_RE = /^segment\(s\)\s+(?<ids>.+)$/;
const CONTAINER_PART_TYPES = new Set(['S', 'V']);

export const toRid = (id: string | null | undefined): string => {
  const s = (id ?? '').trim();
  if (!s) return '';
  return s.startsWith('bdr:') ? s : `bdr:${s}`;
};
export const stripBdr = (rid: string | null | undefined): string => (rid ?? '').replace(/^bdr:/, '');

const isContainer = (s: SpanValues) => CONTAINER_PART_TYPES.has((s.part_type ?? '').toUpperCase());
const volumeOf = (s: SpanValues) => s.vol_start ?? s.vol_end;

/** Check one issue. `values` is keyed by RID with the bdr: prefix. */
export function checkIssue(issue: OutlineIssue, values: Map<string, SpanValues>): CheckResult {
  if (issue.skip_reason === 'range') return checkRange(issue, values);
  if (issue.skip_reason === 'missing_end_page') return checkMissingEnd(issue, values);
  return { status: 'unknown', detail: `No re-check rule for skip_reason=${JSON.stringify(issue.skip_reason)}` };
}

function rangeIds(issue: OutlineIssue): [string, string] {
  const m = RANGE_DETAIL_RE.exec((issue.skip_detail ?? '').trim());
  if (m?.groups) return [m.groups.a, m.groups.b];
  return [issue.issue?.id ?? '', issue.left?.id ?? ''];
}

function checkRange(issue: OutlineIssue, values: Map<string, SpanValues>): CheckResult {
  const [aId, bId] = rangeIds(issue);
  if (!aId || !bId) return { status: 'unknown', detail: 'Cannot identify the two segments to compare' };
  const a = values.get(toRid(aId));
  const b = values.get(toRid(bId));
  if (!a || !b) return { status: 'unknown', detail: `${a ? bId : aId} not found in outline.csv` };

  for (const [id, s] of [[aId, a], [bId, b]] as const) {
    if (isContainer(s)) return { status: 'resolved', detail: `${stripBdr(id)} is now a container type (${s.part_type})` };
  }
  const aVol = volumeOf(a);
  const bVol = volumeOf(b);
  if (aVol != null && bVol != null && aVol !== bVol) {
    return { status: 'resolved', detail: `${aId} (vol ${aVol}) and ${bId} (vol ${bVol}) are in different volumes` };
  }
  if (a.img_start == null) return { status: 'unknown', detail: `${aId} has no img start` };
  if (b.img_end == null) return { status: 'unknown', detail: `${bId} has no img end` };
  if (a.img_start < b.img_end) {
    return { status: 'unresolved', detail: `${aId}.start_page (${a.img_start}) < ${bId}.end_page (${b.img_end})` };
  }
  return { status: 'resolved', detail: `${aId}.start_page (${a.img_start}) >= ${bId}.end_page (${b.img_end})` };
}

function missingEndIds(issue: OutlineIssue): string[] {
  const m = MISSING_END_DETAIL_RE.exec((issue.skip_detail ?? '').trim());
  if (m?.groups) return m.groups.ids.split(',').map((p) => p.trim()).filter(Boolean);
  return issue.issue?.id ? [issue.issue.id] : [];
}

function checkMissingEnd(issue: OutlineIssue, values: Map<string, SpanValues>): CheckResult {
  const ids = missingEndIds(issue);
  const stillMissing: string[] = [];
  const inverted: string[] = [];
  for (const id of ids) {
    const s = values.get(toRid(id));
    if (!s) return { status: 'unknown', detail: `${id} not found in outline.csv` };
    if (isContainer(s)) continue;
    if (s.img_end == null) stillMissing.push(id);
    else if (s.img_start != null && s.img_end < s.img_start) inverted.push(id);
  }
  if (stillMissing.length) return { status: 'unresolved', detail: `Still missing img end: ${stillMissing.join(', ')}` };
  if (inverted.length) return { status: 'unresolved', detail: `img end < img start: ${inverted.join(', ')}` };
  return { status: 'resolved', detail: `End page set for ${ids.join(', ')}` };
}

/** Every RID an issue is about, for highlighting: the checked pair or the listed ids. */
export function issueRids(issue: OutlineIssue): string[] {
  if (issue.skip_reason === 'missing_end_page') return missingEndIds(issue).map(toRid);
  return rangeIds(issue).filter(Boolean).map(toRid);
}
