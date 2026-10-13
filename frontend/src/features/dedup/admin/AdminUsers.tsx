import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SimplePagination } from '@/components/ui/simple-pagination';
import AvatarWrapper from '@/components/AvatarWrapper';
import UserNameFilter from '@/components/admin/users/UserNameFilter';
import type { DedupRole, User, UserRowUpdate } from '@/api/user';
import { useUserActions, useUsers } from '@/hooks';
import { reviewQueryKeyRoot } from '../hooks/useReview';
import { dedupRole, hasDedupAccess } from '../utils';

const PAGE_SIZE = 20;
const ROLES: DedupRole[] = ['annotator', 'reviewer', 'admin'];

// The Outliner's users page, for the Deduplicator: the dedup role and dedup access, each
// changed on its own (as the Outliner's role and permissions are). Never the Outliner role.
export default function AdminUsers() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  const role = ROLES.includes(roleParam as DedupRole) ? (roleParam as DedupRole) : 'all';
  const username = searchParams.get('username') || '';
  const [draftRole, setDraftRole] = useState<string>(role);
  const [draftUsername, setDraftUsername] = useState(username);

  useEffect(() => {
    setDraftRole(role);
    setDraftUsername(username);
  }, [role, username]);

  const applyFilters = () => {
    setSearchParams((params) => {
      if (draftRole === 'all') params.delete('role');
      else params.set('role', draftRole);
      const name = draftUsername.trim();
      if (name) params.set('username', name);
      else params.delete('username');
      params.set('page', '1');
      return params;
    });
  };
  const isApplyDisabled = draftRole === role && draftUsername.trim() === username.trim();

  const { users, isLoading, isFetching, hasNextPage, hasPrevPage, handleNextPage, handlePrevPage } = useUsers({
    pageSize: PAGE_SIZE,
    username: username || undefined,
    dedupRole: role === 'all' ? undefined : role,
  });
  const { updateUser } = useUserActions();

  const update = async (user: User, data: UserRowUpdate) => {
    try {
      await updateUser(user.id, data);
      // Annotator lists and adjudicator pickers on the other admin pages.
      void queryClient.invalidateQueries({ queryKey: [...reviewQueryKeyRoot, 'admin'] });
    } catch (e) {
      toast.error(t('dedup.admin.users.saveFailed', { error: (e as Error).message }));
    }
  };

  const setAccess = (user: User, on: boolean) => {
    const others = (user.permissions ?? []).filter((p) => p !== 'dedup');
    void update(user, { permissions: on ? [...others, 'dedup'] : others });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('dedup.admin.nav.users')}</h1>
          <p className="mt-1 text-sm text-gray-600">{t('dedup.admin.users.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <UserNameFilter value={draftUsername} onChange={setDraftUsername} />
          <Select value={draftRole} onValueChange={setDraftRole}>
            <SelectTrigger className="w-full max-w-48">
              <SelectValue placeholder={t('dedup.admin.users.allRoles')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('dedup.admin.users.allRoles')}</SelectItem>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`dedup.admin.users.role.${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={isApplyDisabled} onClick={applyFilters}>
            {t('dedup.admin.users.applyFilters')}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {(['user', 'role', 'access', 'created'] as const).map((c) => (
                <th key={c} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t(`dedup.admin.users.col.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={4} className="px-6 py-3">
                    <div className="h-9 animate-pulse rounded bg-gray-100" />
                  </td>
                </tr>
              ))}
            {!isLoading && users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
                  {t('dedup.admin.users.empty')}
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center gap-2">
                    {u.picture && <AvatarWrapper src={u.picture} alt={u.name || u.email} />}
                    <div>
                      <div className="text-sm font-medium text-gray-900">{u.name || 'No name'}</div>
                      <div className="text-sm text-gray-500">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <select
                    value={dedupRole(u)}
                    onChange={(e) => void update(u, { dedup_role: e.target.value as DedupRole })}
                    className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`dedup.admin.users.role.${r}`)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <label className="flex cursor-pointer items-center text-sm">
                    <input
                      type="checkbox"
                      checked={hasDedupAccess(u)}
                      onChange={(e) => setAccess(u, e.target.checked)}
                      className="mr-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-gray-700">{t('dedup.admin.users.dedup')}</span>
                  </label>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(hasPrevPage || hasNextPage) && (
        <SimplePagination
          className="mt-4"
          canGoPrev={hasPrevPage}
          canGoNext={hasNextPage}
          onPrev={handlePrevPage}
          onNext={handleNextPage}
          label=""
          isDisabled={isFetching}
        />
      )}
    </div>
  );
}
