import { Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** The read-only page of a pair: no answers, opens for anyone logged in. */
function pairLink(itemId: number): string {
  return `${window.location.origin}/dedup/pair/${itemId}`;
}

// For pasting a pair into a spreadsheet or a message.
export default function CopyPairLink({ itemId }: Readonly<{ itemId: number }>) {
  const { t } = useTranslation();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pairLink(itemId));
      toast.success(t('dedup.copyLink.copied'));
    } catch {
      toast.error(t('dedup.copyLink.failed', { link: pairLink(itemId) }));
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      className="cursor-pointer"
      onClick={copy}
      title={t('dedup.copyLink.title')}
      aria-label={t('dedup.copyLink.ariaLabel')}
    >
      <Link2 className="h-4 w-4" /> <span className="hidden sm:inline">{t('dedup.copyLink.label')}</span>
    </Button>
  );
}
