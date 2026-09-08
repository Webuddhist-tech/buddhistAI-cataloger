import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { sanityFindingsTooltip } from '@/components/outliner/SanityCheckWarningContent';
import type { SanityCheckFinding } from '@/api/outliner';

interface AdminSanityFindingIndicatorProps {
  readonly findings: SanityCheckFinding[] | undefined;
  /** Full document text, for the tooltip's excerpts. */
  readonly textContent: string;
}

/**
 * Per-segment sanity-check alert: red when any finding on the segment is a blocker, amber
 * when all are advisory. Renders nothing until a check has flagged this segment.
 */
function AdminSanityFindingIndicator({
  findings,
  textContent,
}: AdminSanityFindingIndicatorProps) {
  const { t } = useTranslation();
  if (!findings || findings.length === 0) return null;
  const hasBlocker = findings.some((finding) => finding.severity === 'blocker');
  return (
    <span title={sanityFindingsTooltip(findings, t, textContent)}>
      <AlertCircle
        className={`h-4 w-4 shrink-0 ${hasBlocker ? 'text-red-500' : 'text-amber-500'}`}
      />
    </span>
  );
}

export default AdminSanityFindingIndicator;
