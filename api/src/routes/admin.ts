import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app.js';
import { requireTier } from '../context.js';
import { db } from '../db.js';
import { conflict, forbidden, invalid, notFound } from '../errors.js';
import { decodeCursor, parseLimit, toPage } from '../lib/cursor.js';
import { hashToken, inviteCode, publicId } from '../lib/ids.js';
import { BUCKETS, limit } from '../ratelimit.js';
import { audit } from '../services/audit.js';
import { issueRecoveryCodes, revokeAllCredentials } from '../services/accounts.js';
import { notify } from '../services/notify.js';
import { inviteMinTier, inviteTtlDays, setSetting, settingsWithTiers } from '../services/settings.js';
import { TIER, canSetTier } from '../tier.js';

/**
 * Everything here is gated on the server. Hiding the admin panel in the
 * frontend is presentation, not authorization.
 *
 * Staff do not reach this file at all: staff moderation is proactive only —
 * they can edit and remove limited and full content, but cannot see the report
 * queue and cannot suspend anyone. That makes admins the bottleneck for every
 * sanction, which GAPS.md records as a decision to revisit if volume grows.
 */
export function adminRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('/admin/*', async (c, next) => {
    requireTier(c.get('viewer'), TIER.admin);
    await next();
  });

  /**
   * Keyset on the primary key alone.
   *
   * These lists are all "newest first" or "oldest first" over an insert-ordered
   * bigserial, so the id *is* the sort key and a timestamp adds nothing. It
   * also removes a real footgun: a JS `Date` carries milliseconds and Postgres
   * carries microseconds, so a cursor built from `createdAt.getTime()` is
   * rounded down, and `created_at < roundedCursor` silently skips every row in
   * the sub-millisecond window that has not been shown yet.
   */
  const idCursor = (row: { id: bigint }) => ({ rank: Number(row.id), id: Number(row.id) });

  const before = (cursor: { id: number } | null) =>
    cursor === null ? {} : { id: { lt: BigInt(cursor.id) } };

  const after = (cursor: { id: number } | null) =>
    cursor === null ? {} : { id: { gt: BigInt(cursor.id) } };

  /* -------------------------------------------------------------- reports */

  app.get('/admin/reports', async (c) => {
    const pageSize = parseLimit(c.req.query('limit'));
    const cursor = decodeCursor(c.req.query('cursor'));
    const open = c.req.query('status') !== 'resolved';

    const rows = await db.report.findMany({
      where: { ...(open ? { resolvedAt: null } : {}), ...before(cursor) },
      orderBy: { id: 'desc' },
      take: pageSize + 1,
    });

    // Admins see everything, so subjects resolve to real names here — this is
    // the one tier where that is true by definition.
    const linkIds = rows.flatMap((row) => (row.subjectType === 'link' ? [row.subjectId] : []));
    const userIds = rows.flatMap((row) => (row.subjectType === 'user' ? [row.subjectId] : []));

    const [links, users] = await Promise.all([
      db.link.findMany({
        where: { id: { in: linkIds } },
        select: { id: true, publicId: true, title: true },
      }),
      db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, publicId: true, username: true, tier: true },
      }),
    ]);
    const linkById = new Map(links.map((row) => [String(row.id), row]));
    const userById = new Map(users.map((row) => [String(row.id), row]));

    return c.json(
      toPage(
        rows,
        pageSize,
        (row) => ({
          id: row.publicId,
          reason: row.reason,
          note: row.note,
          createdAt: row.createdAt.toISOString(),
          status: row.status,
          resolution: row.resolution,
          subject:
            row.subjectType === 'link'
              ? {
                  type: 'link' as const,
                  publicId: linkById.get(String(row.subjectId))?.publicId ?? null,
                  title: linkById.get(String(row.subjectId))?.title ?? null,
                }
              : {
                  type: 'user' as const,
                  publicId: userById.get(String(row.subjectId))?.publicId ?? null,
                  username: userById.get(String(row.subjectId))?.username ?? null,
                  tier: userById.get(String(row.subjectId))?.tier ?? null,
                },
        }),
        idCursor,
      ),
    );
  });

  app.post('/admin/reports/:id/resolve', async (c) => {
    const user = requireTier(c.get('viewer'), TIER.admin);
    const body = z
      .object({ resolution: z.string().trim().max(2000).optional().default('') })
      .safeParse(await c.req.json().catch(() => ({})));

    const report = await db.report.findUnique({ where: { publicId: c.req.param('id') } });
    if (report === null) throw notFound('no such report');
    if (report.resolvedAt !== null) throw conflict('already_resolved', 'already resolved');

    await db.report.update({
      where: { id: report.id },
      data: {
        status: 'resolved',
        resolvedBy: user.id,
        resolvedAt: new Date(),
        resolution: body.success ? body.data.resolution : '',
      },
    });
    await audit({
      actorId: user.id,
      action: 'report.resolved',
      subjectType: 'report',
      subjectId: report.publicId,
    });

    // The reporter is told nothing. Confirming an outcome would confirm the
    // subject, and the reported party never learns who reported them either.
    return c.body(null, 204);
  });

  /* -------------------------------------------------------------- appeals */

  app.get('/admin/appeals', async (c) => {
    const pageSize = parseLimit(c.req.query('limit'));
    const cursor = decodeCursor(c.req.query('cursor'));

    const rows = await db.appeal.findMany({
      where: { resolvedAt: null, ...after(cursor) },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
      include: {
        user: { select: { publicId: true, username: true, tier: true } },
        suspension: true,
      },
    });

    return c.json(
      toPage(
        rows,
        pageSize,
        (row) => ({
          id: row.publicId,
          body: row.body,
          createdAt: row.createdAt.toISOString(),
          user: {
            publicId: row.user.publicId,
            username: row.user.username,
            tier: row.user.tier,
          },
          sanction: {
            id: row.suspension.publicId,
            types: row.suspension.types,
            expiresAt:
              row.suspension.expiresAt === null ? null : row.suspension.expiresAt.toISOString(),
            reasonCategory: row.suspension.reasonCategory,
            note: row.suspension.note,
            liftedAt: row.suspension.liftedAt === null ? null : row.suspension.liftedAt.toISOString(),
          },
        }),
        idCursor,
      ),
    );
  });

  app.post('/admin/appeals/:id/resolve', async (c) => {
    const actor = requireTier(c.get('viewer'), TIER.admin);

    const body = z
      .object({
        outcome: z.enum(['upheld', 'reduced', 'overturned']),
        note: z.string().trim().max(2000).optional().default(''),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw invalid('an outcome is required', 'invalid_body');

    const appeal = await db.appeal.findUnique({
      where: { publicId: c.req.param('id') },
      include: { suspension: true },
    });
    if (appeal === null) throw notFound('no such appeal');
    if (appeal.resolvedAt !== null) throw conflict('already_resolved', 'already resolved');

    await db.appeal.update({
      where: { id: appeal.id },
      data: {
        outcome: body.data.outcome,
        // Same constraint as a suspension note: written by someone who sees
        // everything, for someone who does not. It may never name a reporter or
        // reference content above the user's tier.
        outcomeNote: body.data.note === '' ? null : body.data.note,
        resolvedBy: actor.id,
        resolvedAt: new Date(),
      },
    });

    if (body.data.outcome === 'overturned' && appeal.suspension.liftedAt === null) {
      await db.suspension.update({
        where: { id: appeal.suspensionId },
        data: { liftedBy: actor.id, liftedAt: new Date() },
      });
    }

    await notify(appeal.userId, 'appeal_resolved', {
      detailKey: `appeal.outcome.${body.data.outcome}`,
      ...(body.data.note !== '' ? { note: body.data.note } : {}),
    });
    await audit({
      actorId: actor.id,
      action: 'appeal.resolved',
      subjectType: 'appeal',
      subjectId: appeal.publicId,
      after: { outcome: body.data.outcome },
    });

    return c.body(null, 204);
  });

  /* -------------------------------------------------------------- recovery */

  /** Oldest first, and **never auto-closed**: nothing is quietly dismissed on a timer. */
  app.get('/admin/recovery-requests', async (c) => {
    const pageSize = parseLimit(c.req.query('limit'));
    const cursor = decodeCursor(c.req.query('cursor'));

    const rows = await db.recoveryRequest.findMany({
      where: { resolvedAt: null, ...after(cursor) },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
      include: { user: { select: { publicId: true, username: true, tier: true } } },
    });

    return c.json(
      toPage(
        rows,
        pageSize,
        (row) => ({
          id: String(row.id),
          note: row.note,
          createdAt: row.createdAt.toISOString(),
          user: { publicId: row.user.publicId, username: row.user.username, tier: row.user.tier },
        }),
        idCursor,
      ),
    );
  });

  app.post('/admin/recovery-requests/:id/resolve', async (c) => {
    const actor = requireTier(c.get('viewer'), TIER.admin);

    const body = z
      .object({ approve: z.boolean().optional().default(true) })
      .safeParse(await c.req.json().catch(() => ({})));
    const approve = body.success ? body.data.approve : true;

    const request = await db.recoveryRequest.findUnique({
      where: { id: BigInt(c.req.param('id')) },
    });
    if (request === null || request.resolvedAt !== null) throw notFound('no such request');

    await db.recoveryRequest.update({
      where: { id: request.id },
      data: { resolvedBy: actor.id, resolvedAt: new Date() },
    });

    let codes: readonly string[] = [];
    if (approve) {
      // Identity is verified out of band by the admin. The codes are handed
      // over the same way — this response is the only time they exist.
      codes = await issueRecoveryCodes(request.userId);
      await revokeAllCredentials(request.userId);
      await notify(request.userId, 'recovery_approved', {
        detailKey: 'recovery.approved',
      });
    }

    await audit({
      actorId: actor.id,
      action: 'recovery.resolved',
      subjectType: 'recovery_request',
      subjectId: String(request.id),
      after: { approve },
    });

    return c.json({ recoveryCodes: codes });
  });

  /* -------------------------------------------------------------- users */

  app.get('/admin/users', async (c) => {
    const pageSize = parseLimit(c.req.query('limit'));
    const cursor = decodeCursor(c.req.query('cursor'));
    const q = c.req.query('q');

    const rows = await db.user.findMany({
      where: {
        ...(q !== undefined && q !== '' ? { username: { contains: q, mode: 'insensitive' } } : {}),
        ...before(cursor),
      },
      orderBy: { id: 'desc' },
      take: pageSize + 1,
      include: {
        suspensions: {
          where: { liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        inviter: { select: { publicId: true, username: true } },
      },
    });

    return c.json(
      toPage(
        rows,
        pageSize,
        (row) => {
          const sanction = row.suspensions[0];
          return {
            publicId: row.publicId,
            username: row.username,
            tier: row.tier,
            state: row.state,
            createdAt: row.createdAt.toISOString(),
            invitedBy:
              row.inviter === null
                ? null
                : { publicId: row.inviter.publicId, username: row.inviter.username },
            sanction:
              sanction === undefined
                ? null
                : {
                    id: sanction.publicId,
                    types: sanction.types,
                    expiresAt:
                      sanction.expiresAt === null ? null : sanction.expiresAt.toISOString(),
                    reasonCategory: sanction.reasonCategory,
                  },
          };
        },
        idCursor,
      ),
    );
  });

  app.post('/admin/users/:publicId/tier', async (c) => {
    const actor = requireTier(c.get('viewer'), TIER.admin);

    const body = z
      .object({ tier: z.number().int().min(1).max(5) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw invalid('a tier ordinal is required', 'invalid_body');

    const target = await db.user.findUnique({ where: { publicId: c.req.param('publicId') } });
    if (target === null || target.state !== 'active') throw notFound('no such user');

    // Admins cannot demote other admins, and nobody promotes above themselves.
    // The owner set is managed under /owner, not here.
    if (body.data.tier >= TIER.owner) throw forbidden('the owner set is managed under /owner');
    if (!canSetTier(actor.tier, target.tier, body.data.tier)) throw forbidden('not permitted');

    await db.user.update({ where: { id: target.id }, data: { tier: body.data.tier } });

    await audit({
      actorId: actor.id,
      action: 'user.tier_changed',
      subjectType: 'user',
      subjectId: target.publicId,
      before: { tier: target.tier },
      after: { tier: body.data.tier },
    });
    // Promotion is a full retroactive reveal and demotion cannot un-reveal;
    // both are stateless and immediate, so the user is told at once.
    await notify(target.id, 'tier_changed', {
      detailKey: body.data.tier > target.tier ? 'tier.promoted' : 'tier.demoted',
    });

    return c.body(null, 204);
  });

  app.post('/admin/users/:publicId/suspend', async (c) => {
    const actor = requireTier(c.get('viewer'), TIER.admin);

    const body = z
      .object({
        types: z
          .array(z.enum(['mute', 'submission_ban', 'lockout', 'content_hold']))
          .min(1),
        expiresAt: z.string().datetime().nullable().optional().default(null),
        reasonCategory: z.enum(['spam', 'abuse', 'nsfw', 'other']),
        note: z.string().trim().max(2000).optional().default(''),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw invalid('types and a reason category are required', 'invalid_body');

    const target = await db.user.findUnique({ where: { publicId: c.req.param('publicId') } });
    if (target === null || target.state !== 'active') throw notFound('no such user');
    if (target.tier >= actor.tier) throw forbidden('not permitted');

    const sanction = await db.suspension.create({
      data: {
        publicId: publicId('s'),
        userId: target.id,
        types: body.data.types,
        expiresAt: body.data.expiresAt === null ? null : new Date(body.data.expiresAt),
        reasonCategory: body.data.reasonCategory,
        note: body.data.note === '' ? null : body.data.note,
        createdBy: actor.id,
      },
    });

    if (body.data.types.includes('lockout')) await revokeAllCredentials(target.id);

    await notify(target.id, 'sanction', {
      detailKey: `sanction.reason.${body.data.reasonCategory}`,
      ...(body.data.note !== '' ? { note: body.data.note } : {}),
    });
    await audit({
      actorId: actor.id,
      action: 'user.suspended',
      subjectType: 'user',
      subjectId: target.publicId,
      after: { types: body.data.types, expiresAt: body.data.expiresAt },
    });

    return c.json({ id: sanction.publicId }, 201);
  });

  app.post('/admin/users/:publicId/unsuspend', async (c) => {
    const actor = requireTier(c.get('viewer'), TIER.admin);

    const target = await db.user.findUnique({ where: { publicId: c.req.param('publicId') } });
    if (target === null) throw notFound('no such user');

    const result = await db.suspension.updateMany({
      where: { userId: target.id, liftedAt: null },
      data: { liftedBy: actor.id, liftedAt: new Date() },
    });
    if (result.count === 0) throw notFound('no active sanction');

    await notify(target.id, 'sanction', { detailKey: 'sanction.lifted' });
    await audit({
      actorId: actor.id,
      action: 'user.unsuspended',
      subjectType: 'user',
      subjectId: target.publicId,
    });

    return c.body(null, 204);
  });

  /** Fresh recovery codes for someone who has burned all ten. Shown once. */
  app.post('/admin/users/:publicId/reset', async (c) => {
    const actor = requireTier(c.get('viewer'), TIER.admin);

    const target = await db.user.findUnique({ where: { publicId: c.req.param('publicId') } });
    if (target === null || target.state !== 'active') throw notFound('no such user');

    const codes = await issueRecoveryCodes(target.id);
    await revokeAllCredentials(target.id);
    await notify(target.id, 'recovery_approved', { detailKey: 'recovery.reset' });
    await audit({
      actorId: actor.id,
      action: 'user.reset',
      subjectType: 'user',
      subjectId: target.publicId,
    });

    return c.json({ recoveryCodes: codes });
  });

  /**
   * Open-ended sanctions, oldest first. They accumulate silently otherwise, and
   * an indefinite suspension nobody revisits is a ban that was never decided on.
   */
  app.get('/admin/suspensions/indefinite', async (c) => {
    const pageSize = parseLimit(c.req.query('limit'));
    const cursor = decodeCursor(c.req.query('cursor'));

    const rows = await db.suspension.findMany({
      where: { liftedAt: null, expiresAt: null, ...after(cursor) },
      orderBy: { id: 'asc' },
      take: pageSize + 1,
      include: { user: { select: { publicId: true, username: true, tier: true } } },
    });

    return c.json(
      toPage(
        rows,
        pageSize,
        (row) => ({
          id: row.publicId,
          types: row.types,
          reasonCategory: row.reasonCategory,
          note: row.note,
          createdAt: row.createdAt.toISOString(),
          user: { publicId: row.user.publicId, username: row.user.username, tier: row.user.tier },
        }),
        idCursor,
      ),
    );
  });

  /* -------------------------------------------------------------- link re-tier */

  app.post('/admin/links/:publicId/tier', async (c) => {
    const actor = requireTier(c.get('viewer'), TIER.admin);

    const body = z
      .object({ tier: z.number().int().min(1).max(5).nullable() })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw invalid('a tier ordinal or null is required', 'invalid_body');

    const link = await db.link.findUnique({ where: { publicId: c.req.param('publicId') } });
    if (link === null) throw notFound('no such link');

    // A moderator re-tier writes pinned_tier, which freezes the post: the
    // author's later promotions and demotions no longer move it.
    await db.link.update({ where: { id: link.id }, data: { pinnedTier: body.data.tier } });

    await audit({
      actorId: actor.id,
      action: 'link.retiered',
      subjectType: 'link',
      subjectId: link.publicId,
      before: { pinnedTier: link.pinnedTier },
      after: { pinnedTier: body.data.tier },
    });
    await notify(link.authorId, 'content_retiered', {
      subjectPublicId: link.publicId,
      subjectTitle: link.title,
    });

    return c.body(null, 204);
  });

  /* -------------------------------------------------------------- invites */

  app.get('/admin/invites', async (c) => {
    const pageSize = parseLimit(c.req.query('limit'));
    const cursor = decodeCursor(c.req.query('cursor'));

    const rows = await db.invite.findMany({
      where: before(cursor),
      orderBy: { id: 'desc' },
      take: pageSize + 1,
    });

    const issuerIds = [...new Set(rows.map((row) => row.issuedBy))];
    const consumerIds = rows.flatMap((row) => (row.consumedBy === null ? [] : [row.consumedBy]));
    const users = await db.user.findMany({
      where: { id: { in: [...issuerIds, ...consumerIds] } },
      select: { id: true, publicId: true, username: true },
    });
    const byId = new Map(users.map((row) => [String(row.id), row]));

    return c.json(
      toPage(
        rows,
        pageSize,
        (row) => ({
          // The code itself is hashed at rest and is never readable again.
          id: String(row.id),
          issuedAt: row.issuedAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
          note: row.note,
          issuedBy: byId.get(String(row.issuedBy))?.username ?? null,
          consumedBy:
            row.consumedBy === null ? null : byId.get(String(row.consumedBy))?.username ?? null,
          consumedAt: row.consumedAt === null ? null : row.consumedAt.toISOString(),
          revokedAt: row.revokedAt === null ? null : row.revokedAt.toISOString(),
        }),
        idCursor,
      ),
    );
  });

  app.post('/admin/invites', async (c) => {
    const viewer = c.get('viewer');
    const actor = requireTier(viewer, TIER.admin);
    await limit(BUCKETS.invites, viewer);

    // The setting, not the constant. Lowering it is an owner-only act with
    // consequences VISIBILITY.md spells out; this is where it takes effect.
    const minimum = await inviteMinTier();
    if (actor.tier < minimum) throw forbidden('this instance restricts who may issue invites');

    const body = z
      .object({
        note: z.string().trim().max(200).optional().default(''),
        ttlDays: z.number().int().min(1).max(90).optional(),
      })
      .safeParse(await c.req.json().catch(() => ({})));

    const ttl = body.success && body.data.ttlDays !== undefined
      ? body.data.ttlDays
      : await inviteTtlDays();

    const code = inviteCode();
    const invite = await db.invite.create({
      data: {
        codeHash: hashToken(code),
        issuedBy: actor.id,
        expiresAt: new Date(Date.now() + ttl * 86_400_000),
        note: body.success && body.data.note !== '' ? body.data.note : null,
      },
    });

    await audit({
      actorId: actor.id,
      action: 'invite.issued',
      subjectType: 'invite',
      subjectId: String(invite.id),
      after: { expiresAt: invite.expiresAt.toISOString() },
    });

    // Single-use, hashed at rest, and shown exactly once. A leaked code costs
    // at most one account and stops mattering in fourteen days.
    return c.json({ id: String(invite.id), code, expiresAt: invite.expiresAt.toISOString() }, 201);
  });

  app.delete('/admin/invites/:id', async (c) => {
    const actor = requireTier(c.get('viewer'), TIER.admin);

    const invite = await db.invite.findUnique({ where: { id: BigInt(c.req.param('id')) } });
    if (invite === null) throw notFound('no such invite');
    if (invite.consumedAt !== null) throw conflict('already_consumed', 'that invite was used');

    await db.invite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
    await audit({
      actorId: actor.id,
      action: 'invite.revoked',
      subjectType: 'invite',
      subjectId: String(invite.id),
    });

    return c.body(null, 204);
  });

  /* -------------------------------------------------------------- audit */

  app.get('/admin/audit', async (c) => {
    const pageSize = parseLimit(c.req.query('limit'));
    const cursor = decodeCursor(c.req.query('cursor'));

    const rows = await db.auditLog.findMany({
      where: before(cursor),
      orderBy: { id: 'desc' },
      take: pageSize + 1,
    });

    const actorIds = [...new Set(rows.flatMap((row) => (row.actorId === null ? [] : [row.actorId])))];
    const actors = await db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, publicId: true, username: true, tier: true },
    });
    const byId = new Map(actors.map((row) => [String(row.id), row]));

    return c.json(
      toPage(
        rows,
        pageSize,
        (row) => {
          const actor = row.actorId === null ? undefined : byId.get(String(row.actorId));
          return {
            id: String(row.id),
            action: row.action,
            subjectType: row.subjectType,
            subjectId: row.subjectId,
            before: row.before,
            after: row.after,
            createdAt: row.createdAt.toISOString(),
            // The audit log is the one place the real actor behind a moderation
            // action is recorded, and admin/owner is the only audience for it.
            actor:
              actor === undefined
                ? null
                : { publicId: actor.publicId, username: actor.username, tier: actor.tier },
          };
        },
        idCursor,
      ),
    );
  });

  /* -------------------------------------------------------------- settings */

  app.get('/admin/settings', async (c) => c.json({ items: await settingsWithTiers() }));

  app.patch('/admin/settings', async (c) => {
    const actor = requireTier(c.get('viewer'), TIER.admin);

    const body = await c.req.json().catch(() => null);
    if (typeof body !== 'object' || body === null) throw invalid('a settings object is required');

    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      // setSetting refuses any key whose min_writer_tier is above the actor —
      // which is how invite_min_tier stays owner-only without a special case here.
      await setSetting(key, value, { id: actor.id, tier: actor.tier });
    }

    return c.json({ items: await settingsWithTiers() });
  });

  return app;
}
