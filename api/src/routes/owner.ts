import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app.js';
import { requireTier } from '../context.js';
import { db } from '../db.js';
import { conflict, forbidden, invalid, notFound } from '../errors.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notify.js';
import { setSetting, settingsWithTiers } from '../services/settings.js';
import { TIER } from '../tier.js';

/**
 * Owner is a **set**, not an account. Any owner may add or remove another and
 * the last one cannot be removed — so an instance survives one person
 * disappearing without needing shell access, at the cost of a wider blast
 * radius on the most privileged role.
 */
export function ownerRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('/owner/*', async (c, next) => {
    requireTier(c.get('viewer'), TIER.owner);
    await next();
  });

  app.get('/owner/owners', async (c) => {
    const rows = await db.user.findMany({
      where: { tier: TIER.owner, state: 'active' },
      orderBy: { createdAt: 'asc' },
      select: { publicId: true, username: true, createdAt: true },
    });
    return c.json({
      items: rows.map((row) => ({
        publicId: row.publicId,
        username: row.username,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: null,
    });
  });

  app.post('/owner/owners', async (c) => {
    const actor = requireTier(c.get('viewer'), TIER.owner);

    const body = z
      .object({ publicId: z.string().trim().min(1) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw invalid('a user public id is required', 'invalid_body');

    const target = await db.user.findUnique({ where: { publicId: body.data.publicId } });
    if (target === null || target.state !== 'active') throw notFound('no such user');
    if (target.tier === TIER.owner) throw conflict('already_owner', 'already an owner');

    await db.user.update({ where: { id: target.id }, data: { tier: TIER.owner } });
    await audit({
      actorId: actor.id,
      action: 'owner.added',
      subjectType: 'user',
      subjectId: target.publicId,
      before: { tier: target.tier },
      after: { tier: TIER.owner },
    });
    await notify(target.id, 'tier_changed', { detailKey: 'tier.promoted' });

    return c.body(null, 204);
  });

  app.delete('/owner/owners/:publicId', async (c) => {
    const actor = requireTier(c.get('viewer'), TIER.owner);

    const target = await db.user.findUnique({ where: { publicId: c.req.param('publicId') } });
    if (target === null || target.tier !== TIER.owner) throw notFound('no such owner');

    // A cross-row invariant, so it is checked inside the transaction that
    // performs the demotion rather than before it.
    await db.$transaction(async (tx) => {
      const remaining = await tx.user.count({
        where: { tier: TIER.owner, state: 'active', id: { not: target.id } },
      });
      if (remaining === 0) {
        throw forbidden('the last owner cannot be removed');
      }
      await tx.user.update({ where: { id: target.id }, data: { tier: TIER.admin } });
    });

    await audit({
      actorId: actor.id,
      action: 'owner.removed',
      subjectType: 'user',
      subjectId: target.publicId,
      before: { tier: TIER.owner },
      after: { tier: TIER.admin },
    });
    await notify(target.id, 'tier_changed', { detailKey: 'tier.demoted' });

    return c.body(null, 204);
  });

  /**
   * Owner-writable settings, including `invite_min_tier`.
   *
   * Lowering that key below admin creates a permanent cross-tier identity
   * graph: a full user who invited someone who later reaches staff knows a real
   * identity inside a tier they are meant to be blind to. It is a change to the
   * security model, not a preference — so it requires an explicit confirmation
   * flag, and it is always audited. Raising it back does not unbuild what it
   * created.
   */
  app.patch('/owner/settings', async (c) => {
    const actor = requireTier(c.get('viewer'), TIER.owner);

    const body = await c.req.json().catch(() => null);
    if (typeof body !== 'object' || body === null) throw invalid('a settings object is required');

    const patch = body as Record<string, unknown>;
    const confirmed = patch['confirm'] === true;
    delete patch['confirm'];

    if ('invite_min_tier' in patch) {
      const next = Number(patch['invite_min_tier']);
      if (!Number.isInteger(next) || next < 1 || next > 5) {
        throw invalid('invite_min_tier is a tier ordinal', 'invalid_body');
      }
      if (next < TIER.admin && !confirmed) {
        throw conflict(
          'confirmation_required',
          'lowering invite_min_tier below admin creates a permanent cross-tier identity graph; resend with confirm: true',
        );
      }
    }

    for (const [key, value] of Object.entries(patch)) {
      await setSetting(key, value, { id: actor.id, tier: actor.tier });
    }

    return c.json({ items: await settingsWithTiers() });
  });

  return app;
}
