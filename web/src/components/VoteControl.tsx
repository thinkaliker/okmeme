import { ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { can } from '@/domain/tier';
import type { Link } from '@/domain/link';
import { useSession } from '@/session/SessionProvider';
import { t } from '@/i18n/t';
import { cn, formatScore } from '@/lib/utils';

interface VoteControlProps {
  link: Link;
  onVote: (on: boolean) => void;
  pending?: boolean;
  /** Column is the row layout's leading control; row is for inline placement. */
  orientation?: 'row' | 'column';
}

/**
 * One true global score, shown identically to everyone — see GAPS.md for what
 * that concedes. There is no rank here and never will be: an absolute position
 * in a list is a count of the rows above it, including the hidden ones.
 */
export function VoteControl({ link, onVote, pending = false, orientation = 'row' }: VoteControlProps) {
  const { tier } = useSession();
  const allowed = can.vote(tier);
  const voted = link.viewerVote === 1;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={voted}
      aria-label={voted ? t('link.unvote') : t('link.vote')}
      disabled={!allowed || pending}
      onClick={() => onVote(!voted)}
      className={cn(
        'tabular-nums',
        orientation === 'column'
          ? 'h-auto shrink-0 flex-col gap-0.5 px-2 py-1.5 text-xs compact:px-1.5 compact:py-1'
          : 'gap-1',
        voted && 'bg-primary text-primary-foreground hover:bg-primary/90',
        !voted && 'bg-secondary/60',
      )}
    >
      <ChevronUp aria-hidden="true" />
      <span>{formatScore(link.score)}</span>
      <span className="sr-only">{t('link.points')}</span>
    </Button>
  );
}
