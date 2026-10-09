import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page } from '@/domain/page';

interface CursorListState<T> {
  items: readonly T[];
  loading: boolean;
  loadingMore: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
  replace: (item: T, match: (candidate: T) => boolean) => void;
}

/**
 * Cursor pagination, expressed once.
 *
 * `hasMore` comes from `next_cursor` being non-null and never from comparing a
 * page length to a limit — a short page is a legitimate result at any point in
 * the list, and treating it as the end is how a filtered feed stops early.
 */
export function useCursorList<T>(
  fetchPage: (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>,
  deps: readonly unknown[],
): CursorListState<T> {
  const [items, setItems] = useState<readonly T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  // First page, and again whenever the query changes.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchRef
      .current(null, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setHasMore(page.nextCursor !== null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || cursor === null) return;
    const controller = new AbortController();
    setLoadingMore(true);
    fetchRef
      .current(cursor, controller.signal)
      .then((page) => {
        setItems((current) => [...current, ...page.items]);
        setCursor(page.nextCursor);
        setHasMore(page.nextCursor !== null);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => setLoadingMore(false));
  }, [cursor, loading, loadingMore]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const replace = useCallback((item: T, match: (candidate: T) => boolean) => {
    setItems((current) => current.map((candidate) => (match(candidate) ? item : candidate)));
  }, []);

  return { items, loading, loadingMore, error, hasMore, loadMore, reload, replace };
}
