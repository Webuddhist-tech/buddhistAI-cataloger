import { useCallback, useMemo } from 'react';
import type { UserRowUpdate } from '@/api/user';
import { UsersTab } from '../components/admin';
import { SimplePagination } from '../components/ui/simple-pagination';
import { useUsers, useUserActions, type UserFilters } from '../hooks';
import { SkeletonLarger } from '@/components/ui/skeleton';
import { useSearchParams } from 'react-router-dom';

function OutlinerAdminUsers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const role = searchParams.get('role') || undefined;
  const username = searchParams.get('username') || undefined;
  const pageSize = 20;

  const filters: UserFilters = useMemo(
    () => ({
      pageSize,
      role,
      username: username || undefined,
    }),
    [ pageSize, role, username]
  );

  const { users, total, isLoading, isFetching, hasNextPage, hasPrevPage,handleNextPage,handlePrevPage } = useUsers(filters);
  const { updateUser, deleteUser } = useUserActions();

  const handleUserUpdate = async (
    userId: string,
    userData: UserRowUpdate
  ) => {
    try {
      await updateUser(userId, userData);
    } catch (error) {
      console.error('Failed to update user:', error);
      alert('Failed to update user. Please try again.');
    }
  };

  const handleUserDelete = async (userId: string) => {
    try {
      await deleteUser(userId);
    } catch (error) {
      console.error('Failed to delete user:', error);
      alert('Failed to delete user. Please try again.');
    }
  };

 

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      <UsersTab users={users} onUserUpdate={handleUserUpdate} onUserDelete={handleUserDelete} isLoading={isLoading} />
      {(hasPrevPage || hasNextPage) && (
        <SimplePagination
          canGoPrev={hasPrevPage}
          canGoNext={hasNextPage}
          onPrev={handlePrevPage}
          onNext={handleNextPage}
          label={''}
          isDisabled={isFetching}
        />
      )}
    </div>
  );
}

export default OutlinerAdminUsers;
