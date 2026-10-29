import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { exportBatchZip, type ImportResult, type WorkStatus, type WorkSummary } from '../api';
import {
  useAdminWorks,
  useAssignWork,
  useBatches,
  useFixerUsers,
  useImportBatch,
  useReleaseWork,
  useReopenWork,
} from '../hooks';
import { STATUS_LABEL, STATUS_STYLE, formatDate } from '../utils';

const STATUSES: WorkStatus[] = ['pending', 'in_progress', 'completed', 'skipped'];

/** Import batches, follow progress, hand out works and download the fixed CSVs. */
export default function Admin() {
  const batches = useBatches();
  const [batchId, setBatchId] = useState<string>('');
  const [status, setStatus] = useState<WorkStatus | ''>('');
  const [q, setQ] = useState('');
  const works = useAdminWorks(batchId || undefined, status || undefined);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = works.data ?? [];
    if (!needle) return all;
    return all.filter((w) => w.w_id.toLowerCase().includes(needle) || (w.assigned_to_name ?? '').toLowerCase().includes(needle));
  }, [works.data, q]);

  const totals = (batches.data ?? []).reduce(
    (acc, b) => {
      acc.total += b.total;
      STATUSES.forEach((s) => (acc[s] += b.status_counts[s] ?? 0));
      return acc;
    },
    { total: 0, pending: 0, in_progress: 0, completed: 0, skipped: 0 } as Record<'total' | WorkStatus, number>,
  );
  const shown = batchId ? batches.data?.find((b) => b.batch_id === batchId) : undefined;
  const progress = shown ? { total: shown.total, ...shown.status_counts } : totals;

  return (
    <div className="space-y-6 py-6">
      <div className="flex justify-end">
        <ExportButton batchId={batchId || undefined} />
      </div>

      {/* Progress */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label={shown ? `Works in ${shown.batch_id}` : 'Works'} value={progress.total} />
        {STATUSES.map((s) => (
          <Stat key={s} label={STATUS_LABEL[s]} value={progress[s]} total={progress.total} />
        ))}
      </div>

      <ImportPanel />

      {/* Works */}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-3">
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm">
            <option value="">All batches</option>
            {(batches.data ?? []).map((b) => (
              <option key={b.batch_id} value={b.batch_id}>
                {b.batch_id} ({b.status_counts.completed}/{b.total})
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as WorkStatus | '')} className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search W id or annotator" className="h-9 w-full sm:w-64" />
          <span className="ml-auto text-xs text-gray-500">{rows.length} work(s)</span>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Work</th>
                <th className="px-4 py-2">Batch</th>
                <th className="px-4 py-2">Issues</th>
                <th className="px-4 py-2">Edits</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Annotator</th>
                <th className="px-4 py-2">Finished</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {works.isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-gray-500">Loading…</td>
                </tr>
              )}
              {rows.map((w) => (
                <WorkRow key={w.id} work={w} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, total }: { readonly label: string; readonly value: number; readonly total?: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
        {value.toLocaleString()}
        {total ? <span className="ml-1 text-xs font-normal text-gray-500">{Math.round((value / total) * 100)}%</span> : null}
      </div>
    </div>
  );
}

function WorkRow({ work }: { readonly work: WorkSummary }) {
  const users = useFixerUsers();
  const assign = useAssignWork();
  const release = useReleaseWork();
  const reopen = useReopenWork();
  const run = async (p: Promise<unknown>, ok: string) => {
    try {
      await p;
      toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const finished = work.status === 'completed' || work.status === 'skipped';

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-2 font-mono">
        <Link to={`/outline-fix/work/${work.id}`} className="text-gray-900 hover:underline">
          {work.w_id}
        </Link>
      </td>
      <td className="px-4 py-2 text-gray-600">{work.batch_id}</td>
      <td className="px-4 py-2 tabular-nums">{work.issue_count}</td>
      <td className="px-4 py-2 tabular-nums">{work.edit_count}</td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[work.status]}`} title={work.note ?? undefined}>
          {STATUS_LABEL[work.status]}
        </span>
      </td>
      <td className="px-4 py-2">
        <select
          value={work.assigned_to ?? ''}
          disabled={assign.isPending}
          onChange={(e) => {
            if (e.target.value) run(assign.mutateAsync({ id: work.id, userId: e.target.value }), `${work.w_id} assigned`);
          }}
          className="h-8 max-w-[12rem] rounded-md border border-gray-200 bg-white px-2 text-sm"
        >
          <option value="">— unassigned —</option>
          {(users.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name || u.email}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2 text-gray-600">{formatDate(work.completed_at)}</td>
      <td className="space-x-2 whitespace-nowrap px-4 py-2">
        {work.assigned_to && !finished && (
          <button
            className="cursor-pointer text-xs text-gray-600 underline hover:text-gray-900"
            onClick={() => run(release.mutateAsync(work.id), `${work.w_id} back in the pool`)}
          >
            Release
          </button>
        )}
        {finished && (
          <button
            className="cursor-pointer text-xs text-gray-600 underline hover:text-gray-900"
            onClick={() => run(reopen.mutateAsync(work.id), `${work.w_id} reopened`)}
          >
            Reopen
          </button>
        )}
      </td>
    </tr>
  );
}

function ImportPanel() {
  const imp = useImportBatch();
  const [batchId, setBatchId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const onImport = async () => {
    try {
      setResult(await imp.mutateAsync({ batchId: batchId.trim(), files }));
      setFiles([]);
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Import a batch</h2>
      <p className="mt-1 text-xs text-gray-500">
        Choose a folder of work folders (each with outline.csv + issue.json), or a zip. Pairs are matched by W id; works
        already imported are skipped, and exported *_outline.csv files are ignored.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="Batch name, e.g. batch-2" className="h-9 w-48" />
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-gray-200 px-3 text-sm hover:bg-gray-50">
          Folder…
          <input
            type="file"
            className="hidden"
            // @ts-expect-error non-standard attribute for folder upload
            webkitdirectory=""
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-gray-200 px-3 text-sm hover:bg-gray-50">
          Files / zip…
          <input type="file" className="hidden" multiple accept=".csv,.json,.zip" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        <span className="text-xs text-gray-500">{files.length ? `${files.length} file(s) chosen` : 'No files chosen'}</span>
        <Button size="sm" className="cursor-pointer" disabled={!batchId.trim() || !files.length || imp.isPending} onClick={onImport}>
          <Upload className="h-4 w-4" /> {imp.isPending ? 'Importing…' : 'Import'}
        </Button>
      </div>
      {result && (
        <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-700">
          <div>
            <b>{result.batch_id}</b>: {result.created.length} created, {result.skipped_existing.length} already imported,{' '}
            {result.ignored.length} exported CSVs ignored, {result.errors.length} errors
          </div>
          {result.errors.length > 0 && (
            <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-5 text-red-700">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function ExportButton({ batchId }: { readonly batchId?: string }) {
  const [includeSkipped, setIncludeSkipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const onExport = async () => {
    setBusy(true);
    try {
      await exportBatchZip(batchId, includeSkipped);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        <input type="checkbox" checked={includeSkipped} onChange={(e) => setIncludeSkipped(e.target.checked)} />
        include skipped
      </label>
      <Button className="cursor-pointer" onClick={onExport} disabled={busy}>
        <Download className="h-4 w-4" /> {busy ? 'Preparing…' : `Download ${batchId ?? 'all'} (completed)`}
      </Button>
    </div>
  );
}
