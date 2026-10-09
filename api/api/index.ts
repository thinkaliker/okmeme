import { handle } from 'hono/vercel';
import { createApp } from '../src/app.js';

/**
 * Vercel's entry point. `vercel.json` rewrites every path here, so Hono does
 * the routing rather than the filesystem — the alternative is one file per
 * endpoint and sixty copies of the middleware chain.
 *
 * Node runtime, not edge: Prisma and argon2 both want it, and the visibility
 * predicate is a Postgres query either way.
 */
export const config = { runtime: 'nodejs' };

const app = createApp();

export default handle(app);
