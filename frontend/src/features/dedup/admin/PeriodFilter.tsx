import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PERIOD_KEYS, type PeriodKey, type usePeriod } from '../hooks/usePeriod';

// "2026-10-01" → "1 Oct 2026", in the viewer's language.
function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export default function PeriodFilter({ state }: Readonly<{ state: ReturnType<typeof usePeriod> }>) {
  const { t } = useTranslation();
  // The custom dates open below "Custom"; clicking "Custom" again closes them.
  const [open, setOpen] = useState(state.key === 'custom' && !(state.from && state.to));
  // Custom dates are a draft until Apply, so picking "From" alone does not reload the list.
  const [from, setFrom] = useState(state.from);
  const [to, setTo] = useState(state.to);
  useEffect(() => {
    setFrom(state.from);
    setTo(state.to);
  }, [state.from, state.to]);

  const applied = state.key === 'custom' && Boolean(state.from && state.to);
  const canApply = Boolean(from && to && from <= to) && (from !== state.from || to !== state.to);

  const choose = (k: PeriodKey) => {
    if (k !== 'custom') {
      setOpen(false);
      state.setKey(k);
      return;
    }
    if (state.key !== 'custom') {
      state.setKey('custom');
      setOpen(true);
      return;
    }
    // Closing without a range applied goes back to all time, so the list matches the buttons.
    if (open && !applied) state.setKey('all');
    setOpen(!open);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex max-w-full flex-wrap rounded-md bg-gray-100 p-1" role="radiogroup" aria-label={t('dedup.admin.period.label')}>
        {PERIOD_KEYS.map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={state.key === k}
            aria-expanded={k === 'custom' ? open : undefined}
            onClick={() => choose(k)}
            className={`inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded px-3 py-1 text-sm font-medium transition-colors ${
              state.key === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {k === 'custom' && applied
              ? `${dayLabel(state.from)} – ${dayLabel(state.to)}`
              : t(`dedup.admin.period.${k}`)}
            {k === 'custom' && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />}
          </button>
        ))}
      </div>
      {open && (
        <form
          className="flex flex-wrap items-center gap-2 text-sm text-gray-600"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canApply) return;
            state.setRange(from, to);
            setOpen(false);
          }}
        >
          <label className="inline-flex items-center gap-1.5">
            {t('dedup.admin.period.from')}
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
            />
          </label>
          <label className="inline-flex items-center gap-1.5">
            {t('dedup.admin.period.to')}
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
            />
          </label>
          <Button type="submit" size="sm" className="cursor-pointer" disabled={!canApply}>
            {t('dedup.admin.period.apply')}
          </Button>
        </form>
      )}
    </div>
  );
}
