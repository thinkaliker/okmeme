import { GalleryTile } from '@/components/GalleryTile';
import { LinkCard } from '@/components/LinkCard';
import { Button } from '@/components/ui/button';
import { FeedSkeleton } from '@/components/ui/skeleton';
import { useDisplay } from '@/display/DisplayProvider';
import type { Link } from '@/domain/link';
import type { Page } from '@/domain/page';
import { useCursorList } from '@/hooks/useCursorList';
import { t } from '@/i18n/t';

interface FeedProps {
  fetchPage: (cursor: string | null, signal: AbortSignal) => Promise<Page<Link>>;
  deps: readonly unknown[];
  emptyTitle?: string;
  emptyBody?: string;
}

/**
 * A list of links. Paging is an explicit control rather than infinite scroll —
 * on a slow connection a scroll listener that fires more requests is the worst
 * possible default, and "load more" is also the honest shape for a cursor.
 *
 * Nothing here counts anything. No "showing 20 of 431", no page numbers.
 */
export function Feed({ fetchPage, deps, emptyTitle, emptyBody }: FeedProps) {
  const { feedView } = useDisplay();
  const { items, loading, loadingMore, error, hasMore, loadMore, reload, replace } =
    useCursorList<Link>(fetchPage, deps);

  if (loading) return <FeedSkeleton />;

  if (error !== null) {
    return (
      <div className="rounded-lg border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">{t('app.error')}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={reload}>
          {t('app.retry')}
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <p className="font-medium">{emptyTitle ?? t('feed.empty')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{emptyBody ?? t('feed.emptyBody')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 compact:gap-1.5">
      {/* Gallery is a rearrangement of the same page, not a different query.
          Every row the server sent gets a tile, including the ones with no
          image — dropping those client-side would make the page short for a
          reason that has nothing to do with what the viewer may see. */}
      {feedView === 'gallery' ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 compact:gap-1 compact:sm:grid-cols-4 compact:lg:grid-cols-6">
          {items.map((link) => (
            <li key={link.publicId}>
              <GalleryTile link={link} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-3 compact:gap-1.5">
          {items.map((link) => (
            <li key={link.publicId}>
              <LinkCard
                link={link}
                onChange={(next) =>
                  replace(next, (candidate) => candidate.publicId === link.publicId)
                }
              />
            </li>
          ))}
        </ul>
      )}

      <div className="py-4 text-center compact:py-2">
        {hasMore ? (
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t('app.loading') : t('feed.loadMore')}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">{t('feed.end')}</p>
        )}
      </div>
    </div>
  );
}
