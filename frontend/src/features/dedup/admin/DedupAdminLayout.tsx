import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users } from 'lucide-react';
import { useUser } from '@/hooks/useUser';

const LINKS = [
  { to: '/dedup-admin/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/dedup-admin/annotators', label: 'Annotators', icon: Users },
];

export default function DedupAdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { user, isLoading } = useUser();

  if (isLoading) return null;
  if (user?.role !== 'admin') {
    return <p className="py-24 text-center text-sm text-gray-500">Admins only.</p>;
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col md:flex-row">
      <aside className="shrink-0 border-b border-gray-200 bg-white md:w-56 md:border-b-0 md:border-r">
        <div className="hidden px-4 pt-4 text-[11px] font-medium uppercase tracking-wide text-gray-400 md:block">
          Deduplicator admin
        </div>
        <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col md:gap-0.5 md:p-3" aria-label="Deduplicator admin">
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
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
