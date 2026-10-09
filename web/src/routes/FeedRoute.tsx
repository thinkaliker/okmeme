import { useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { LayoutGrid, Rows3 } from 'lucide-react';
import { feed, me as meApi } from '@/api/endpoints';
import { Feed } from '@/components/Feed';
import { Button } from '@/components/ui/button';
import { PAGE_SIZE } from '@/config';
import { useDisplay } from '@/display/DisplayProvider';
import type { FeedSort } from '@/domain/link';
import type { FeedView } from '@/domain/user';
import { t } from '@/i18n/t';
import { cn } from '@/lib/utils';
import { useSession } from '@/session/SessionProvider';

/**
 * The layout toggle lives next to the sort, not in a menu: it is the control
 * people reach for most and it is a preference, so flipping it here writes it
 * through to the account rather than lasting until the next navigation.
 */
function ViewToggle() {
  const { feedView, set } = useDisplay();
  const { me, update } = useSession();

  function choose(next: FeedView) {
    set({ feedView: next });
    if (me !== null) {
      meApi.patch({ display: { feedView: next } }).then(update).catch(() => undefined);
    }
  }

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={t('feed.view')}>
      {([['list', Rows3], ['gallery', LayoutGrid]] as const).map(([value, Icon]) => (
        <Button
          key={value}
          variant="ghost"
          size="icon"
          aria-pressed={feedView === value}
          aria-label={value === 'list' ? t('feed.viewList') : t('feed.viewGallery')}
          className={cn(feedView === value && 'bg-accent text-accent-foreground')}
          onClick={() => choose(value)}
        >
          <Icon />
        </Button>
      ))}
    </div>
  );
}

/** Serves `/`, `/c/:categorySlug` and `/t/:tagSlug` — one list, three filters. */
export default function FeedRoute() {
  const { categorySlug, tagSlug } = useParams();
  const [params, setParams] = useSearchParams();
  const sort: FeedSort = params.get('sort') === 'top' ? 'top' : 'new';

  const fetchPage = useCallback(
    (cursor: string | null, signal: AbortSignal) =>
      feed.list(
        {
          cursor,
          limit: PAGE_SIZE,
          category: categorySlug ?? null,
          tag: tagSlug ?? null,
          sort,
        },
        { signal },
      ),
    [categorySlug, tagSlug, sort],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        {(['new', 'top'] as const).map((value) => (
          <Button
            key={value}
            variant="ghost"
            size="sm"
            aria-current={sort === value ? 'true' : undefined}
            className={cn(sort === value && 'bg-accent text-accent-foreground')}
            onClick={() => setParams(value === 'new' ? {} : { sort: value })}
          >
            {value === 'new' ? t('feed.sortNew') : t('feed.sortTop')}
          </Button>
        ))}
        {tagSlug === undefined ? null : (
          <span className="ml-2 text-sm text-muted-foreground">#{tagSlug}</span>
        )}
        <div className="flex-1" />
        <ViewToggle />
      </div>

      <Feed fetchPage={fetchPage} deps={[categorySlug, tagSlug, sort]} />
    </div>
  );
}
