import { useCallback } from 'react';
import { me } from '@/api/endpoints';
import { Feed } from '@/components/Feed';
import { t } from '@/i18n/t';

/**
 * Private, and filtered by the same predicate as everything else. A bookmarked
 * post whose author is demoted drops out of this list silently and comes back if
 * they are re-promoted. There is deliberately no "no longer available" row: that
 * tombstone would pinpoint the moment a specific author was demoted.
 */
export default function BookmarksRoute() {
  const fetchPage = useCallback(
    (cursor: string | null, signal: AbortSignal) => me.bookmarks(cursor, { signal }),
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">{t('nav.bookmarks')}</h1>
      <Feed fetchPage={fetchPage} deps={[]} />
    </div>
  );
}
