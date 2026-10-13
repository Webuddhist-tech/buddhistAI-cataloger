import type { User, UserRowUpdate } from '@/api/user';
import UserNameFilter from './UserNameFilter';
import UserRoleFilter from './UserRoleFilter';
import UserRow from './UserRow';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SkeletonLarger } from '@/components/ui/skeleton';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface UsersTabProps {
  isLoading: boolean;
  users: User[];
  onUserUpdate: (userId: string, userData: UserRowUpdate) => void;
  onUserDelete: (userId: string) => void;
}

function UsersTab({
  isLoading,
  users,
  onUserUpdate,
  onUserDelete,
}: Readonly<UsersTabProps>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const role = searchParams.get('role') || 'all';
  const username = searchParams.get('username') || '';
  const [draftRole, setDraftRole] = useState(role);
  const [draftUsername, setDraftUsername] = useState(username);

  useEffect(() => {
    setDraftRole(role);
    setDraftUsername(username);
  }, [role, username]);

  const applyFilters = () => {
    setSearchParams((params) => {
      if (draftRole === 'all') params.delete('role');
      else params.set('role', draftRole);

      const trimmedName = draftUsername.trim();
      if (trimmedName) params.set('username', trimmedName);
      else params.delete('username');

      params.set('page', '1');
      return params;
    });
  };
  const isApplyDisabled =
    draftRole === role &&
    draftUsername.trim() === username.trim();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-4 pb-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">User Management</h3>
          <p className="mt-1 text-sm text-gray-600">Manage user roles and permissions</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <UserNameFilter value={draftUsername} onChange={setDraftUsername} />
          </div>
          <div className="flex items-center gap-2">
            <UserRoleFilter value={draftRole} onChange={setDraftRole} />
          </div>
          <Button disabled={isApplyDisabled} onClick={applyFilters}>Apply Filters</Button>
        </div>
      </div>
      {isLoading ? (
          <SkeletonLarger />
      ) : (   
      <div className="relative min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable] rounded-md border border-gray-200 bg-white">
        <Table
          wrapperClassName="min-w-0 overflow-visible"
          className="min-w-full divide-y divide-gray-200"
        >
          <TableHeader className="sticky top-0 z-1 bg-gray-50 shadow-sm">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </TableHead>
              <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </TableHead>
              <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Permissions
              </TableHead>
              <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </TableHead>
              <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-200 bg-white">
            {users.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  onUpdate={onUserUpdate}
                  onDelete={onUserDelete}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
      )}
    </div>
  );
}

export default UsersTab;
