import type React from 'react';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { useOptionalDocument, useOptionalActions } from './contexts';
import type { SanityCheckFinding } from '@/api/outliner';

interface SanityCheckFindingsListProps {
  findings: SanityCheckFinding[];
  /** Called after navigating to a finding's segment, so the host can close its dialog. */
  onNavigate?: () => void;
  /** Defaults to DocumentContext; pass explicitly where that provider isn't mounted. */
  textContent?: string;
  /** Defaults to ActionsContext; findings aren't clickable when neither is available. */
  onNavigateToSegment?: (segmentId: string) => void;
}

const MAX_FLAGGED_LENGTH = 160;
/** Surrounding document text shown on each side of the flagged run. */
const EXCERPT_CONTEXT = 60;

export interface SanityFindingExcerpt {
  before: string;
  /** Exactly the run the checker's `char_span` covers. */
  flagged: string;
  after: string;
}

/**
 * Split the document text around a finding's `char_span` so the flagged run can be
 * highlighted in place rather than shown as bare offsets. Context is included on both
 * sides so the run reads as Tibetan rather than a fragment; `…` marks where text was cut.
 */
export function sanityFindingExcerpt(
  finding: SanityCheckFinding,
  textContent: string
): SanityFindingExcerpt | null {
  const { start, end } = finding.char_span;
  if (!textContent || start > end) return null;

  const spanStart = Math.max(0, Math.min(start, textContent.length));
  const spanEnd = Math.max(spanStart, Math.min(end, textContent.length));

  const flaggedFull = textContent.slice(spanStart, spanEnd);
  const isTruncated = flaggedFull.length > MAX_FLAGGED_LENGTH;
  const flagged = isTruncated
    ? `${flaggedFull.slice(0, MAX_FLAGGED_LENGTH).trimEnd()}…`
    : flaggedFull;

  const contextStart = Math.max(0, spanStart - EXCERPT_CONTEXT);
  const before = textContent.slice(contextStart, spanStart);
  // A truncated run already ends in an ellipsis; trailing context would misrepresent it.
  const contextEnd = isTruncated
    ? spanEnd
    : Math.min(textContent.length, spanEnd + EXCERPT_CONTEXT);
  const after = isTruncated ? '' : textContent.slice(spanEnd, contextEnd);

  if (!before.trim() && !after.trim() && !flagged.trim()) return null;

  return {
    before: `${contextStart > 0 ? '…' : ''}${before}`,
    flagged,
    after: `${after}${!isTruncated && contextEnd < textContent.length ? '…' : ''}`,
  };
}

/** Plain-text summary of findings for a native `title` tooltip (no tooltip lib in this codebase). */
export function sanityFindingsTooltip(
  findings: SanityCheckFinding[],
  t: (key: string, options?: Record<string, unknown>) => string,
  textContent: string
): string {
  return findings
    .map((finding) => {
      const severity = t(`outliner.submitReview.sanityWarning.severity.${finding.severity}`);
      const errorType = t(`outliner.submitReview.sanityWarning.errorType.${finding.error_type}`, {
        defaultValue: finding.error_type,
      });
      const excerpt = sanityFindingExcerpt(finding, textContent);
      if (!excerpt) return `${severity} · ${errorType}`;
      // Plain text can't carry a highlight, so delimit the flagged run inline.
      return `${severity} · ${errorType}: ${excerpt.before}»${excerpt.flagged}«${excerpt.after}`;
    })
    .join('\n\n');
}

/**
 * Scrollable list of sanity-check findings: severity, error type, and the text each one
 * flags — not the checker's raw rule output and character offsets, which readers cannot
 * act on. Clicking a finding selects and scrolls to its segment.
 */
export function SanityCheckFindingsList({
  findings,
  onNavigate,
  textContent: textContentProp,
  onNavigateToSegment: onNavigateToSegmentProp,
}: Readonly<SanityCheckFindingsListProps>) {
  const { t } = useTranslation();
  const documentContext = useOptionalDocument();
  const actionsContext = useOptionalActions();
  const textContent = textContentProp ?? documentContext?.textContent ?? '';
  const onNavigateToSegment = onNavigateToSegmentProp ?? actionsContext?.onNavigateToSegment;

  function goToFinding(segmentId: string) {
    if (!onNavigateToSegment) return;
    onNavigateToSegment(segmentId);
    onNavigate?.();
  }

  return (
    <div className="max-h-64 overflow-y-auto space-y-2 -mx-1 px-1">
      {findings.map((finding, index) => {
        const excerpt = sanityFindingExcerpt(finding, textContent);
        const canNavigate = Boolean(onNavigateToSegment && finding.segment_id);

        return (
          <div
            key={`${finding.segment_id}-${finding.char_span.start}-${index}`}
            className={`rounded-md border p-3 text-sm space-y-1 ${
              canNavigate ? 'cursor-pointer hover:bg-accent' : ''
            }`}
            {...(canNavigate && {
              role: 'button',
              tabIndex: 0,
              title: t('outliner.submitReview.sanityWarning.goToSegment'),
              onClick: () => goToFinding(finding.segment_id),
              onKeyDown: (event: React.KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  goToFinding(finding.segment_id);
                }
              },
            })}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={finding.severity === 'blocker' ? 'destructive' : 'outline'}>
                {t(`outliner.submitReview.sanityWarning.severity.${finding.severity}`)}
              </Badge>
              <span className="text-muted-foreground">
                {t(`outliner.submitReview.sanityWarning.errorType.${finding.error_type}`, {
                  defaultValue: finding.error_type,
                })}
              </span>
            </div>
            {excerpt && (
              <p className="wrap-break-word leading-relaxed">
                <span className="text-muted-foreground">{excerpt.before}</span>
                <mark className="bg-amber-200 text-foreground rounded-sm px-0.5">
                  {excerpt.flagged}
                </mark>
                <span className="text-muted-foreground">{excerpt.after}</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
