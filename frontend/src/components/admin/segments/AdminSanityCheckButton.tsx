import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SanityCheckFindingsList } from '@/components/outliner/SanityCheckWarningContent';
import type { SanityCheckReport } from '@/api/outliner';

interface AdminSanityCheckButtonProps {
  /** Shared check result (see `useAdminSanityCheck`), also used by the per-segment icons. */
  readonly report: SanityCheckReport | null;
  readonly isChecking: boolean;
  readonly checkFailed: boolean;
  readonly onRunCheck: () => void;
  /** Full document text, for the text each finding flags. */
  readonly documentContent: string;
  readonly disabled?: boolean;
  readonly onNavigateToSegment?: (segmentId: string) => void;
}

/**
 * Toolbar trigger and results dialog for the reviewer's segmentation sanity check.
 * The reviewer pages don't mount the outliner's Document/Actions providers, so the shared
 * findings list gets the document text and navigation callback as props. Read-only.
 */
function AdminSanityCheckButton({
  report,
  isChecking,
  checkFailed,
  onRunCheck,
  documentContent,
  disabled = false,
  onNavigateToSegment,
}: AdminSanityCheckButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const hasFindings = (report?.flagged_count ?? 0) > 0;
  const hasRunCheck = report != null;

  function openDialog() {
    setOpen(true);
    onRunCheck();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        title={t('outliner.workspace.sanityCheck.buttonTitle')}
        className="shrink-0 flex items-center gap-1.5"
        onClick={openDialog}
      >
        {isChecking ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ShieldCheck
            className={`w-4 h-4 ${hasFindings ? 'text-red-600' : 'text-green-600'}`}
          />
        )}
        <span className="hidden sm:inline">{t('outliner.workspace.sanityCheck.button')}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={hasFindings ? 'sm:max-w-xl' : undefined}>
          <DialogHeader>
            <DialogTitle>{t('outliner.workspace.sanityCheck.dialogTitle')}</DialogTitle>
            <DialogDescription>
              {hasFindings && report
                ? t('outliner.workspace.sanityCheck.resultsDescription', {
                    blockerCount: report.blocker_count,
                    advisoryCount: report.advisory_count,
                  })
                : t('outliner.workspace.sanityCheck.noIssuesDescription')}
            </DialogDescription>
          </DialogHeader>

          {isChecking && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('outliner.submitReview.sanityWarning.checking')}
            </div>
          )}

          {!isChecking && checkFailed && (
            <p className="text-xs text-muted-foreground">
              {t('outliner.workspace.sanityCheck.checkFailed')}
            </p>
          )}

          {!isChecking && hasRunCheck && !checkFailed && !hasFindings && (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4" />
              {t('outliner.workspace.sanityCheck.noIssuesTitle')}
            </div>
          )}

          {hasFindings && report && (
            <SanityCheckFindingsList
              findings={report.findings}
              textContent={documentContent}
              onNavigateToSegment={onNavigateToSegment}
              onNavigate={() => setOpen(false)}
            />
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AdminSanityCheckButton;
