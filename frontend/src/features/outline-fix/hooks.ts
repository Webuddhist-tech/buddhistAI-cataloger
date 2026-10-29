import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth0 } from '@auth0/auth0-react';
import {
  assignWork,
  claimWork,
  completeWork,
  fetchAdminWorks,
  fetchBatches,
  fetchFixerUsers,
  fetchMe,
  fetchMembers,
  fetchMyWorks,
  fetchWork,
  importBatch,
  releaseWork,
  reopenWork,
  saveEdits,
  skipWork,
  updateMember,
  type FixerRole,
  type MemberFilter,
  type SegmentEdit,
  type WorkStatus,
} from './api';

/** Root key for every Outline Fixer query; use with invalidateQueries. */
const root = ['outline-fix'] as const;

const keys = {
  myWorks: [...root, 'my-works'] as const,
  work: (id: string) => [...root, 'work', id] as const,
  batches: [...root, 'admin', 'batches'] as const,
  adminWorks: (batchId?: string, status?: WorkStatus) =>
    [...root, 'admin', 'works', batchId ?? '', status ?? ''] as const,
  users: [...root, 'admin', 'users'] as const,
  me: [...root, 'me'] as const,
  members: (q: string, role: string, page: number) => [...root, 'admin', 'members', q, role, page] as const,
};

/** My Outline Fixer access and role. Pass false to skip the request (e.g. no access). */
export function useFixerMe(enabled = true) {
  const { isAuthenticated } = useAuth0();
  return useQuery({ queryKey: keys.me, queryFn: fetchMe, enabled: enabled && isAuthenticated });
}

export const useMembers = (q: string, role: MemberFilter | undefined, page: number, pageSize: number) =>
  useQuery({
    queryKey: keys.members(q, role ?? '', page),
    queryFn: () => fetchMembers({ q: q || undefined, role, page, pageSize }),
    placeholderData: keepPreviousData,
  });

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; access?: boolean; role?: FixerRole }) => updateMember(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: root });
      // The shared user record (nav, Settings) carries the permissions.
      qc.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

export const useMyWorks = () => useQuery({ queryKey: keys.myWorks, queryFn: fetchMyWorks });

export const useWork = (id: string | undefined) =>
  useQuery({
    queryKey: keys.work(id ?? ''),
    queryFn: () => fetchWork(id!),
    enabled: !!id,
    // Edits live in the page until saved; a background refetch must not reset them.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

export const useBatches = () => useQuery({ queryKey: keys.batches, queryFn: fetchBatches });

export const useAdminWorks = (batchId?: string, status?: WorkStatus) =>
  useQuery({ queryKey: keys.adminWorks(batchId, status), queryFn: () => fetchAdminWorks({ batch_id: batchId, status }) });

export const useFixerUsers = () => useQuery({ queryKey: keys.users, queryFn: fetchFixerUsers });

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
}

export const useClaimWork = () => useInvalidating(() => claimWork());
export const useCompleteWork = () => useInvalidating((id: string) => completeWork(id));
export const useSkipWork = () => useInvalidating(({ id, note }: { id: string; note: string }) => skipWork(id, note));
export const useAssignWork = () =>
  useInvalidating(({ id, userId }: { id: string; userId: string }) => assignWork(id, userId));
export const useReleaseWork = () => useInvalidating((id: string) => releaseWork(id));
export const useReopenWork = () => useInvalidating((id: string) => reopenWork(id));
export const useImportBatch = () =>
  useInvalidating(({ batchId, files }: { batchId: string; files: File[] }) => importBatch(batchId, files));

/** Save without refetching the open work, so the workspace keeps its state. */
export function useSaveEdits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, edits }: { id: string; edits: SegmentEdit[] }) => saveEdits(id, edits),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.myWorks });
      qc.invalidateQueries({ queryKey: [...root, 'admin'] });
    },
  });
}
