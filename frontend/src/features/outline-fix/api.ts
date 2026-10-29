// Cataloger /outline-fix routes: BDRC outline span issues, fixed one work at a time.
import { API_URL } from '@/config/api';
import { fetchWithAccessToken } from '@/lib/fetchWithAccessToken';

const BASE = `${API_URL}/outline-fix`;

export type WorkStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface IssueSegment {
  id: string;
  type?: string;
  part_type?: string;
  title?: string;
  span?: { volume?: number; start_page?: number; end_page?: number };
}

/** One entry of issue.json's `issues` array, as BDRC sends it. */
export interface OutlineIssue {
  error_type?: string;
  volume_id?: string;
  volume_number?: number;
  skip_reason?: string;
  skip_detail?: string;
  index?: number;
  left_2?: IssueSegment;
  left?: IssueSegment;
  issue?: IssueSegment;
  right?: IssueSegment;
  right_2?: IssueSegment;
}

/** The five values an annotator can change on a segment. */
export interface SpanValues {
  img_start: number | null;
  img_end: number | null;
  vol_start: number | null;
  vol_end: number | null;
  part_type: string | null;
}

export interface SegmentEdit extends SpanValues {
  rid: string;
}

export interface SavedEdit extends SegmentEdit {
  edited_by: string;
  updated_at: string;
}

export interface WorkSummary {
  id: string;
  w_id: string;
  batch_id: string;
  status: WorkStatus;
  issue_count: number;
  error_types: string[];
  edit_count: number;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_at: string | null;
  completed_at: string | null;
  note: string | null;
  imported_at: string;
}

export interface WorkDetail extends WorkSummary {
  outline_header: string[];
  outline_rows: string[][];
  issues: OutlineIssue[];
  edits: SavedEdit[];
}

export interface BatchProgress {
  batch_id: string;
  total: number;
  status_counts: Record<WorkStatus, number>;
  issue_count: number;
}

export interface ImportResult {
  batch_id: string;
  created: string[];
  skipped_existing: string[];
  ignored: string[];
  errors: string[];
}

export interface FixerUser {
  id: string;
  name: string | null;
  email: string;
}

export type FixerRole = 'annotator' | 'admin';

/** My Outline Fixer access and role (users.outline_fix_role). */
export interface FixerMe {
  access: boolean;
  role: FixerRole;
}

/** A Cataloger account on the Outline Fixer's Users page. */
export interface Member {
  id: string;
  name: string | null;
  email: string;
  picture: string | null;
  created_at: string | null;
  access: boolean;
  role: FixerRole;
}

export type MemberFilter = FixerRole | 'none';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithAccessToken(`${BASE}${path}`, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === 'string') detail = body.detail;
    } catch {
      /* not JSON */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const fetchMe = () => request<FixerMe>('/me');

// Annotator

export const claimWork = () =>
  request<{ work: WorkSummary | null; claimed: boolean }>('/claim', { method: 'POST' });
export const fetchMyWorks = () => request<WorkSummary[]>('/my-works');
export const fetchWork = (id: string) => request<WorkDetail>(`/works/${id}`);
export const saveEdits = (id: string, edits: SegmentEdit[]) =>
  request<void>(`/works/${id}/edits`, json('PUT', { edits }));
export const completeWork = (id: string) => request<void>(`/works/${id}/complete`, { method: 'POST' });
export const skipWork = (id: string, note: string) => request<void>(`/works/${id}/skip`, json('POST', { note }));

// Admin

export const fetchBatches = () => request<BatchProgress[]>('/admin/batches');
export const fetchAdminWorks = (params: { batch_id?: string; status?: WorkStatus }) => {
  const q = new URLSearchParams();
  if (params.batch_id) q.set('batch_id', params.batch_id);
  if (params.status) q.set('status', params.status);
  return request<WorkSummary[]>(`/admin/works?${q}`);
};
export const fetchFixerUsers = () => request<FixerUser[]>('/admin/annotators');
export const fetchMembers = (params: { q?: string; role?: MemberFilter; page: number; pageSize: number }) => {
  const q = new URLSearchParams({ page: String(params.page), page_size: String(params.pageSize) });
  if (params.q) q.set('q', params.q);
  if (params.role) q.set('role', params.role);
  return request<{ users: Member[]; has_next: boolean }>(`/admin/users?${q}`);
};
export const updateMember = (id: string, body: { access?: boolean; role?: FixerRole }) =>
  request<Member>(`/admin/users/${id}`, json('PATCH', body));
export const assignWork = (id: string, userId: string) =>
  request<void>(`/admin/works/${id}/assign`, json('POST', { user_id: userId }));
export const releaseWork = (id: string) => request<void>(`/admin/works/${id}/release`, { method: 'POST' });
export const reopenWork = (id: string) => request<void>(`/admin/works/${id}/reopen`, { method: 'POST' });

export function importBatch(batchId: string, files: File[]): Promise<ImportResult> {
  const form = new FormData();
  form.append('batch_id', batchId);
  files.forEach((f) => form.append('files', f, f.webkitRelativePath || f.name));
  return request<ImportResult>('/admin/import', { method: 'POST', body: form });
}

/** Download a file from an authenticated GET (fixed CSV or batch zip). */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const res = await fetchWithAccessToken(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const exportWorkCsv = (id: string, wId: string) =>
  downloadFile(`/works/${id}/export`, `${wId}_outline.csv`);
export const exportBatchZip = (batchId: string | undefined, includeSkipped: boolean) => {
  const q = new URLSearchParams();
  if (batchId) q.set('batch_id', batchId);
  if (includeSkipped) q.set('include_skipped', 'true');
  return downloadFile(`/admin/export?${q}`, 'outline-fix.zip');
};
