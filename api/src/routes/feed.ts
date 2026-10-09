import { Hono } from 'hono';
import type { AppEnv } from '../app.js';
import { decodeCursor, parseLimit } from '../lib/cursor.js';
import { linksPage } from '../services/linkpage.js';
import type { Sort } from '../visibility.js';

/**
 * Feed and search.
 *
 * They are the same query with one extra clause, deliberately: keeping the
 * full-text index inside Postgres means there is exactly one place the ring
 * rules are implemented. An external search engine would be a second copy of
 * every title with its own chance of being wrong about who may read it.
 *
 * Neither returns a count. A count of matches is a count of rows, including the
 * ones the caller is not allowed to know exist.
 */
export function feedRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/feed', async (c) => {
    const viewer = c.get('viewer');
    const sort: Sort = c.req.query('sort') === 'top' ? 'top' : 'new';

    return c.json(
      await linksPage({
        viewer,
        limit: parseLimit(c.req.query('limit')),
        cursor: decodeCursor(c.req.query('cursor')),
        sort,
        categorySlug: c.req.query('category'),
        tagSlug: c.req.query('tag'),
      }),
    );
  });

  app.get('/search', async (c) => {
    const viewer = c.get('viewer');
    const q = c.req.query('q') ?? '';
    const bookmarked = c.req.query('bookmarked') === 'true';

    return c.json(
      await linksPage({
        viewer,
        limit: parseLimit(c.req.query('limit')),
        cursor: decodeCursor(c.req.query('cursor')),
        // Relevance when there is a query to be relevant to, recency otherwise.
        sort: q.trim() === '' ? 'new' : 'relevance',
        categorySlug: c.req.query('category'),
        tagSlug: c.req.query('tag'),
        search: q,
        // A bookmark filter is only meaningful for someone who has bookmarks.
        bookmarkedOnly: bookmarked && viewer.user !== null,
      }),
    );
  });

  return app;
}
