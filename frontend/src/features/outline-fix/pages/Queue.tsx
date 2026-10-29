import { Link, useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/useUser';
import { useClaimWork, useFixerMe, useMyWorks } from '../hooks';
import { STATUS_LABEL, STATUS_STYLE, formatDate, hasOutlineFixAccess, isOutlineFixAdmin } from '../utils';

/** The annotator's works: the one in progress, and the ones already finished. */
export default function Queue() {
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useUser();
  const me = useFixerMe(hasOutlineFixAccess(user));
  const works = useMyWorks();
  const claim = useClaimWork();

  const rows = works.data ?? [];
  const inProgress = rows.find((w) => w.status === 'in_progress');

  const getNext = async () => {
    try {
      const res = await claim.mutateAsync(undefined);
      if (!res.work) toast.info('No works left to fix.');
      else navigate(`/outline-fix/work/${res.work.id}`);
    } catch (e) {
      toast.error(`Could not get a work: ${(e as Error).message}`);
    }
  };

  if (!userLoading && !hasOutlineFixAccess(user)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-gray-600">
        You don't have access to the Outline Fixer. Ask an admin to give you the <code>outline_fix</code> permission.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Outline Fixer</h1>
          <p className="mt-1 text-sm text-gray-600">
            Fix span and part-type issues in BDRC outlines, one work at a time.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          {isOutlineFixAdmin(me.data) && (
            <Button asChild variant="outline" className="cursor-pointer">
              <Link to="/outline-fix-admin">
                <Settings className="h-4 w-4" /> Admin
              </Link>
            </Button>
          )}
          {inProgress ? (
            <Button className="flex-1 cursor-pointer sm:flex-none" onClick={() => navigate(`/outline-fix/work/${inProgress.id}`)}>
              Continue {inProgress.w_id}
            </Button>
          ) : (
            <Button className="flex-1 cursor-pointer sm:flex-none" onClick={getNext} disabled={claim.isPending}>
              {claim.isPending ? 'Getting a work…' : 'Get next work'}
            </Button>
          )}
        </div>
      </div>

      {works.error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load your works: {works.error.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Work</th>
              <th className="px-4 py-3">Batch</th>
              <th className="px-4 py-3">Issues</th>
              <th className="px-4 py-3">Edited segments</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assigned</th>
              <th className="px-4 py-3">Finished</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {works.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">Loading…</td>
              </tr>
            )}
            {!works.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  No works yet. Click "Get next work" to start.
                </td>
              </tr>
            )}
            {rows.map((w) => (
              <tr
                key={w.id}
                onClick={() => navigate(`/outline-fix/work/${w.id}`)}
                className="cursor-pointer hover:bg-gray-50"
              >
                <td className="px-4 py-3 font-mono text-gray-900">{w.w_id}</td>
                <td className="px-4 py-3 text-gray-600">{w.batch_id}</td>
                <td className="px-4 py-3 tabular-nums">{w.issue_count}</td>
                <td className="px-4 py-3 tabular-nums">{w.edit_count}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[w.status]}`}>
                    {STATUS_LABEL[w.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{formatDate(w.assigned_at)}</td>
                <td className="px-4 py-3 text-gray-600">{formatDate(w.completed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
