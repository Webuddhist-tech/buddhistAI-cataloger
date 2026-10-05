import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Gavel, Hourglass, Inbox, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { AdminBatch, DoubleReviewCounts, ReviewMode, SyncHealth } from '../api/review';
import { useAdminOverview, useDedupSettings, useUpdateReviewMode } from '../hooks/useReview';
import { abstentionLabel, formatDateTime, formatNumber, issueLabel, resolutionLabel, verdictLabel } from '../utils';
import InfoTip from './InfoTip';


export default function AdminOverview() {
  const { t } = useTranslation();
  const overview = useAdminOverview();
  const o = overview.data;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-semibold text-gray-900">{t('dedup.admin.overview.title')}</h1>
      <p className="mt-1 text-sm text-gray-600">{t('dedup.admin.overview.subtitle')}</p>

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
            <Stat icon={<Inbox className="h-4 w-4" />} label={t('dedup.admin.overview.stat.givenOut')} value={o.totals.assigned}
              tip={t('dedup.admin.overview.stat.givenOutTip')} />
            <Stat icon={<CheckCircle2 className="h-4 w-4" />} label={t('dedup.admin.overview.stat.answered')} value={o.totals.done} tone="green"
              tip={t('dedup.admin.overview.stat.answeredTip')} />
            <Stat icon={<Hourglass className="h-4 w-4" />} label={t('dedup.admin.overview.stat.opened')} value={o.totals.in_progress} tone="amber"
              tip={t('dedup.admin.overview.stat.openedTip')} />
            <Stat icon={<CircleDashed className="h-4 w-4" />} label={t('dedup.admin.overview.stat.notOpened')} value={o.totals.not_started}
              tip={t('dedup.admin.overview.stat.notOpenedTip')} />
          </div>

          <DoubleReview d={o.double_review} />

          <Section
            eyebrow={t('dedup.admin.overview.section.batchesEyebrow')}
            title={t('dedup.admin.overview.section.batches')}
            tip={t('dedup.admin.overview.section.batchesTip')}
          >
            {o.batches.length === 0 ? (
              <p className="text-sm text-gray-500">{t('dedup.admin.overview.noBatches')}</p>
            ) : (
              <BatchTable batches={o.batches} />
            )}
          </Section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Section title={t('dedup.admin.overview.section.finalAnswers')} className="mt-4" tip={t('dedup.admin.overview.section.finalAnswersTip')}>
              <Counts rows={o.verdicts} label={verdictLabel} empty={t('dedup.admin.overview.noAnswers')} />
            </Section>
            <Section title={t('dedup.admin.overview.section.couldntAnswer')} className="mt-4" tip={t('dedup.admin.overview.section.couldntAnswerTip')}>
              <Counts rows={o.abstention_reasons} label={abstentionLabel} empty={t('dedup.admin.overview.noneSoFar')} />
            </Section>
            <Section title={t('dedup.admin.overview.section.dataProblems')} className="mt-4" tip={t('dedup.admin.overview.section.dataProblemsTip')}>
              <Counts rows={o.issues} label={issueLabel} empty={t('dedup.admin.overview.noneSoFar')} />
            </Section>
          </div>

          <SyncLine sync={o.sync} />
        </>
      )}
    </div>
  );
}

// Labels: dedup.admin.mode.<mode>.label / .help.
const MODES: ReviewMode[] = ['single', 'double'];

// How pairs handed out from now on are reviewed. Single while only one person annotates,
// so answers still reach BDRC; double once there are two or more.
function ReviewModeSwitch() {
  const { t } = useTranslation();
  const settings = useDedupSettings();
  const update = useUpdateReviewMode();
  const s = settings.data;
  if (!s) return null;

  const choose = async (mode: ReviewMode) => {
    if (mode === s.review_mode) return;
    try {
      await update.mutateAsync(mode);
      toast.success(t(`dedup.admin.mode.${mode}.switched`));
    } catch (e) {
      toast.error(t('dedup.admin.mode.failed', { error: (e as Error).message }));
    }
  };

  return (
    <section
      className={`mt-6 rounded-xl border p-4 shadow-sm sm:p-5 ${
        s.review_mode === 'single' ? 'border-amber-200 bg-amber-50/60' : 'border-gray-200 bg-white'
      }`}
    >
      <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
        {t('dedup.admin.mode.title')}
        <InfoTip text={t('dedup.admin.mode.titleTip')} />
      </h2>
      {s.review_mode === 'single' && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> {t('dedup.admin.mode.singleWarning')}
        </p>
      )}
      <fieldset className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" disabled={update.isPending}>
        <legend className="sr-only">{t('dedup.admin.mode.title')}</legend>
        {MODES.map((m) => (
          <label
            key={m}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 ${
              s.review_mode === m ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-400'
            }`}
          >
            <input
              type="radio"
              name="review-mode"
              className="mt-1 cursor-pointer"
              checked={s.review_mode === m}
              onChange={() => choose(m)}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">{t(`dedup.admin.mode.${m}.label`)}</span>
              <span className="block text-xs text-gray-600">{t(`dedup.admin.mode.${m}.help`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {s.updated_at && (
        <p className="mt-2 text-xs text-gray-500">
          {s.updated_by_name
            ? t('dedup.admin.mode.lastChangedBy', { when: formatDateTime(s.updated_at), who: s.updated_by_name })
            : t('dedup.admin.mode.lastChanged', { when: formatDateTime(s.updated_at) })}
        </p>
      )}
    </section>
  );
}

// Each pair goes to two annotators: the same answer is final, anything else goes to an
// adjudicator.
function DoubleReview({ d }: Readonly<{ d: DoubleReviewCounts }>) {
  const { t } = useTranslation();
  const rate = d.both_answered ? Math.round((d.agreed / d.both_answered) * 100) : null;
  return (
    <Section
      title={t('dedup.admin.overview.doubleReview')}
      tip={t('dedup.admin.overview.doubleReviewTip')}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon={<Users className="h-4 w-4" />} label={t('dedup.admin.overview.stat.awaitingSecond')} value={d.awaiting_second}
          tip={t('dedup.admin.overview.stat.awaitingSecondTip')} />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label={t('dedup.admin.overview.stat.agreed')} value={d.agreed} tone="green"
          tip={t('dedup.admin.overview.stat.agreedTip')} />
        <Stat icon={<Gavel className="h-4 w-4" />} label={t('dedup.admin.overview.stat.adjudicationWaiting')} value={d.adjudication_waiting} tone="amber"
          tip={t('dedup.admin.overview.stat.adjudicationWaitingTip')} />
        <Stat icon={<Hourglass className="h-4 w-4" />} label={t('dedup.admin.overview.stat.beingAdjudicated')} value={d.adjudication_in_progress} tone="amber"
          tip={t('dedup.admin.overview.stat.beingAdjudicatedTip')} />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label={t('dedup.admin.overview.stat.adjudicated')} value={d.adjudicated} tone="green"
          tip={t('dedup.admin.overview.stat.adjudicatedTip')} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            {t('dedup.admin.overview.agreement')}
            <InfoTip text={t('dedup.admin.overview.agreementTip')} />
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{rate == null ? '—' : `${formatNumber(rate)}%`}</div>
          <div className="text-xs text-gray-500">
            {t('dedup.admin.overview.agreedOf', { n: formatNumber(d.agreed), total: formatNumber(d.both_answered) })}
          </div>
          <Link to="/dedup-admin/adjudications" className="mt-2 inline-block text-sm font-medium text-blue-700 hover:text-blue-800">
            {t('dedup.admin.overview.seeDisputed')} →
          </Link>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-1 text-xs text-gray-500">
            {t('dedup.admin.overview.howSettled')}
            <InfoTip text={t('dedup.admin.overview.howSettledTip')} />
          </div>
          <Counts rows={d.resolutions} label={resolutionLabel} empty={t('dedup.admin.overview.noneSettled')} />
        </div>
      </div>
    </Section>
  );
}

// Shown only when a person is needed: answers are retried until BDRC takes them, and
// "failed" means BDRC rejected one, which a developer has to look at.
function SyncLine({ sync }: Readonly<{ sync: SyncHealth }>) {
  const { t } = useTranslation();
  const failed = sync.counts.failed ?? 0;
  if (failed > 0) {
    return (
      <div className="mt-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-900">
            {t('dedup.admin.sync.failed', { count: failed, n: formatNumber(failed) })}
          </p>
          <p className="mt-0.5 text-sm text-red-800">
            {t('dedup.admin.sync.failedHelp')}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sync.failed.map((f) => (
              <span
                key={f.decision_id}
                className="rounded-md border border-red-200 bg-white px-2 py-0.5 text-sm font-medium tabular-nums text-red-800"
              >
                {t('dedup.pairView.title', { id: f.item_id })}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return null;
}

// Like the Outliner's "Available Batches": per batch, how many pairs are left to hand out,
// being worked on, and done. Total and Done come from BDRC; BDRC does not know which
// pairs were handed out, so Available and In progress use the Cataloger's assignments.
function batchRow(b: AdminBatch) {
  const total = b.n_items;
  const done = b.status_counts.finalized ?? 0;
  const available = Math.max(0, total - b.pairs_handed_out);
  const inProgress = Math.max(0, total - available - done);
  return { total, available, inProgress, done };
}

function BatchTable({ batches }: Readonly<{ batches: AdminBatch[] }>) {
  const { t } = useTranslation();
  // Oldest first: the order "Assign me work" hands batches out in.
  const rows = [...batches]
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.batch_id.localeCompare(b.batch_id))
    .map((b, i) => ({ b, n: i + 1, ...batchRow(b) }));
  const sum = (k: 'total' | 'available' | 'inProgress' | 'done') => rows.reduce((n, r) => n + r[k], 0);
  const cols: { key: 'total' | 'available' | 'inProgress' | 'done'; tone?: string }[] = [
    { key: 'total' },
    { key: 'available', tone: 'text-blue-700' },
    { key: 'inProgress', tone: 'text-amber-700' },
    { key: 'done', tone: 'text-green-700' },
  ];
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3 font-medium">{t('dedup.admin.batch.table.batch')}</th>
            {cols.map((c) => (
              <th key={c.key} className="px-4 py-3 text-right font-medium">
                <span className="inline-flex items-center gap-1">
                  {t(`dedup.admin.batch.table.${c.key}`)}
                  <InfoTip text={t(`dedup.admin.batch.table.${c.key}Tip`)} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.b.batch_id}>
              <td className="px-4 py-3">
                {/* Numbered like the Outliner's batches; the full id on hover. */}
                <span className="font-medium text-gray-900 tabular-nums" title={r.b.batch_id}>
                  {formatNumber(r.n)}
                </span>
              </td>
              {cols.map((c) => (
                <td key={c.key} className={`px-4 py-3 text-right tabular-nums ${r[c.key] ? c.tone ?? 'text-gray-900' : 'text-gray-400'}`}>
                  {formatNumber(r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot className="border-t border-gray-200 bg-gray-50 font-medium">
            <tr>
              <td className="px-4 py-3 text-gray-700">{t('dedup.admin.batch.table.allBatches')}</td>
              {cols.map((c) => (
                <td key={c.key} className="px-4 py-3 text-right tabular-nums text-gray-900">
                  {formatNumber(sum(c.key))}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {sum('available') === 0 && (
        <p className="border-t border-gray-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          {t('dedup.admin.batch.table.noneLeft')}
        </p>
      )}
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
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone ? TONE[tone] : 'text-gray-900'}`}>{formatNumber(value)}</div>
    </div>
  );
}

// `eyebrow`: small heading above the title, as on the Outliner overview ("BEC Volume Batches").
function Section({ title, tip, eyebrow, children, className = 'mt-6' }: Readonly<{
  title: string;
  tip?: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <section className={`${className} rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5`}>
      {eyebrow && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-red-700">{eyebrow}</div>}
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
              {formatNumber(n)} <span className="text-xs text-gray-400">({formatNumber(Math.round((n / total) * 100))}%)</span>
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
