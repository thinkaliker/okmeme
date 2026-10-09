import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { feed } from '@/api/endpoints';
import { Feed } from '@/components/Feed';
import { PAGE_SIZE } from '@/config';
import { t } from '@/i18n/t';

/**
 * Search runs the feed's predicate plus a text match, in the database. It
 * returns no result count — a count of matches is a count of rows, including
 * the ones the caller is not allowed to know exist.
 */
export default function SearchRoute() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const bookmarked = params.get('bookmarked') === 'true';

  const fetchPage = useCallback(
    (cursor: string | null, signal: AbortSignal) =>
      feed.search({ q, cursor, limit: PAGE_SIZE, bookmarked }, { signal }),
    [q, bookmarked],
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">
        {t('nav.search')}
        {q ? <span className="ml-2 font-normal text-muted-foreground">{q}</span> : null}
      </h1>
      <Feed fetchPage={fetchPage} deps={[q, bookmarked]} />
    </div>
  );
}
