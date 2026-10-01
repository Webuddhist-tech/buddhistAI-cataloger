import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Gavel, Hourglass, Inbox, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import type { AdminBatch, DoubleReviewCounts, ReviewMode, SyncHealth } from '../api/review';
import { useAdminOverview, useDedupSettings, useUpdateReviewMode } from '../hooks/useReview';
import { ABSTENTION_LABEL, ISSUE_LABEL, RESOLUTION_LABEL, batchNames, formatDateTime, verdictLabel } from '../utils';
import InfoTip from './InfoTip';

// BDRC statuses in the batch bars. Anything else BDRC reports is grouped as "other".
const BDRC_STATUS = [
  { key: 'finalized', label: 'Answered', bar: 'bg-green-500', dot: 'bg-green-500' },
  // Older answers that reported a problem without a verdict; new answers are always finalized.
  { key: 'flagged', label: 'Problem, no answer yet', bar: 'bg-amber-400', dot: 'bg-amber-400' },
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

      <ReviewModeSwitch />

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
              tip="Pairs annotators have taken with “Assign me work”, or that an admin gave them. Each pair is given to two annotators, so it counts twice." />
            <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Answered" value={o.totals.done} tone="green"
              tip="Answered: same, different, contains, or can't answer. A reported data problem comes with an answer." />
            <Stat icon={<Hourglass className="h-4 w-4" />} label="Opened" value={o.totals.in_progress} tone="amber"
              tip="The annotator opened the pair but has not answered yet." />
            <Stat icon={<CircleDashed className="h-4 w-4" />} label="Not opened" value={o.totals.not_started}
              tip="Given to an annotator who has not opened it yet." />
          </div>

          <DoubleReview d={o.double_review} />

          <Section title="Batches" tip="Batches of pairs prepared by BDRC. New batches appear here automatically.">
            <div className="space-y-4">
              {o.batches.map((b) => (
                <BatchCard key={b.batch_id} batch={b} name={names[b.batch_id] ?? b.batch_id} />
              ))}
              {o.batches.length === 0 && <p className="text-sm text-gray-500">No batches yet.</p>}
            </div>
          </Section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Section title="Final answers" className="mt-4" tip="The answer BDRC has for each settled pair: the one both annotators agreed on, or the adjudicator's.">
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

const MODES: { key: ReviewMode; label: string; help: string }[] = [
  { key: 'single', label: 'Single review', help: 'One annotator per pair. Their answer is final and goes straight to BDRC.' },
  {
    key: 'double',
    label: 'Double review',
    help: 'Two annotators per pair. The same answer is final; otherwise an adjudicator decides.',
  },
];

// How pairs handed out from now on are reviewed. Single while only one person annotates,
// so answers still reach BDRC; double once there are two or more.
function ReviewModeSwitch() {
  const settings = useDedupSettings();
  const update = useUpdateReviewMode();
  const s = settings.data;
  if (!s) return null;

  const choose = async (mode: ReviewMode) => {
    if (mode === s.review_mode) return;
    try {
      await update.mutateAsync(mode);
      toast.success(`${mode === 'single' ? 'Single' : 'Double'} review is on for pairs handed out from now on`);
    } catch (e) {
      toast.error(`Could not change it: ${(e as Error).message}`);
    }
  };

  return (
    <section
      className={`mt-6 rounded-xl border p-4 shadow-sm sm:p-5 ${
        s.review_mode === 'single' ? 'border-amber-200 bg-amber-50/60' : 'border-gray-200 bg-white'
      }`}
    >
      <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
        Review mode for new pairs
        <InfoTip text="Applies to pairs handed out with “Assign me work” from now on. Pairs already handed out keep the mode they were given, so switching never changes work in progress." />
      </h2>
      {s.review_mode === 'single' && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> Single review is on. Switch back to double review once a
          second annotator is working.
        </p>
      )}
      <fieldset className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" disabled={update.isPending}>
        <legend className="sr-only">Review mode for new pairs</legend>
        {MODES.map((m) => (
          <label
            key={m.key}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 ${
              s.review_mode === m.key ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-400'
            }`}
          >
            <input
              type="radio"
              name="review-mode"
              className="mt-1 cursor-pointer"
              checked={s.review_mode === m.key}
              onChange={() => choose(m.key)}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">{m.label}</span>
              <span className="block text-xs text-gray-600">{m.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {s.updated_at && (
        <p className="mt-2 text-xs text-gray-500">
          Last changed {formatDateTime(s.updated_at)}
          {s.updated_by_name ? ` by ${s.updated_by_name}` : ''}
        </p>
      )}
    </section>
  );
}

// Each pair goes to two annotators: the same answer is final, anything else goes to an
// adjudicator.
function DoubleReview({ d }: Readonly<{ d: DoubleReviewCounts }>) {
  const rate = d.both_answered ? Math.round((d.agreed / d.both_answered) * 100) : null;
  return (
    <Section
      title="Double review"
      tip="Every pair is answered by two annotators. If they give the same answer it is final; otherwise an adjudicator decides."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon={<Users className="h-4 w-4" />} label="Waiting for 2nd annotator" value={d.awaiting_second}
          tip="Only one annotator holds these so far. The next person to click “Assign me work” gets them first." />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Agreed" value={d.agreed} tone="green"
          tip="Both annotators gave the same answer, so it went to BDRC as final." />
        <Stat icon={<Gavel className="h-4 w-4" />} label="Waiting for adjudication" value={d.adjudication_waiting} tone="amber"
          tip="The annotators disagreed (or one could not answer). No adjudicator has opened these yet." />
        <Stat icon={<Hourglass className="h-4 w-4" />} label="Being adjudicated" value={d.adjudication_in_progress} tone="amber"
          tip="An adjudicator has opened these and not answered yet." />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Adjudicated" value={d.adjudicated} tone="green"
          tip="Settled by an adjudicator and sent to BDRC." />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            Agreement
            <InfoTip text="Of the pairs both annotators have answered, how many they answered the same." />
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{rate == null ? '—' : `${rate}%`}</div>
          <div className="text-xs text-gray-500">
            {d.agreed} of {d.both_answered} pairs answered by both
          </div>
          <Link to="/dedup-admin/adjudications" className="mt-2 inline-block text-sm font-medium text-blue-700 hover:text-blue-800">
            See disputed pairs →
          </Link>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-1 text-xs text-gray-500">
            How disputes were settled
            <InfoTip text="What the adjudicator decided, compared with the two annotators' answers." />
          </div>
          <Counts rows={d.resolutions} label={(k) => RESOLUTION_LABEL[k] ?? k} empty="None settled yet." />
        </div>
      </div>
    </Section>
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
