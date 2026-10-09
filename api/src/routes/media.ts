import { Hono } from 'hono';
import type { AppEnv } from '../app.js';
import { env } from '../env.js';
import { notFound } from '../errors.js';
import { readOrRegenerate } from '../services/media.js';

/**
 * Media and unfurls: the two surfaces that are fetched by things that are not
 * the app.
 */
export function mediaRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  /**
   * Thumbnails and favicons, always from okmeme's own origin.
   *
   * The route is deliberately unauthenticated. It serves a derivative keyed by
   * an opaque id, and requiring a session would break the one property that
   * matters: a viewer's browser never touches a third-party host. A miss
   * re-fetches from the source URL, which is what makes the blob store a cache
   * and a database-only restore complete.
   */
  app.get('/thumb/:key{.+}', async (c) => {
    const key = c.req.param('key');
    const blob = await readOrRegenerate(key);
    if (blob === null) throw notFound('no such image');

    c.header('Content-Type', blob.contentType);
    c.header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    return c.body(blob.bytes as unknown as ArrayBuffer);
  });

  /**
   * The **same neutral card for every url**, always.
   *
   * This route is fetched by Discord, Slack and crawlers with no credentials.
   * Returning a real title would make it an oracle for gated content readable
   * by anyone who pastes a link into a chat window — so it returns nothing
   * about the post, not even whether the post exists.
   */
  app.get('/l/:publicId', (c) => {
    const config = env();
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>okmeme</title>
<meta name="robots" content="noindex, nofollow, noarchive">
<meta property="og:site_name" content="okmeme">
<meta property="og:title" content="okmeme">
<meta property="og:description" content="A link on okmeme. Sign in to view it.">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0; url=${config.webOrigins[0] ?? '/'}/l/${encodeURIComponent(c.req.param('publicId'))}">
</head>
<body>
<p>A link on okmeme.</p>
</body>
</html>`;

    c.header('Content-Type', 'text/html; charset=utf-8');
    c.header('Cache-Control', 'public, max-age=3600');
    return c.body(html);
  });

  return app;
}
