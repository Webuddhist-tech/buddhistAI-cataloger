import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { AlertTriangle, Gavel, LayoutDashboard, PencilLine, UserCog, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUser } from '@/hooks/useUser';
import { useDedupSettings } from '../hooks/useReview';
import { isDedupAdmin } from '../utils';

const LINKS = [
  { to: '/dedup-admin/overview', label: 'dedup.admin.nav.overview', icon: LayoutDashboard },
  { to: '/dedup-admin/annotators', label: 'dedup.admin.nav.annotators', icon: Users },
  { to: '/dedup-admin/adjudications', label: 'dedup.admin.nav.adjudications', icon: Gavel },
  { to: '/dedup-admin/pairs', label: 'dedup.admin.nav.pairs', icon: PencilLine },
  { to: '/dedup-admin/users', label: 'dedup.admin.nav.users', icon: UserCog },
];

// `bare`: the admin check only, without the side menu, for full-width screens such as
// the answer screen an admin corrects a pair on.
export default function DedupAdminLayout({ children, bare = false }: Readonly<{ children: ReactNode; bare?: boolean }>) {
  const { t } = useTranslation();
  const { user, isLoading } = useUser();
  const admin = isDedupAdmin(user);
  const settings = useDedupSettings(admin);
  const single = settings.data?.review_mode === 'single';

  if (isLoading) return null;
  if (!admin) {
    return <p className="py-24 text-center text-sm text-gray-500">{t('dedup.admin.adminsOnly')}</p>;
  }
  if (bare) return <>{children}</>;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col md:flex-row">
      <aside className="shrink-0 border-b border-gray-200 bg-white md:w-56 md:border-b-0 md:border-r">
        <div className="hidden px-4 pt-4 text-[11px] font-medium uppercase tracking-wide text-gray-400 md:block">
          {t('dedup.admin.nav.label')}
        </div>
        <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col md:gap-0.5 md:p-3" aria-label={t('dedup.admin.nav.label')}>
          {LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Icon className="h-4 w-4" /> {t(label)}
            </NavLink>
          ))}
        </nav>
        {/* Easy to forget once switched: stays in sight on every admin page. */}
        {single && (
          <NavLink
            to="/dedup-admin/overview"
            className="mx-2 mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 md:mx-3"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span>
              {t('dedup.admin.singleOn')}
              <span className="block font-normal text-amber-800">{t('dedup.admin.singleOnHint')}</span>
            </span>
          </NavLink>
        )}
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
