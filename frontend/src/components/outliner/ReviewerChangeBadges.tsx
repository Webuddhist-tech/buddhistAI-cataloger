import { useTranslation } from 'react-i18next';

interface ReviewerChangeBadgesProps {
  readonly segment: {
    created_by_id?: string | null;
    corrected_by_reviewer?: boolean | null;
  };
}

/** Marks segments the reviewer added or split/merged during review (reviewer and annotator views). */
export function ReviewerChangeBadges({ segment }: ReviewerChangeBadgesProps) {
  const { t } = useTranslation();
  return (
    <>
      {segment.created_by_id && (
        <span
          className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-300"
          title={t('outliner.reviewerChange.addedHint')}
        >
          {t('outliner.reviewerChange.added')}
        </span>
      )}
      {segment.corrected_by_reviewer && (
        <span
          className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300"
          title={t('outliner.reviewerChange.correctedHint')}
        >
          {t('outliner.reviewerChange.corrected')}
        </span>
      )}
    </>
  );
}
