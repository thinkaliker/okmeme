import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { db } from '../src/db.js';
import { hashToken, publicId, secretToken } from '../src/lib/ids.js';
import { migrate } from '../src/lib/migrate.js';
import { TIER } from '../src/tier.js';

/**
 * The application, over HTTP, against Postgres.
 *
 * Narrow on purpose: the ring predicate has its own suite, and these are the
 * things that only break once a request has been through the whole middleware
 * chain — the list envelope, keyset paging, and the reduced session a
 * locked-out user gets.
 */
const enabled = process.env['TEST_DATABASE_URL'] !== undefined;

describe.skipIf(!enabled)('the app', () => {
  const app = createApp();
  let cookie = '';
  let userId = 0n;

  beforeAll(async () => {
    await migrate();
    await db.$executeRawUnsafe(`
      TRUNCATE links, users, categories, tags, link_tags, votes, link_scores,
               bookmarks, notifications, suspensions, appeals, reports,
               audit_log, invites, identities, sessions, api_tokens,
               recovery_codes, recovery_requests, rate_limits
      RESTART IDENTITY CASCADE
    `);

    const user = await db.user.create({
      data: { publicId: publicId('u'), username: 'pager', tier: TIER.full },
    });
    userId = user.id;

    const token = secretToken();
    await db.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    cookie = `okm_session=${token}`;

    // Written in one statement so several share a millisecond — which is the
    // case a timestamp-derived cursor gets wrong.
    await db.notification.createMany({
      data: Array.from({ length: 25 }, () => ({
        publicId: publicId('n'),
        userId: user.id,
        kind: 'tier_changed' as const,
        payload: { detailKey: 'tier.promoted' },
      })),
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  const get = (path: string, headers: Record<string, string> = {}) =>
    app.request(path, { headers: { cookie, ...headers } });

  it('answers anonymous requests rather than rejecting them', async () => {
    const response = await app.request('/feed');
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['items', 'nextCursor']);
  });

  it('returns no total, count or page number in a list envelope', async () => {
    const body = (await (await get('/me/notifications')).json()) as Record<string, unknown>;
    for (const forbidden of ['total', 'count', 'page', 'pages', 'offset']) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it('pages without dropping or repeating a row', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;

    for (let guard = 0; guard < 10; guard += 1) {
      const path: string =
        cursor === null
          ? '/me/notifications?limit=7'
          : `/me/notifications?limit=7&cursor=${encodeURIComponent(cursor)}`;
      const page = (await (await get(path)).json()) as {
        items: { id: string }[];
        nextCursor: string | null;
      };
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      if (cursor === null) break;
    }

    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
  });

  it('404s the staff queue below staff rather than 403ing it', async () => {
    // A 403 would confirm the queue exists, which is one rung further than a
    // full user is allowed to see.
    expect((await get('/tags/pending')).status).toBe(404);
  });

  it('gives a locked-out user a session that reads the sanction and nothing else', async () => {
    await db.suspension.create({
      data: {
        publicId: publicId('s'),
        userId,
        types: ['lockout'],
        reasonCategory: 'abuse',
        createdBy: userId,
      },
    });

    expect((await get('/me')).status).toBe(200);
    expect((await get('/feed')).status).toBe(403);

    const appeal = await app.request('/me/suspension/appeal', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'please reconsider' }),
    });
    expect(appeal.status).toBe(204);

    // One appeal per sanction, enforced by a unique constraint rather than by
    // application logic.
    const second = await app.request('/me/suspension/appeal', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'again' }),
    });
    expect(second.status).toBe(409);
  });
});
