// Cataloger /dedup routes. Decisions are saved there first and synced to BDRC's
// review API in the background, so the UI never calls BDRC directly.
import { API_URL } from '@/config/api';
import { fetchWithAccessToken } from '@/lib/fetchWithAccessToken';

const BASE = `${API_URL}/dedup`;

export interface ReviewBatch {
  batch_id: string;
  kind: string;
  n_items: number;
  notes: string | null;
  created_at: string | null;
  // BDRC's counts for the whole batch, by status string.
  status_counts: Record<string, number>;
  my_open: number;
  my_done: number;
}

export interface WitnessCard {
  mw_id: string;
  title_bo?: string | null;
  author_name_bo?: string | null;
  p_id?: string | null;
  wa_id?: string | null;
  rep_id?: string | null;
  volume_id?: string | null;
  edition_type?: string | null;
  etext_source?: string | null;
  text_length?: number | null;
  image_url?: string | null;
  head?: string | null;
  tail?: string | null;
  snippet_source?: string | null;
}

export interface PairMetrics {
  jaccard?: number | null;
  containment?: number | null;
  shared?: number | null;
  schemes?: string[] | null;
  head_sim?: number | null;
  tail_sim?: number | null;
  title_lev?: number | null;
  author_lev?: number | null;
  wa_match?: boolean | null;
  same_rep?: boolean | null;
  same_root?: boolean | null;
  len_ratio?: number | null;
}

export interface PairEvidence {
  schema_version?: string;
  why?: string;
  metrics?: PairMetrics;
  a?: WitnessCard;
  b?: WitnessCard;
}

export interface ReviewIssue {
  kind: string;
  mw_ids: string[];
  note?: string | null;
}

export interface ItemAssignment {
  assigned_at: string;
  first_opened_at: string | null;
  completed_at: string | null;
}

export interface ReviewItem {
  item_id: number;
  batch_id: string;
  kind: string;
  subject: { a_mw?: string; b_mw?: string } & Record<string, unknown>;
  evidence: PairEvidence;
  // 'new' until this user decides; then 'finalized' or 'flagged'.
  status: string;
  verdict: string | null;
  abstention_reason: string | null;
  confidence: number | null;
  issues: ReviewIssue[] | null;
  partner_payload: Record<string, unknown> | null;
  annotator_id: string | null;
  decided_at: string | null;
  // pending | running | succeeded | failed | superseded; null before any decision.
  sync_state: string | null;
  assignment: ItemAssignment | null;
}

export interface ClaimResult {
  // New items handed out by this call; 0 when the user still had unfinished ones.
  claimed: number;
  items: ReviewItem[];
}

export type MyItemsState = 'open' | 'done' | 'all';

// The backend fills in annotator_id and decided_at; fields left out keep their value.
export interface DecisionInput {
  verdict?: string | null;
  abstention_reason?: string | null;
  confidence?: number | null;
  issues?: ReviewIssue[] | null;
  partner_payload?: Record<string, unknown> | null;
  status?: 'finalized' | 'flagged';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('accept', 'application/json');
  if (init?.body) headers.set('content-type', 'application/json');
  const response = await fetchWithAccessToken(`${BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {
      // non-JSON error body
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export function fetchBatches(opts?: { signal?: AbortSignal }) {
  return request<ReviewBatch[]>('/batches', { signal: opts?.signal });
}

// Without a batch, the backend picks the oldest batch that still has work.
const batchPath = (batchId?: string) => (batchId ? `/batches/${encodeURIComponent(batchId)}` : '');

export function claimItems(batchId?: string) {
  return request<ClaimResult>(`${batchPath(batchId)}/claim`, { method: 'POST' });
}

export function fetchMyItems(state: MyItemsState, batchId?: string, opts?: { signal?: AbortSignal }) {
  return request<ReviewItem[]>(`${batchPath(batchId)}/my-items?state=${state}`, { signal: opts?.signal });
}

export function fetchItem(itemId: number, opts?: { signal?: AbortSignal }) {
  return request<ReviewItem>(`/items/${itemId}`, { signal: opts?.signal });
}

export function saveDecision(itemId: number, body: DecisionInput) {
  return request<ReviewItem>(`/items/${itemId}/decision`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// Full text and diff: read-only, passed through from BDRC.

export interface FullText {
  mw_id: string;
  title_bo: string | null;
  author_name_bo: string | null;
  rep_id: string | null;
  volume_id: string | null;
  image_url: string | null;
  etext_source: string | null;
  text_length: number | null;
  text_bo: string;
}

export type DiffGranularity = 'syllable' | 'char' | 'line';

// Compact chunks, led by an op: [0, text] same in both, [1, a, b] replaced,
// [2, text] only in A, [3, text] only in B.
export type DiffChunk = [0, string] | [1, string, string] | [2, string] | [3, string];

export interface TextDiff {
  a: { mw_id: string; title_bo: string | null; image_url: string | null };
  b: { mw_id: string; title_bo: string | null; image_url: string | null };
  granularity: DiffGranularity;
  // 0..1
  ratio: number;
  diff: DiffChunk[];
}

export function fetchText(mwId: string, opts?: { signal?: AbortSignal }) {
  return request<FullText>(`/texts/${encodeURIComponent(mwId)}`, { signal: opts?.signal });
}

export function fetchDiff(a: string, b: string, granularity: DiffGranularity = 'syllable', opts?: { signal?: AbortSignal }) {
  const q = new URLSearchParams({ a, b, granularity });
  return request<TextDiff>(`/diff?${q}`, { signal: opts?.signal });
}
