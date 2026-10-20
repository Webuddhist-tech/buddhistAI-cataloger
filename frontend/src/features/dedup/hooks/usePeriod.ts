import { useSearchParams } from 'react-router-dom';

export type PeriodKey = 'all' | 'today' | '7d' | '30d' | 'custom';
export const PERIOD_KEYS: PeriodKey[] = ['all', 'today', '7d', '30d', 'custom'];

/** A period as sent to the backend: ISO instants, `until` excluded. Both unset = all time. */
export interface Period {
  since?: string;
  until?: string;
}

// Local midnight of a YYYY-MM-DD day, `addDays` later.
function dayStart(day: string, addDays = 0): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + addDays);
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** The chosen period, kept in the URL (`?period=7d`, or `?period=custom&from=…&to=…`)
 * so it survives a reload and carries over from the list to one person's page. */
export function usePeriod() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('period') as PeriodKey | null;
  const key: PeriodKey = raw && PERIOD_KEYS.includes(raw) ? raw : 'all';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const today = todayKey();
  let period: Period = {};
  if (key === 'today') period = { since: dayStart(today).toISOString() };
  else if (key === '7d') period = { since: dayStart(today, -6).toISOString() };
  else if (key === '30d') period = { since: dayStart(today, -29).toISOString() };
  else if (key === 'custom') {
    period = {
      since: from ? dayStart(from).toISOString() : undefined,
      // "To" is the last day included.
      until: to ? dayStart(to, 1).toISOString() : undefined,
    };
  }

  const update = (next: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );

  return {
    key,
    from,
    to,
    period,
    filtered: Boolean(period.since || period.until),
    /** The current query string, for links that should keep the period. */
    search: params.toString() ? `?${params.toString()}` : '',
    setKey: (k: PeriodKey) =>
      update(k === 'custom' ? { period: k } : { period: k === 'all' ? null : k, from: null, to: null }),
    /** Apply a custom range: both days, "to" included. */
    setRange: (fromDay: string, toDay: string) => update({ period: 'custom', from: fromDay, to: toDay }),
  };
}
