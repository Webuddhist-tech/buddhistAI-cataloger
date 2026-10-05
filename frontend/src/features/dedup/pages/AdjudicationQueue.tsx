import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n/config';
import { useUser } from '@/hooks/useUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AdjudicationItem, AnnotatorAnswer, MyItemsState } from '../api/review';
import { useAdjudicationQueue, useBatchName } from '../hooks/useReview';
import { answerLabel, formatDateTime, formatNumber, verdictLabel } from '../utils';

const STATE_TABS: MyItemsState[] = ['open', 'done', 'all'];

const VERDICT_STYLE: Record<string, string> = {
  same: 'bg-green-50 text-green-700',
  different: 'bg-red-50 text-red-700',
};

type RowStatus = 'done' | 'progress' | 'new';
function rowStatus(it: AdjudicationItem): RowStatus {
  if (it.adjudication.completed_at) return 'done';
  return it.adjudication.first_opened_at ? 'progress' : 'new';
}
// Labels: dedup.adjudicationQueue.status.<RowStatus>.
const STATUS_STYLE: Record<RowStatus, string> = {
  done: 'bg-green-50 text-green-700',
  progress: 'bg-amber-50 text-amber-800',
  new: 'bg-gray-100 text-gray-600',
};

/** How long a pair has been waiting, e.g. "3 h" or "2 d". */
function waited(iso: string): string {
  const since = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).getTime();
  const h = Math.max(0, Math.floor((Date.now() - since) / 3_600_000));
  if (h < 1) return i18n.t('dedup.adjudicationQueue.waitedUnderHour');
  if (h < 48) return i18n.t('dedup.adjudicationQueue.waitedHours', { n: formatNumber(h) });
  return i18n.t('dedup.adjudicationQueue.waitedDays', { n: formatNumber(Math.floor(h / 24)) });
}

function VerdictChip({ answer }: Readonly<{ answer: AnnotatorAnswer }>) {
  const label = answerLabel(answer.verdict);
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
        (answer.verdict && VERDICT_STYLE[answer.verdict]) || 'bg-gray-100 text-gray-700'
      }`}
    >
      {label}
    </span>
  );
}

function Dispute({ item }: Readonly<{ item: AdjudicationItem }>) {
  const { t } = useTranslation();
  const [first, second] = item.annotations;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {first && <VerdictChip answer={first} />}
      <span className="text-xs text-gray-400">{t('dedup.adjudicationQueue.vs')}</span>
      {second && <VerdictChip answer={second} />}
    </span>
  );
}

// Disputed pairs for adjudicators (reviewers, and admins on pairs they did not annotate).
export default function AdjudicationQueue() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const batchName = useBatchName();
  const { user } = useUser();
  const [state, setState] = useState<MyItemsState>('open');
  const [q, setQ] = useState('');
  const items = useAdjudicationQueue(state);
  const allItems = useAdjudicationQueue('all');
  const numberOf = useMemo(
    () => new Map((allItems.data ?? []).map((it, i) => [it.item_id, i + 1])),
    [allItems.data],
  );

  const loaded = useMemo(() => items.data ?? [], [items.data]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return loaded;
    return loaded.filter(
      (it) =>
        (it.evidence.a?.title_bo ?? '').toLowerCase().includes(needle) ||
        (it.evidence.b?.title_bo ?? '').toLowerCase().includes(needle),
    );
  }, [loaded, q]);
  const openItem = (itemId: number) => navigate(`/dedup/adjudicate/${itemId}`);

  let emptyText = t('dedup.adjudicationQueue.empty');
  if (q) emptyText = t('dedup.common.noTitleMatch', { q });
  else if (state === 'open') emptyText = t('dedup.adjudicationQueue.emptyToDo');

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('dedup.adjudicationQueue.title')}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {t('dedup.adjudicationQueue.subtitle')}
          </p>
        </div>
        {user?.role === 'admin' && (
          <Button asChild variant="outline" className="cursor-pointer">
            <Link to="/dedup">
              <ListChecks className="h-4 w-4" /> {t('dedup.review.myItems')}
            </Link>
          </Button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md bg-gray-100 p-1" role="tablist">
          {STATE_TABS.map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={state === key}
              onClick={() => setState(key)}
              className={`cursor-pointer rounded px-3 py-1 text-sm font-medium transition-colors ${
                state === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t(`dedup.queue.tab.${key}`)}
            </button>
          ))}
        </div>
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('dedup.common.searchTitles')}
          className="w-full sm:w-72"
        />
      </div>

      {items.error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {t('dedup.adjudicationQueue.loadFailed', { error: items.error.message })}
        </div>
      )}

      <ul className="space-y-2 sm:hidden">
        {items.isLoading &&
          Array.from({ length: 4 }).map((_, i) => <li key={i} className="h-28 animate-pulse rounded-lg bg-gray-100" />)}
        {rows.map((it) => {
          const status = rowStatus(it);
          return (
            <li key={it.item_id}>
              <button
                onClick={() => openItem(it.item_id)}
                className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm active:bg-gray-50"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span className="tabular-nums" title={t('dedup.common.itemId', { id: it.item_id })}>
                    {t('dedup.common.number')} {numberOf.get(it.item_id) ?? '—'} · {batchName(it.batch_id)}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 font-medium ${STATUS_STYLE[status]}`}>
                    {t(`dedup.adjudicationQueue.status.${status}`)}
                  </span>
                </div>
                <div className="mt-2 break-words font-monlam text-base leading-relaxed text-gray-900">
                  {it.evidence.a?.title_bo || '—'}
                </div>
                <div className="break-words font-monlam text-sm leading-relaxed text-gray-500">
                  {it.evidence.b?.title_bo || '—'}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Dispute item={it} />
                  <span className="text-xs text-gray-500">{t('dedup.adjudicationQueue.waiting', { time: waited(it.adjudication.created_at) })}</span>
                </div>
              </button>
            </li>
          );
        })}
        {!items.isLoading && rows.length === 0 && (
          <li className="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">{emptyText}</li>
        )}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm sm:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-16 px-4 py-3 font-medium">{t('dedup.common.number')}</th>
              <th className="px-4 py-3 font-medium">{t('dedup.common.texts')}</th>
              <th className="px-4 py-3 font-medium">{t('dedup.adjudicationQueue.annotatorsSaid')}</th>
              <th className="px-4 py-3 font-medium">{t('dedup.common.status')}</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">{t('dedup.review.finalAnswer')}</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">{t('dedup.adjudicationQueue.waitingSince')}</th>
              <th className="w-32 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-4 py-3">
                    <div className="h-10 animate-pulse rounded bg-gray-100" />
                  </td>
                </tr>
              ))}
            {rows.map((it) => {
              const status = rowStatus(it);
              const done = status === 'done';
              return (
                <tr key={it.item_id} onClick={() => openItem(it.item_id)} className="cursor-pointer transition-colors hover:bg-gray-50">
                  <td className="px-4 py-4 tabular-nums text-gray-500" title={t('dedup.common.itemId', { id: it.item_id })}>
                    {numberOf.get(it.item_id) ?? '—'}
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-monlam text-base leading-relaxed text-gray-900">{it.evidence.a?.title_bo || '—'}</div>
                    <div className="font-monlam text-sm leading-relaxed text-gray-500">{it.evidence.b?.title_bo || '—'}</div>
                  </td>
                  <td className="px-4 py-4">
                    <Dispute item={it} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
                      {t(`dedup.adjudicationQueue.status.${status}`)}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 md:table-cell">
                    {it.verdict ? (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          VERDICT_STYLE[it.verdict] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {it.verdict === 'not_sure' ? t('dedup.adjudicationQueue.unresolved') : verdictLabel(it.verdict)}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td
                    className="hidden whitespace-nowrap px-4 py-4 text-gray-600 lg:table-cell"
                    title={formatDateTime(it.adjudication.created_at)}
                  >
                    {waited(it.adjudication.created_at)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openItem(it.item_id);
                      }}
                      className={
                        done
                          ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
                          : 'border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800'
                      }
                    >
                      {done ? (
                        <>
                          <Eye className="h-3.5 w-3.5" /> {t('dedup.common.view')}
                        </>
                      ) : (
                        <>
                          {t('dedup.adjudicationQueue.adjudicate')} <ArrowRight className="h-3.5 w-3.5" />
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items.isLoading && rows.length === 0 && <p className="py-12 text-center text-sm text-gray-500">{emptyText}</p>}
      </div>

      <div className="mt-3 text-sm text-gray-600">
        {q ? (
          <>
            {t('dedup.common.matchesIn', { count: rows.length, n: formatNumber(rows.length), total: formatNumber(loaded.length) })}
          </>
        ) : (
          <>
            {t('dedup.adjudicationQueue.pairCount', { count: loaded.length, n: formatNumber(loaded.length) })}
          </>
        )}
      </div>
    </div>
  );
}
