import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ApiError, forbidden } from './errors.js';
import { env } from './env.js';
import { resolveViewer, type Viewer } from './context.js';
import { limitReads } from './ratelimit.js';
import { authRoutes } from './routes/auth.js';
import { feedRoutes } from './routes/feed.js';
import { linkRoutes } from './routes/links.js';
import { taxonomyRoutes } from './routes/taxonomy.js';
import { meRoutes } from './routes/me.js';
import { reportRoutes } from './routes/reports.js';
import { adminRoutes } from './routes/admin.js';
import { ownerRoutes } from './routes/owner.js';
import { setupRoutes } from './routes/setup.js';
import { mediaRoutes } from './routes/media.js';

export interface AppEnv {
  Variables: {
    viewer: Viewer;
  };
}

/**
 * The whole surface, assembled once. `server.ts` wraps this for Node and
 * `api/index.ts` wraps the same object for Vercel — there is one application
 * and two thin entry points, which is the only way the two deployments stay
 * honestly identical.
 */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const config = env();

  app.use(
    '*',
    cors({
      origin: (origin) => (config.webOrigins.includes(origin) ? origin : null),
      // The session cookie is httponly and opaque; the browser has to be
      // allowed to send it, and the client never reads it.
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );

  app.use('*', async (c, next) => {
    // Nothing about okmeme is indexable, which is consistent with invite-only
    // signup. The OG card route relaxes this for itself.
    c.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Content-Type-Options', 'nosniff');
    await next();
  });

  app.use('*', async (c, next) => {
    c.set('viewer', await resolveViewer(c));
    await next();
  });

  /**
   * A locked-out user authenticates normally into a session authorised for
   * exactly two things: reading the sanction and filing one appeal. Refusing
   * the login outright would leave them with no channel at all, because nothing
   * here sends mail.
   */
  const LOCKOUT_ALLOWED: readonly (readonly [string, RegExp])[] = [
    ['GET', /^\/me$/],
    ['POST', /^\/me\/suspension\/appeal$/],
    ['POST', /^\/auth\/logout$/],
  ];

  app.use('*', async (c, next) => {
    const viewer = c.get('viewer');
    if (viewer.lockedOut) {
      const method = c.req.method;
      const path = new URL(c.req.url).pathname;
      const allowed = LOCKOUT_ALLOWED.some(([verb, pattern]) => verb === method && pattern.test(path));
      if (!allowed) throw forbidden('this account is locked out');
    }
    await next();
  });

  app.use('*', async (c, next) => {
    // Read budget. Writes take a second, tighter bucket in their own handlers.
    if (c.req.method === 'GET') await limitReads(c.get('viewer'));
    await next();
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.route('/', feedRoutes());
  app.route('/', linkRoutes());
  app.route('/', taxonomyRoutes());
  app.route('/', meRoutes());
  app.route('/', authRoutes());
  app.route('/', reportRoutes());
  app.route('/', adminRoutes());
  app.route('/', ownerRoutes());
  app.route('/', setupRoutes());
  app.route('/', mediaRoutes());

  app.notFound((c) => c.json({ code: 'not_found', message: 'no such route' }, 404));

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      for (const [key, value] of Object.entries(error.headers)) c.header(key, value);
      return c.json({ code: error.code, message: error.message }, error.status as 400);
    }
    // Never leak an internal message: a stack trace from a query is a schema
    // description, and a schema description is a map of what is hidden.
    console.error('[okmeme]', error);
    return c.json({ code: 'internal', message: 'something went wrong' }, 500);
  });

  return app;
}
