import type { FixerMe, FixerRole, WorkStatus } from './api';

type FixerUser = { permissions?: string[] | null } | null | undefined;

/** Mirrors backend/outline_fix/deps.py: the outline_fix permission. */
export function hasOutlineFixAccess(user: FixerUser): boolean {
  return user?.permissions?.includes('outline_fix') ?? false;
}

/** Import, assign, export and the Users page: access plus Outline Fixer role admin
 * (users.outline_fix_role), never the Outliner or Deduplicator role. */
export function isOutlineFixAdmin(me: FixerMe | null | undefined): boolean {
  return !!me?.access && me.role === 'admin';
}

export const ROLE_LABEL: Record<FixerRole, string> = {
  annotator: 'Annotator',
  admin: 'Admin',
};

export const STATUS_LABEL: Record<WorkStatus, string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  skipped: 'Skipped',
};

export const STATUS_STYLE: Record<WorkStatus, string> = {
  pending: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-amber-50 text-amber-800',
  completed: 'bg-green-50 text-green-700',
  skipped: 'bg-red-50 text-red-700',
};

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  // The API sends naive UTC timestamps.
  return new Date(iso.endsWith('Z') ? iso : `${iso}Z`).toLocaleString();
}
