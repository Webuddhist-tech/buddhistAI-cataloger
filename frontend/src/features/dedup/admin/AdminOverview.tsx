import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Hourglass, Inbox } from 'lucide-react';
import type { AdminBatch, SyncHealth } from '../api/review';
import { useAdminOverview } from '../hooks/useReview';
import { ABSTENTION_LABEL, ISSUE_LABEL, batchNames, verdictLabel } from '../utils';
import InfoTip from './InfoTip';

// BDRC statuses in the batch bars. Anything else BDRC reports is grouped as "other".
const BDRC_STATUS = [
  { key: 'finalized', label: 'Answered', bar: 'bg-green-500', dot: 'bg-green-500' },
  { key: 'flagged', label: 'Data problem', bar: 'bg-amber-400', dot: 'bg-amber-400' },
  { key: 'other', label: 'Other', bar: 'bg-sky-400', dot: 'bg-sky-400' },
  { key: 'new', label: 'Not answered yet', bar: 'bg-gray-200', dot: 'bg-gray-300' },
] as const;

export default function AdminOverview() {
  const overview = useAdminOverview();
  const o = overview.data;
  const names = useMemo(() => batchNames(o?.batches ?? []), [o?.batches]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Progress</h1>
      <p className="mt-1 text-sm text-gray-600">Across all annotators</p>

      {overview.isLoading && <div className="mt-6 h-40 animate-pulse rounded-xl bg-gray-100" />}
      {overview.error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load progress: {overview.error.message}
        </div>
      )}

      {o && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={<Inbox className="h-4 w-4" />} label="Given out" value={o.totals.assigned}
              tip="Pairs annotators have taken with “Assign me work”, or that an admin gave them." />
            <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Answered" value={o.totals.done} tone="green"
              tip="Answered (same, different, …) or reported as a data problem." />
            <Stat icon={<Hourglass className="h-4 w-4" />} label="Opened" value={o.totals.in_progress} tone="amber"
              tip="The annotator opened the pair but has not answered yet." />
            <Stat icon={<CircleDashed className="h-4 w-4" />} label="Not opened" value={o.totals.not_started}
              tip="Given to an annotator who has not opened it yet." />
          </div>

          <Section title="Batches" tip="Batches of pairs prepared by BDRC. New batches appear here automatically.">
            <div className="space-y-4">
              {o.batches.map((b) => (
                <BatchCard key={b.batch_id} batch={b} name={names[b.batch_id] ?? b.batch_id} />
              ))}
              {o.batches.length === 0 && <p className="text-sm text-gray-500">No batches yet.</p>}
            </div>
          </Section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Section title="Answers" className="mt-4" tip="The current answer for each pair.">
              <Counts rows={o.verdicts} label={verdictLabel} empty="No answers yet." />
            </Section>
            <Section title="Couldn't answer" className="mt-4" tip="When annotators chose “Can't answer”, the reason they gave.">
              <Counts rows={o.abstention_reasons} label={(k) => ABSTENTION_LABEL[k] ?? k} empty="None so far." />
            </Section>
            <Section title="Data problems reported" className="mt-4" tip="Problems with the texts themselves, reported for fixing later.">
              <Counts rows={o.issues} label={(k) => ISSUE_LABEL[k] ?? k} empty="None so far." />
            </Section>
          </div>

          <SyncLine sync={o.sync} />
        </>
      )}
    </div>
  );
}

// Shown only when a person is needed: answers are retried until BDRC takes them, and
// "failed" means BDRC rejected one, which a developer has to look at.
function SyncLine({ sync }: Readonly<{ sync: SyncHealth }>) {
  const failed = sync.counts.failed ?? 0;
  if (failed > 0) {
    return (
      <div className="mt-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-900">
            {failed === 1 ? '1 answer did not reach BDRC' : `${failed} answers did not reach BDRC`}
          </p>
          <p className="mt-0.5 text-sm text-red-800">
            The answers are saved here. Please send these pair numbers to a developer:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sync.failed.map((f) => (
              <span
                key={f.decision_id}
                className="rounded-md border border-red-200 bg-white px-2 py-0.5 text-sm font-medium tabular-nums text-red-800"
              >
                Pair {f.item_id}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function BatchCard({ batch, name }: Readonly<{ batch: AdminBatch; name: string }>) {
  const known = new Set(['finalized', 'flagged', 'new']);
  const counts: Record<string, number> = {
    finalized: batch.status_counts.finalized ?? 0,
    flagged: batch.status_counts.flagged ?? 0,
    new: batch.status_counts.new ?? 0,
    other: Object.entries(batch.status_counts)
      .filter(([k]) => !known.has(k))
      .reduce((a, [, n]) => a + n, 0),
  };
  const total = batch.n_items || Object.values(counts).reduce((a, n) => a + n, 0);
  const pct = (n: number) => (total ? (n / total) * 100 : 0);

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium text-gray-900" title={batch.batch_id}>{name}</span>
          <span className="ml-2 text-sm text-gray-500">{total} pairs</span>
        </div>
        {batch.created_at && (
          <span className="text-xs text-gray-400">
            Added {new Date(batch.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1 text-xs text-gray-500">
        Status in BDRC
        <InfoTip text="Live from BDRC: every pair of the batch, whoever answered it." />
      </div>
      <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-gray-100" aria-label="Status in BDRC">
        {BDRC_STATUS.map((s) =>
          counts[s.key] ? <span key={s.key} className={`h-full ${s.bar}`} style={{ width: `${pct(counts[s.key])}%` }} /> : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {BDRC_STATUS.filter((s) => s.key !== 'other' || counts.other > 0).map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
            {s.label} <strong className="tabular-nums text-gray-900">{counts[s.key]}</strong>
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-gray-100 pt-3 text-xs text-gray-600">
        <span>
          Given to annotators: <strong className="tabular-nums text-gray-900">{batch.assigned}</strong> of {total}
          {batch.assigned > 0 && <> · {batch.assigned_done} answered</>}
        </span>
        <InfoTip text="From the Cataloger: how many pairs of this batch annotators have taken so far, and how many of those they answered." />
      </div>
    </div>
  );
}

const TONE = { green: 'text-green-700', amber: 'text-amber-700' };

function Stat({ icon, label, value, tone, tip }: Readonly<{
  icon: ReactNode;
  label: string;
  value: number;
  tone?: keyof typeof TONE;
  tip: string;
}>) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
        <span className="text-gray-400">{icon}</span>
        {label}
        <InfoTip text={tip} />
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone ? TONE[tone] : 'text-gray-900'}`}>{value}</div>
    </div>
  );
}

function Section({ title, tip, children, className = 'mt-6' }: Readonly<{
  title: string;
  tip?: string;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <section className={`${className} rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5`}>
      <h2 className="mb-3 flex items-center gap-1 text-sm font-semibold text-gray-900">
        {title}
        {tip && <InfoTip text={tip} />}
      </h2>
      {children}
    </section>
  );
}

function Counts({ rows, label, empty }: Readonly<{ rows: Record<string, number>; label: (k: string) => string; empty: string }>) {
  const entries = Object.entries(rows).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  if (entries.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {entries.map(([k, n]) => (
        <li key={k}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-gray-700">{label(k)}</span>
            <span className="tabular-nums text-gray-900">
              {n} <span className="text-xs text-gray-400">({Math.round((n / total) * 100)}%)</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <span className="block h-full rounded-full bg-gray-700" style={{ width: `${(n / total) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
