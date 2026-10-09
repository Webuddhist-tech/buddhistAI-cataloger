import { ExternalLink, Images } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WitnessCard } from '../api/review';
import { formatNumber, sourceLabel } from '../utils';

// OCR text can carry recognition errors, so reviewers weigh the source.
export function SourceBadge({ source }: Readonly<{ source: string | null | undefined }>) {
  const label = sourceLabel(source);
  if (!label) return null;
  const scanned = source !== 'tei';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        scanned ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'bg-sky-50 text-sky-800 ring-1 ring-sky-200'
      }`}
    >
      {label}
    </span>
  );
}

// With `onShowScans` the scans open in the page's side panel; without it, on BDRC in a new tab.
export function WitnessMeta({
  card,
  onShowScans,
}: Readonly<{ card: Pick<WitnessCard, 'etext_source' | 'text_length' | 'image_url'>; onShowScans?: () => void }>) {
  const { t } = useTranslation();
  const linkClass = 'inline-flex items-center gap-1 font-medium text-blue-600 underline-offset-2 hover:text-blue-800 hover:underline';
  let scans = <span className="italic text-gray-400">{t('dedup.witness.noScan')}</span>;
  if (card.image_url && onShowScans) {
    scans = (
      <button onClick={onShowScans} className={`cursor-pointer ${linkClass}`}>
        <Images className="h-3.5 w-3.5" /> {t('dedup.witness.scannedPages')}
      </button>
    );
  } else if (card.image_url) {
    scans = (
      <a href={card.image_url} target="_blank" rel="noreferrer" className={linkClass}>
        {t('dedup.witness.scannedPages')} <ExternalLink className="h-3.5 w-3.5" />
      </a>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-500">
      <SourceBadge source={card.etext_source} />
      <span className="tabular-nums">{t('dedup.witness.characters', { n: formatNumber(card.text_length ?? 0) })}</span>
      {scans}
    </div>
  );
}
