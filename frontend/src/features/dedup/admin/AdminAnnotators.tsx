import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Annotator } from '../api/review';
import { useAnnotators } from '../hooks/useReview';
import i18n from '@/i18n/config';
import { useTranslation } from 'react-i18next';
import { answerGroups, formatDateTime, formatDuration, formatNumber } from '../utils';
import InfoTip from './InfoTip';

export default function AdminAnnotators() {
  const { t } = useTranslation();
  const annotators = useAnnotators();
  const navigate = useNavigate();
  const open = (a: Annotator) => navigate(`/dedup-admin/annotators/${encodeURIComponent(a.user_id)}`);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('dedup.admin.nav.annotators')}</h1>
          <p className="mt-1 text-sm text-gray-600">{t('dedup.admin.annotators.subtitle')}</p>
        </div>
        {/* What the colours in "Answered" mean: always in sight, since hover does not work on phones. */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600" aria-label={t('dedup.admin.annotators.legend')}>
          {answerGroups({}).map((g) => (
            <li key={g.label} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${g.bar}`} /> {g.label}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gray-200" /> {t('dedup.admin.batch.bdrcStatus.new')}
          </li>
        </ul>
      </div>

      {annotators.error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {t('dedup.admin.annotators.loadFailed', { error: annotators.error.message })}
        </div>
      )}
      {annotators.isLoading && <div className="mt-6 h-40 animate-pulse rounded-xl bg-gray-100" />}
      {annotators.data?.length === 0 && (
        <p className="mt-6 rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">
          {t('dedup.admin.annotators.nobody')}
        </p>
      )}

      {/* Phones and tablets */}
      <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:hidden">
        {annotators.data?.map((a) => (
          <li key={a.user_id}>
            <button
              onClick={() => open(a)}
              className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm active:bg-gray-50"
            >
              <Person a={a} />
              <div className="mt-3">
                <Progress a={a} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                <span>{t('dedup.admin.annotators.card.opened', { n: formatNumber(a.in_progress) })}</span>
                <span>{t('dedup.admin.annotators.card.notOpened', { n: formatNumber(a.not_started) })}</span>
                <span>{t('dedup.admin.annotators.card.total', { time: formatDuration(a.total_active_seconds) })}</span>
                <span>{t('dedup.admin.annotators.card.perPair', { time: formatDuration(a.avg_active_seconds) })}</span>
                <span>{t('dedup.admin.annotators.card.agreed', { value: agreement(a) })}</span>
                {a.adjudicated > 0 && (
                  <span>{t('dedup.admin.annotators.card.adjudicated', { n: formatNumber(a.adjudicated) })}</span>
                )}
                <span>{t('dedup.admin.annotators.card.active', { when: formatDateTime(a.last_active) })}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {/* Laptops and up */}
      {annotators.data && annotators.data.length > 0 && (
        <div className="mt-6 hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm lg:block">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="rounded-tl-lg px-4 py-3 font-medium">{t('dedup.admin.annotators.col.annotator')}</th>
                <th className="px-3 py-3 font-medium">
                  <span className="inline-flex items-center gap-1">
                    {t('dedup.admin.annotators.col.answered')}
                    <InfoTip text={t('dedup.admin.annotators.col.answeredTip')} />
                  </span>
                </th>

                <th className="px-3 py-3 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    {t('dedup.admin.annotators.col.opened')} <InfoTip text={t('dedup.admin.annotators.col.openedTip')} />
                  </span>
                </th>
                <th className="px-3 py-3 text-right font-medium">{t('dedup.admin.annotators.col.notOpened')}</th>
                <th className="px-3 py-3 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    {t('dedup.admin.annotators.col.totalTime')}
                    <InfoTip
                      text={t('dedup.admin.annotators.col.totalTimeTip')}
                    />
                  </span>
                </th>
                <th className="px-3 py-3 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    {t('dedup.admin.annotators.col.perPair')}
                    <InfoTip text={t('dedup.admin.annotators.col.perPairTip')} />
                  </span>
                </th>
                <th className="px-3 py-3 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    {t('dedup.admin.overview.agreement')}
                    <InfoTip text={t('dedup.admin.annotators.col.agreementTip')} />
                  </span>
                </th>
                <th className="px-3 py-3 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    {t('dedup.admin.overview.stat.adjudicated')} <InfoTip text={t('dedup.admin.annotators.col.adjudicatedTip')} />
                  </span>
                </th>
                <th className="px-3 py-3 font-medium">{t('dedup.admin.annotators.col.lastActive')}</th>
                <th className="w-8 rounded-tr-lg px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {annotators.data.map((a) => (
                <tr key={a.user_id} onClick={() => open(a)} className="cursor-pointer hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Person a={a} />
                  </td>
                  <td className="w-56 px-3 py-3">
                    <Progress a={a} />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-amber-700">{a.in_progress}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-600">{a.not_started}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                    {formatDuration(a.total_active_seconds || null)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatDuration(a.avg_active_seconds)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{agreement(a)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-600">{a.adjudicated ? formatNumber(a.adjudicated) : '—'}</td>
                  <td className="px-3 py-3 text-xs text-gray-500">
                    <LastActive iso={a.last_active} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ArrowRight className="ml-auto h-4 w-4 text-blue-700" aria-label={t('dedup.admin.annotators.open', { name: a.name || a.email })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Date on one line, time on the next, so the column stays narrow. */
function LastActive({ iso }: Readonly<{ iso: string | null }>) {
  if (!iso) return <>—</>;
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  return (
    <span title={formatDateTime(iso)} className="whitespace-nowrap">
      {d.toLocaleDateString(undefined, { dateStyle: 'medium' })}
      <br />
      {d.toLocaleTimeString(undefined, { timeStyle: 'short' })}
    </span>
  );
}

/** "8 of 10 (80%)", or "—" before any pair has both answers. */
function agreement(a: Annotator): string {
  if (!a.paired) return '—';
  return i18n.t('dedup.admin.annotators.agreementValue', {
    n: formatNumber(a.agreed),
    total: formatNumber(a.paired),
    pct: formatNumber(Math.round((a.agreed / a.paired) * 100)),
  });
}

// Answered out of given, as one bar split by answer (same, different, …); the light
// rest is not answered yet. One line below names the counts in the same colours.
function Progress({ a }: Readonly<{ a: Annotator }>) {
  const { t } = useTranslation();
  const groups = answerGroups(a.answers).filter((g) => g.n > 0);
  const total = Math.max(a.assigned, groups.reduce((s, g) => s + g.n, 0));
  const hover = groups.map((g) => `${g.label}: ${formatNumber(g.n)}${g.detail ? ` (${g.detail})` : ''}`).join('\n');
  return (
    <div title={hover || undefined}>
      <div className="text-sm text-gray-700">
        {t('dedup.admin.annotators.doneOf', { n: formatNumber(a.done), total: formatNumber(a.assigned) })}
      </div>
      <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        {groups.map((g) => (
          <span key={g.label} className={`h-full ${g.bar}`} style={{ width: `${(g.n / (total || 1)) * 100}%` }} />
        ))}
      </div>
      {groups.length > 0 && (
        // Colour + dot per number; names are in the legend above the table and on hover.
        <div className="mt-1 flex flex-wrap gap-x-2.5 text-xs">
          {groups.map((g) => (
            <span key={g.label} className={`inline-flex items-center gap-1 ${g.text}`}>
              <span className={`h-2 w-2 rounded-full ${g.bar}`} aria-hidden="true" />
              <span className="tabular-nums font-medium">{formatNumber(g.n)}</span>
              <span className="sr-only">{g.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Person({ a }: Readonly<{ a: Pick<Annotator, 'name' | 'email' | 'picture' | 'has_access'> & { role?: string | null } }>) {
  const { t } = useTranslation();
  const initial = (a.name || a.email || '?').charAt(0).toUpperCase();
  return (
    <div className="flex min-w-0 items-center gap-3">
      {a.picture ? (
        <img src={a.picture} alt="" className="h-8 w-8 shrink-0 rounded-full" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-700">
          {initial}
        </span>
      )}
      <div className="min-w-0">
        <div className="truncate font-medium text-gray-900">{a.name || a.email}</div>
        <div className="flex items-center gap-2 truncate text-xs text-gray-500">
          {a.name && <span className="truncate">{a.email}</span>}
          {a.role === 'reviewer' && (
            <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">{t('dedup.admin.annotators.adjudicatorBadge')}</span>
          )}
          {!a.has_access && (
            <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">{t('dedup.admin.annotators.accessRemoved')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
