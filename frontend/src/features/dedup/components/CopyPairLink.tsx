import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** The read-only page of a pair: no answers, opens for anyone logged in. */
function pairLink(itemId: number): string {
  return `${window.location.origin}/dedup/pair/${itemId}`;
}

// For pasting a pair into a spreadsheet or a message.
export default function CopyPairLink({ itemId }: Readonly<{ itemId: number }>) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pairLink(itemId));
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy. Copy it from here: ' + pairLink(itemId));
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      className="cursor-pointer"
      onClick={copy}
      title="Copy a link to this pair (read-only: no answers, no buttons)"
      aria-label="Copy link to this pair"
    >
      <Link2 className="h-4 w-4" /> <span className="hidden sm:inline">Copy link</span>
    </Button>
  );
}
