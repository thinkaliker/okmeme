import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app.js';
import { loadSanction, requireUser } from '../context.js';
import { db } from '../db.js';
import { conflict, invalid, notFound } from '../errors.js';
import { apiToken, hashToken, publicId } from '../lib/ids.js';
import { decodeCursor, parseLimit, toPage } from '../lib/cursor.js';
import { BUCKETS, limit } from '../ratelimit.js';
import { displayPreferences, mePayload, notificationPayload } from '../serialize.js';
import { issueRecoveryCodes, tombstoneUser } from '../services/accounts.js';
import { linksPage } from '../services/linkpage.js';
import { unreadCount } from '../services/notify.js';
import { TIER } from '../tier.js';

const patchSchema = z.object({
  showNsfw: z.boolean().optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  display: z
    .object({
      density: z.enum(['comfortable', 'compact']).optional(),
      width: z.enum(['normal', 'wide']).optional(),
      feedView: z.enum(['list', 'gallery']).optional(),
    })
    .optional(),
});

export function meRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/me', async (c) => {
    const viewer = c.get('viewer');
    const user = requireUser(viewer);
    return c.json(mePayload(user, await unreadCount(user.id), viewer.sanction));
  });

  app.patch('/me', async (c) => {
    const viewer = c.get('viewer');
    const user = requireUser(viewer);

    const parsed = patchSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw invalid('invalid preferences', 'invalid_body');
    const patch = parsed.data;

    const current = displayPreferences(user.display);

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        // NSFW is a permission boundary, so the preference cannot lift it: a
        // limited account that sets the flag still gets no NSFW rows.
        ...(patch.showNsfw !== undefined
          ? { showNsfw: patch.showNsfw && user.tier >= TIER.full }
          : {}),
        ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
        ...(patch.display !== undefined
          ? { display: { ...current, ...patch.display } as never }
          : {}),
      },
    });

    return c.json(
      mePayload(
        {
          ...user,
          showNsfw: updated.showNsfw,
          theme: updated.theme,
          display: updated.display,
        },
        await unreadCount(user.id),
        viewer.sanction,
      ),
    );
  });

  /** Tombstone, not a delete. See SCHEMA.md — the posts keep resolving. */
  app.delete('/me', async (c) => {
    const viewer = c.get('viewer');
    const user = requireUser(viewer);
    await tombstoneUser(user.id, user.id);
    return c.body(null, 204);
  });

  /* -------------------------------------------------------------- bookmarks */

  app.get('/me/bookmarks', async (c) => {
    const viewer = c.get('viewer');
    requireUser(viewer);

    // Read through the same predicate as the feed, so a bookmarked post whose
    // author was demoted drops out with no tombstone and no notice — a "no
    // longer available" marker would pinpoint the moment of a demotion.
    return c.json(
      await linksPage({
        viewer,
        limit: parseLimit(c.req.query('limit')),
        cursor: decodeCursor(c.req.query('cursor')),
        sort: 'new',
        bookmarkedOnly: true,
      }),
    );
  });

  /* -------------------------------------------------------------- notifications */

  app.get('/me/notifications', async (c) => {
    const viewer = c.get('viewer');
    const user = requireUser(viewer);

    const pageSize = parseLimit(c.req.query('limit'));
    const cursor = decodeCursor(c.req.query('cursor'));
    const unreadOnly = c.req.query('unread') === 'true';

    // Keyset on the primary key. `created_at` would need microsecond precision
    // to be safe here, and a JS Date only carries milliseconds — a cursor built
    // from one rounds down and skips whatever landed in the remainder.
    const rows = await db.notification.findMany({
      where: {
        userId: user.id,
        ...(unreadOnly ? { readAt: null } : {}),
        ...(cursor === null ? {} : { id: { lt: BigInt(cursor.id) } }),
      },
      orderBy: { id: 'desc' },
      take: pageSize + 1,
    });

    return c.json(
      toPage(rows, pageSize, notificationPayload, (row) => ({
        rank: Number(row.id),
        id: Number(row.id),
      })),
    );
  });

  app.post('/me/notifications/read', async (c) => {
    const viewer = c.get('viewer');
    const user = requireUser(viewer);

    const body = z
      .object({ ids: z.array(z.string()).max(200).optional() })
      .safeParse(await c.req.json().catch(() => ({})));
    const ids = body.success ? body.data.ids : undefined;

    await db.notification.updateMany({
      where: {
        userId: user.id,
        readAt: null,
        ...(ids !== undefined ? { publicId: { in: ids } } : {}),
      },
      data: { readAt: new Date() },
    });

    return c.json({ unread: await unreadCount(user.id) });
  });

  /* -------------------------------------------------------------- tokens */

  app.get('/me/tokens', async (c) => {
    const user = requireUser(c.get('viewer'));
    const rows = await db.apiToken.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return c.json({
      items: rows.map((row) => ({
        publicId: row.publicId,
        name: row.name,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt === null ? null : row.lastUsedAt.toISOString(),
      })),
      nextCursor: null,
    });
  });

  app.post('/me/tokens', async (c) => {
    const viewer = c.get('viewer');
    const user = requireUser(viewer);
    await limit(BUCKETS.writes, viewer);

    const body = z
      .object({ name: z.string().trim().min(1).max(48) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw invalid('a token needs a name', 'invalid_body');

    // The token carries exactly this user's tier — there is no scoping beyond
    // that, because a token with fewer rights than its owner is a promise the
    // ring model cannot keep.
    const token = apiToken();
    const row = await db.apiToken.create({
      data: {
        userId: user.id,
        publicId: publicId('t'),
        tokenHash: hashToken(token),
        name: body.data.name,
      },
    });

    return c.json(
      {
        publicId: row.publicId,
        name: row.name,
        createdAt: row.createdAt.toISOString(),
        /** Shown exactly once. Only the hash is stored. */
        token,
      },
      201,
    );
  });

  app.delete('/me/tokens/:publicId', async (c) => {
    const user = requireUser(c.get('viewer'));
    const result = await db.apiToken.updateMany({
      where: { userId: user.id, publicId: c.req.param('publicId'), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw notFound('no such token');
    return c.body(null, 204);
  });

  /* -------------------------------------------------------------- recovery */

  app.post('/me/recovery-codes', async (c) => {
    const viewer = c.get('viewer');
    const user = requireUser(viewer);
    await limit(BUCKETS.writes, viewer);

    const codes = await issueRecoveryCodes(user.id);
    // Ten codes, displayed once, never recoverable afterwards. They replace
    // email entirely: there is no verification mail and no reset link.
    return c.json({ recoveryCodes: codes });
  });

  /* -------------------------------------------------------------- appeal */

  app.post('/me/suspension/appeal', async (c) => {
    const viewer = c.get('viewer');
    const user = requireUser(viewer);

    const sanction = viewer.sanction ?? (await loadSanction(user.id));
    if (sanction === null) throw notFound('no sanction to appeal');

    const body = z
      .object({ body: z.string().trim().min(1).max(4000) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw invalid('an appeal needs a message', 'invalid_body');

    try {
      await db.appeal.create({
        data: {
          publicId: publicId('a'),
          suspensionId: sanction.id,
          userId: user.id,
          body: body.data.body,
        },
      });
    } catch {
      // The unique constraint on suspension_id is the mechanism, not a race
      // guard: one appeal per sanction, enforced by the database. One shot is
      // what stops an appeal channel from being a mute with extra steps.
      throw conflict('already_appealed', 'one appeal per sanction');
    }

    return c.body(null, 204);
  });

  return app;
}
