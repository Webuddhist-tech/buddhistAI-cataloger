import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createGroup,
  deleteGroup,
  getMyGroups,
  listGroupBatches,
  listGroups,
  setGroupMembers,
  updateGroup,
  type OutlinerGroup,
} from '@/api/outliner';

const GROUPS_KEY = ['outliner', 'groups'] as const;
const MY_GROUPS_KEY = ['outliner', 'groups', 'mine'] as const;

/** Admin: every work group with its members, plus actions to change them. */
export function useOutlinerGroups({ enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: GROUPS_KEY, queryFn: listGroups, enabled, staleTime: 60_000 });
  // Refetch in the background (not awaited) so dialogs close as soon as the save returns.
  // `exact` keeps the BDRC-backed batches query (same key prefix, ~1s) out of it.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: GROUPS_KEY, exact: true });
    void queryClient.invalidateQueries({ queryKey: MY_GROUPS_KEY });
  };
  const putGroup = (group: OutlinerGroup) => {
    queryClient.setQueryData<OutlinerGroup[]>(GROUPS_KEY, (old) => old?.map((g) => (g.id === group.id ? group : g)));
    refresh();
  };

  const create = useMutation({ mutationFn: createGroup, onSuccess: refresh });
  const update = useMutation({
    mutationFn: ({ groupId, ...body }: { groupId: string; name?: string; batch_id?: string | null }) =>
      updateGroup(groupId, body),
    onSuccess: putGroup,
  });
  const setMembers = useMutation({
    mutationFn: ({ groupId, userIds }: { groupId: string; userIds: string[] }) => setGroupMembers(groupId, userIds),
    onSuccess: putGroup,
  });
  const remove = useMutation({
    mutationFn: deleteGroup,
    onSuccess: (_, groupId) => {
      queryClient.setQueryData<OutlinerGroup[]>(GROUPS_KEY, (old) => old?.filter((g) => g.id !== groupId));
      refresh();
    },
  });

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
