import { ExternalLink } from 'lucide-react';
import type { WitnessCard } from '../api/review';
import { sourceLabel } from '../utils';

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

export function WitnessMeta({ card }: Readonly<{ card: Pick<WitnessCard, 'etext_source' | 'text_length' | 'image_url'> }>) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-500">
      <SourceBadge source={card.etext_source} />
      <span className="tabular-nums">{(card.text_length ?? 0).toLocaleString()} characters</span>
      {card.image_url ? (
        <a
          href={card.image_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-blue-600 underline-offset-2 hover:text-blue-800 hover:underline"
        >
          Scanned pages <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <span className="italic text-gray-400">no scan</span>
      )}
    </div>
  );
}
