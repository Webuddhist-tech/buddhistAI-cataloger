import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createGroup,
  deleteGroup,
  getMyGroups,
  listGroupBatches,
  listGroups,
  setGroupMembers,
  updateGroup,
} from '@/api/outliner';

const GROUPS_KEY = ['outliner', 'groups'] as const;
const MY_GROUPS_KEY = ['outliner', 'groups', 'mine'] as const;

/** Admin: every work group with its members, plus actions to change them. */
export function useOutlinerGroups({ enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: GROUPS_KEY, queryFn: listGroups, enabled, staleTime: 60_000 });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: GROUPS_KEY });

  const create = useMutation({ mutationFn: createGroup, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ groupId, ...body }: { groupId: string; name?: string; batch_id?: string | null }) =>
      updateGroup(groupId, body),
    onSuccess: invalidate,
  });
  const setMembers = useMutation({
    mutationFn: ({ groupId, userIds }: { groupId: string; userIds: string[] }) => setGroupMembers(groupId, userIds),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: deleteGroup, onSuccess: invalidate });

  return {
    ...query,
    groups: query.data ?? [],
    createGroup: create.mutateAsync,
    updateGroup: update.mutateAsync,
    setGroupMembers: setMembers.mutateAsync,
    deleteGroup: remove.mutateAsync,
    isSaving: create.isPending || update.isPending || setMembers.isPending || remove.isPending,
  };
}

/** Admin: BDRC batches a group can be linked to. */
export function useGroupBatches() {
  return useQuery({ queryKey: [...GROUPS_KEY, 'batches'], queryFn: listGroupBatches, staleTime: 60_000 });
}

/** The signed-in user's own groups. */
export function useMyOutlinerGroups({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: MY_GROUPS_KEY, queryFn: getMyGroups, enabled, staleTime: 60_000 });
}
