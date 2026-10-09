import { handle } from '@hono/node-server/vercel';
import { createApp } from '../src/app.js';

/**
 * Vercel's entry point. `vercel.json` rewrites every path here, so Hono does
 * the routing rather than the filesystem — the alternative is one file per
 * endpoint and sixty copies of the middleware chain.
 *
 * Node runtime, not edge: Prisma and argon2 both want it, and the visibility
 * predicate is a Postgres query either way.
 *
 * The adapter has to be `@hono/node-server/vercel`, not `hono/vercel`. A
 * default export on the Node runtime is called with Node's `(req, res)`, and
 * `hono/vercel` passes that `req` straight to Hono as if it were a Fetch
 * `Request` — every request then dies on `this.raw.headers.get is not a
 * function`. The node-server adapter converts it, including the body Vercel
 * has already read into `req.rawBody`.
 */
export const config = { runtime: 'nodejs' };

const app = createApp();

export default handle(app);
