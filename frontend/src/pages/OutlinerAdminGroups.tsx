import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, PencilIcon, PlusIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import type { OutlinerGroup } from '@/api/outliner';
import { useOutlinerGroups, useOutlinerUsers } from '@/hooks';
import { Button } from '@/components/ui/button';
import { SkeletonLarger } from '@/components/ui/skeleton';
import { DeleteGroupDialog, GroupFormDialog, GroupMembersDialog } from '@/components/admin/groups/GroupDialogs';

const WORK_ROLES = new Set(['admin', 'reviewer', 'annotator']);

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

function OutlinerAdminGroups() {
  const { groups, isLoading, error, createGroup, updateGroup, setGroupMembers, deleteGroup, isSaving } =
    useOutlinerGroups();
  const { users } = useOutlinerUsers();
  const workUsers = useMemo(() => users.filter((u) => WORK_ROLES.has(u.role ?? '')), [users]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OutlinerGroup | undefined>();
  const [membersGroupId, setMembersGroupId] = useState<string | null>(null);
  const membersGroup = groups.find((g) => g.id === membersGroupId) ?? null;
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const deletingGroup = groups.find((g) => g.id === deletingGroupId) ?? null;

  const ungrouped = useMemo(() => {
    const grouped = new Set(groups.flatMap((g) => g.members.map((m) => m.user_id)));
    return workUsers.filter((u) => !grouped.has(u.id));
  }, [groups, workUsers]);

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (group: OutlinerGroup) => {
    setEditing(group);
    setFormOpen(true);
  };

  const saveGroup = async (values: { name: string; batch_id: string | null }) => {
    try {
      if (editing) await updateGroup({ groupId: editing.id, ...values });
      else await createGroup(values);
      toast.success(editing ? 'Group updated' : 'Group created');
      setFormOpen(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const saveMembers = async (userIds: string[]) => {
    if (!membersGroup) return;
    try {
      await setGroupMembers({ groupId: membersGroup.id, userIds });
      toast.success('Members saved');
      setMembersGroupId(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const confirmDelete = async () => {
    if (!deletingGroup) return;
    try {
      await deleteGroup(deletingGroup.id);
      toast.success('Group deleted');
      setDeletingGroupId(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Groups</h3>
          <p className="mt-1 text-sm text-gray-600">
            Each group gets new volumes from its batch. Reviewers only review documents from their own groups.
          </p>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon className="h-4 w-4" /> New group
        </Button>
      </div>

      {ungrouped.length > 0 && !isLoading && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Not in any group yet, so they can't be assigned work: {ungrouped.map((u) => u.name || u.email).join(', ')}
          </span>
        </div>
      )}

      {isLoading && <SkeletonLarger />}
      {error && <p className="text-sm text-red-600">Could not load groups: {error.message}</p>}
      {!isLoading && !error && groups.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
          No groups yet. Create one and link it to a batch.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <section key={group.id} className="flex flex-col rounded-lg border border-gray-200 bg-white">
            <header className="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
              <div className="min-w-0">
                <h4 className="truncate font-semibold text-gray-900">{group.name}</h4>
                <p className="text-sm text-gray-600">
                  Batch:{' '}
                  {group.batch_id ? (
                    <span className="font-medium text-gray-900">{group.batch_id}</span>
                  ) : (
                    <span className="text-amber-700">none — members can't get new volumes</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setMembersGroupId(group.id)}>
                  <UsersIcon className="h-4 w-4" /> Members ({group.members.length})
                </Button>
                <Button variant="ghost" size="icon" onClick={() => openEdit(group)} aria-label={`Edit ${group.name}`}>
                  <PencilIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeletingGroupId(group.id)}
                  aria-label={`Delete ${group.name}`}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              </div>
            </header>
            {group.members.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-500">No members yet</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto px-4 py-2">
                <ol className="columns-1 gap-x-6 sm:columns-2 lg:columns-3 2xl:columns-4">
                  {group.members.map((m, i) => (
                    <li
                      key={m.user_id}
                      className="flex break-inside-avoid items-center gap-2 border-b border-gray-50 py-1.5 text-sm"
                    >
                      <span className="w-7 shrink-0 text-right tabular-nums text-gray-400">{i + 1}.</span>
                      <span className="min-w-0 flex-1 truncate text-gray-900">{m.name || m.email || m.user_id}</span>
                      <span className="shrink-0 text-xs capitalize text-gray-500">{m.role}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        ))}
      </div>

      <GroupFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        group={editing}
        isSaving={isSaving}
        onSave={saveGroup}
      />
      <DeleteGroupDialog
        group={deletingGroup}
        onOpenChange={(open) => !open && setDeletingGroupId(null)}
        isDeleting={isSaving}
        onConfirm={confirmDelete}
      />
      <GroupMembersDialog
        open={membersGroup !== null}
        onOpenChange={(open) => !open && setMembersGroupId(null)}
        group={membersGroup}
        users={workUsers}
        groups={groups}
        isSaving={isSaving}
        onSave={saveMembers}
      />
    </div>
  );
}

export default OutlinerAdminGroups;
