import { db } from './db.js';
import { rateLimited } from './errors.js';
import { env } from './env.js';
import { hashIp } from './lib/ids.js';
import type { Viewer } from './context.js';

/**
 * Flat limits across tiers, per user and per token; anonymous requests limited
 * per IP.
 *
 * Flat means a brand-new limited account has the same throughput as an admin.
 * That is acceptable **only because signup is invite-only, admin-issued, and
 * single-use** — there is no drive-by account farming for a tiered limiter to
 * slow down. The growth control is the invite. Do not read these numbers as an
 * anti-sockpuppet measure; GAPS.md is explicit that they are a weak mitigation
 * for the one channel that does leak.
 */

export interface Bucket {
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

const MINUTE = 60;
const HOUR = 3600;

export const BUCKETS = {
  readsAuth: { name: 'reads_auth', limit: 600, windowSeconds: MINUTE },
  readsAnon: { name: 'reads_anon', limit: 120, windowSeconds: MINUTE },
  writes: { name: 'writes', limit: 60, windowSeconds: HOUR },
  votes: { name: 'votes', limit: 300, windowSeconds: HOUR },
  reports: { name: 'reports', limit: 20, windowSeconds: HOUR },
  fetch: { name: 'fetch', limit: 20, windowSeconds: HOUR },
  invites: { name: 'invites', limit: 20, windowSeconds: HOUR },
  recovery: { name: 'recovery', limit: 3, windowSeconds: HOUR },
  /**
   * Not in API.md's table: the setup page needs its own budget or a handful of
   * page loads would spend the recovery allowance for everyone behind that IP.
   */
  setup: { name: 'setup', limit: 20, windowSeconds: HOUR },
} as const satisfies Record<string, Bucket>;

interface Counter {
  count: number;
  window_start: Date;
}

/**
 * Fixed windows in Postgres rather than a sliding log in memory. Serverless
 * invocations share no memory, so an in-process limiter on Vercel counts to one
 * per instance and stops meaning anything.
 */
async function consume(bucket: Bucket, subject: string): Promise<void> {
  const size = bucket.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / size) * size);
  const key = `${bucket.name}:${subject}`;

  const rows = await db.$queryRaw<Counter[]>`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start = EXCLUDED.window_start THEN rate_limits.count + 1
        ELSE 1
      END,
      window_start = EXCLUDED.window_start
    RETURNING count, window_start
  `;

  const current = rows[0];
  if (current === undefined) return;
  if (current.count > bucket.limit) {
    const resetAt = current.window_start.getTime() + size;
    throw rateLimited(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)));
  }
}

/**
 * A token is limited separately from the cookie session that minted it — "per
 * user and per token" — so a leaked token cannot spend the account's whole
 * budget on the polling channel.
 */
function subjectOf(viewer: Viewer): string {
  if (viewer.user === null) return `ip:${hashIp(viewer.ip, env().ipSalt)}`;
  if (viewer.via === 'token') return `tok:${viewer.user.id}:${viewer.ip}`;
  return `usr:${viewer.user.id}`;
}

export const limitReads = (viewer: Viewer): Promise<void> =>
  consume(viewer.user === null ? BUCKETS.readsAnon : BUCKETS.readsAuth, subjectOf(viewer));

export const limit = (bucket: Bucket, viewer: Viewer): Promise<void> =>
  consume(bucket, subjectOf(viewer));

/** Recovery is limited per IP because the caller is, by definition, not logged in. */
export const limitByIp = (bucket: Bucket, ip: string): Promise<void> =>
  consume(bucket, `ip:${hashIp(ip, env().ipSalt)}`);

/** Housekeeping for self-hosters; harmless to skip. */
export async function pruneRateLimits(): Promise<void> {
  const cutoff = new Date(Date.now() - 2 * HOUR * 1000);
  await db.rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } });
}
