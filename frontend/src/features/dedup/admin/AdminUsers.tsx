import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { SimplePagination } from '@/components/ui/simple-pagination';
import AvatarWrapper from '@/components/AvatarWrapper';
import type { DedupRole, User, UserRowUpdate } from '@/api/user';
import { useUserActions, useUsers } from '@/hooks';
import { reviewQueryKeyRoot } from '../hooks/useReview';
import { dedupRole } from '../utils';

const PAGE_SIZE = 20;
type Show = 'access' | 'all';

// Who may use the Deduplicator and as what. Kept apart from the Outliner's users page:
// only dedup access and the dedup role are changed here, never the Outliner role.
export default function AdminUsers() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [, setSearchParams] = useSearchParams();
  const [show, setShow] = useState<Show>('access');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(q.trim()), 300);
    return () => window.clearTimeout(id);
  }, [q]);

  // A new filter starts from the first page.
  useEffect(() => {
    setSearchParams(
      (p) => {
        p.delete('page');
        return p;
      },
      { replace: true },
    );
  }, [search, show, setSearchParams]);

  const { users, total, isLoading, isFetching, hasNextPage, hasPrevPage, handleNextPage, handlePrevPage, page } = useUsers({
    pageSize: PAGE_SIZE,
    username: search || undefined,
    permission: show === 'access' ? 'dedup' : undefined,
  });
  const { updateUser } = useUserActions();

  const update = async (user: User, data: UserRowUpdate) => {
    try {
      await updateUser(user.id, data);
      // Annotator lists and adjudicator pickers on the other admin pages.
      void queryClient.invalidateQueries({ queryKey: [...reviewQueryKeyRoot, 'admin'] });
      toast.success(t('dedup.admin.users.saved', { name: user.name || user.email }));
    } catch (e) {
      toast.error(t('dedup.admin.users.saveFailed', { error: (e as Error).message }));
    }
  };

  const setAccess = (user: User, on: boolean) => {
    const current = user.permissions ?? [];
    const permissions = on ? [...new Set([...current, 'dedup'])] : current.filter((p) => p !== 'dedup');
    void update(user, { permissions });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-semibold text-gray-900">{t('dedup.admin.nav.users')}</h1>
      <p className="mt-1 text-sm text-gray-600">{t('dedup.admin.users.subtitle')}</p>

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md bg-gray-100 p-1" role="tablist">
          {(['access', 'all'] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={show === k}
              onClick={() => setShow(k)}
              className={`cursor-pointer rounded px-3 py-1 text-sm font-medium transition-colors ${
                show === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t(`dedup.admin.users.show.${k}`)}
            </button>
          ))}
        </div>
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('dedup.admin.users.search')}
          className="w-full sm:w-72"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t('dedup.admin.users.col.user')}</th>
              <th className="px-4 py-3 font-medium">{t('dedup.admin.users.col.access')}</th>
              <th className="px-4 py-3 font-medium">{t('dedup.admin.users.col.role')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={3} className="px-4 py-3">
                    <div className="h-9 animate-pulse rounded bg-gray-100" />
                  </td>
                </tr>
              ))}
            {users.map((u) => (
              <UserLine key={u.id} user={u} onAccess={(on) => setAccess(u, on)} onRole={(dedup_role) => void update(u, { dedup_role })} />
            ))}
          </tbody>
        </table>
        {!isLoading && users.length === 0 && (
          <p className="py-12 text-center text-sm text-gray-500">{t('dedup.admin.users.empty')}</p>
        )}
      </div>

      <SimplePagination
        className="mt-3"
        canGoPrev={hasPrevPage}
        canGoNext={hasNextPage}
        onPrev={handlePrevPage}
        onNext={handleNextPage}
        isDisabled={isFetching}
        labelPosition="left"
        label={<span className="text-sm text-gray-600">{t('dedup.admin.users.count', { count: total, page })}</span>}
      />
    </div>
  );
}

function UserLine({
  user,
  onAccess,
  onRole,
}: Readonly<{ user: User; onAccess: (on: boolean) => void; onRole: (role: DedupRole) => void }>) {
  const { t } = useTranslation();
  const hasAccess = user.permissions?.includes('dedup') ?? false;
  const role = dedupRole(user);
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {user.picture && <AvatarWrapper src={user.picture} alt={user.name || user.email} />}
          <div className="min-w-0">
            <div className="truncate font-medium text-gray-900">{user.name || user.email}</div>
            {user.name && <div className="truncate text-xs text-gray-500">{user.email}</div>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={hasAccess}
            onChange={(e) => onAccess(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-gray-700">{t(hasAccess ? 'dedup.admin.users.hasAccess' : 'dedup.admin.users.noAccess')}</span>
        </label>
      </td>
      <td className="px-4 py-3">
        {role === 'admin' ? (
          <span className="text-gray-800" title={t('dedup.admin.users.adminNote')}>
            {t('dedup.admin.users.roleAdmin')}
          </span>
        ) : (
          <select
            value={role}
            disabled={!hasAccess}
            onChange={(e) => onRole(e.target.value as DedupRole)}
            className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="annotator">{t('dedup.admin.users.roleAnnotator')}</option>
            <option value="reviewer">{t('dedup.admin.users.roleAdjudicator')}</option>
          </select>
        )}
      </td>
    </tr>
  );
}
