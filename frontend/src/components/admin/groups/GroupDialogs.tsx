import { useEffect, useMemo, useState } from 'react';
import type { OutlinerGroup } from '@/api/outliner';
import type { OutlinerUser } from '@/hooks';
import { useGroupBatches } from '@/hooks';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Radix Select cannot use an empty string as a value.
const NO_BATCH = '__none__';

interface GroupFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Group being edited; omit to create a new one. */
  group?: OutlinerGroup;
  isSaving: boolean;
  onSave: (values: { name: string; batch_id: string | null }) => Promise<void>;
}

export function GroupFormDialog({ open, onOpenChange, group, isSaving, onSave }: Readonly<GroupFormDialogProps>) {
  const [name, setName] = useState('');
  const [batchId, setBatchId] = useState(NO_BATCH);
  const { data: batches = [], isLoading: batchesLoading, error: batchesError } = useGroupBatches();

  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? '');
    setBatchId(group?.batch_id ?? NO_BATCH);
  }, [open, group]);

  // Keep the current batch selectable even if BDRC no longer lists it.
  const batchOptions = useMemo(() => {
    const options = [...batches];
    if (group?.batch_id && !options.some((b) => b.batch_id === group.batch_id)) {
      options.unshift({ batch_id: group.batch_id, active: 0 });
    }
    return options;
  }, [batches, group?.batch_id]);

  const save = async () => {
    await onSave({ name: name.trim(), batch_id: batchId === NO_BATCH ? null : batchId });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{group ? 'Edit group' : 'New group'}</DialogTitle>
          <DialogDescription>
            Members get new volumes from the linked batch. Changing the batch only affects work assigned from now on.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ume"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Batch</Label>
            <Select value={batchId} onValueChange={setBatchId} disabled={batchesLoading}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={batchesLoading ? 'Loading batches…' : 'Choose a batch'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BATCH}>No batch</SelectItem>
                {batchOptions.map((b) => (
                  <SelectItem key={b.batch_id} value={b.batch_id}>
                    {b.batch_id} · {b.active.toLocaleString()} available
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {batchesError && (
              <p className="text-xs text-red-600">Could not load batches from BDRC: {batchesError.message}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isSaving || !name.trim()}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface GroupMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: OutlinerGroup | null;
  users: OutlinerUser[];
  /** All groups, to show which other groups each user is already in. */
  groups: OutlinerGroup[];
  isSaving: boolean;
  onSave: (userIds: string[]) => Promise<void>;
}

export function GroupMembersDialog({
  open,
  onOpenChange,
  group,
  users,
  groups,
  isSaving,
  onSave,
}: Readonly<GroupMembersDialogProps>) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const otherGroupsByUser = useMemo(() => {
    const byUser = new Map<string, string[]>();
    for (const g of groups) {
      if (g.id === group?.id) continue;
      for (const m of g.members) byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), g.name]);
    }
    return byUser;
  }, [groups, group?.id]);

  // Reset only when opening or switching group: a refreshed `group` after saving
  // must not clear the search and flash the full list while the dialog closes.
  useEffect(() => {
    if (!open || !group) return;
    setSelected(new Set(group.members.map((m) => m.user_id)));
    setSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group?.id]);

  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => !q || (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
  }, [users, search]);

  const toggle = (userId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Members of {group?.name}</DialogTitle>
          <DialogDescription>
            Annotators get volumes from this group's batch; reviewers review this group's documents. Work people
            already have stays with them. To move someone, tick them here and untick them in their old group.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          aria-label="Search users"
        />
        <ul className="max-h-80 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
          {visibleUsers.map((u) => {
            const id = `member-${u.id}`;
            return (
              <li key={u.id}>
                <label htmlFor={id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50">
                  <Checkbox
                    id={id}
                    checked={selected.has(u.id)}
                    onCheckedChange={(c) => toggle(u.id, c === true)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-900">{u.name || u.email}</span>
                    {u.name && <span className="block truncate text-xs text-gray-500">{u.email}</span>}
                  </span>
                  {otherGroupsByUser.has(u.id) && (
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                      in {otherGroupsByUser.get(u.id)!.join(', ')}
                    </span>
                  )}
                  {u.role && <span className="text-xs capitalize text-gray-500">{u.role}</span>}
                </label>
              </li>
            );
          })}
          {visibleUsers.length === 0 && <li className="px-3 py-6 text-center text-sm text-gray-500">No users found</li>}
        </ul>
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-sm text-gray-500">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => onSave([...selected])} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save members'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteGroupDialogProps {
  group: OutlinerGroup | null;
  onOpenChange: (open: boolean) => void;
  isDeleting: boolean;
  onConfirm: () => Promise<void>;
}

export function DeleteGroupDialog({ group, onOpenChange, isDeleting, onConfirm }: Readonly<DeleteGroupDialogProps>) {
  return (
    <Dialog open={group !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete group “{group?.name}”?</DialogTitle>
          <DialogDescription>This can't be undone.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>
            Its {group?.members.length ?? 0} members are removed from it. Anyone not in another group can't get new
            work until an admin adds them to one.
          </li>
          <li>Work people already have stays with them.</li>
          <li>Its documents can then be reviewed by any reviewer.</li>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting…' : 'Delete group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
