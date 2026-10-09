import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app.js';
import { requireTier, requireTierOrHide } from '../context.js';
import { db } from '../db.js';
import { conflict, invalid, notFound } from '../errors.js';
import { isValidTagSlug, toCategorySlug, toTagSlug } from '../lib/slug.js';
import { categoryPayload, authorFor } from '../serialize.js';
import { audit } from '../services/audit.js';
import { listTags } from '../services/tags.js';
import { TIER } from '../tier.js';

/**
 * Categories are admin-created top-level divisions and a link has exactly one.
 * Tags are staff-created, or author-proposed and staff-approved, and filter
 * within a category or across the site.
 */
export function taxonomyRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/categories', async (c) => {
    const rows = await db.category.findMany({ orderBy: { name: 'asc' } });
    return c.json(rows.map((row) => categoryPayload(row.slug, row.name)));
  });

  app.post('/categories', async (c) => {
    const viewer = c.get('viewer');
    const user = requireTier(viewer, TIER.admin);

    const body = z
      .object({ name: z.string().trim().min(1).max(48), slug: z.string().trim().optional() })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw invalid('a category needs a name', 'invalid_body');

    const slug = toCategorySlug(body.data.slug ?? body.data.name);
    if (slug === '') throw invalid('that name has no usable slug', 'bad_slug');

    const existing = await db.category.findUnique({ where: { slug } });
    if (existing !== null) throw conflict('category_exists', 'that category already exists');

    const created = await db.category.create({
      data: { slug, name: body.data.name, createdBy: user.id },
    });
    await audit({
      actorId: user.id,
      action: 'category.created',
      subjectType: 'category',
      subjectId: slug,
      after: { slug, name: created.name },
    });

    return c.json(categoryPayload(created.slug, created.name), 201);
  });

  /* -------------------------------------------------------------- tags */

  app.get('/tags', async (c) => {
    const viewer = c.get('viewer');
    return c.json(
      await listTags({ userId: viewer.user?.id ?? null, tier: viewer.tier }),
    );
  });

  app.post('/tags', async (c) => {
    const viewer = c.get('viewer');
    const user = requireTier(viewer, TIER.staff);

    const body = z
      .object({ name: z.string().trim().min(1).max(24) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw invalid('a tag needs a name', 'invalid_body');

    const slug = toTagSlug(body.data.name);
    if (!isValidTagSlug(slug)) throw invalid('two characters or more, letters and numbers', 'bad_slug');

    // Staff and above create outright, so this never produces a proposal. That
    // is what keeps every pending row traceable to someone its reviewer can see.
    const tag = await db.tag.upsert({
      where: { slug },
      update: { status: 'approved' },
      create: { slug, name: body.data.name, status: 'approved', createdBy: user.id },
    });
    await audit({
      actorId: user.id,
      action: 'tag.created',
      subjectType: 'tag',
      subjectId: slug,
      after: { slug },
    });

    return c.json({ slug: tag.slug, name: tag.name, pending: false }, 201);
  });

  /**
   * The review queue. Staff and above; **404 below that**, not 403 — a 403 tells
   * a limited user that a queue exists, which is one more rung of the ladder
   * than they are supposed to be able to see.
   */
  app.get('/tags/pending', async (c) => {
    const viewer = c.get('viewer');
    requireTierOrHide(viewer, TIER.staff);

    const rows = await db.tag.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });

    const proposers = await db.user.findMany({
      where: { id: { in: rows.flatMap((row) => (row.createdBy === null ? [] : [row.createdBy])) } },
      select: { id: true, publicId: true, username: true, tier: true },
    });
    const byId = new Map(proposers.map((user) => [String(user.id), user]));

    // No count of the queue anywhere in the response — a queue length is a
    // count of rows like any other.
    return c.json(
      rows.map((row) => {
        const proposer = row.createdBy === null ? undefined : byId.get(String(row.createdBy));
        return {
          slug: row.slug,
          name: row.name,
          proposedAt: row.createdAt.toISOString(),
          proposedBy:
            proposer === undefined
              ? { kind: 'tier', label: 'limited' }
              : authorFor(viewer, proposer),
        };
      }),
    );
  });

  app.post('/tags/:slug/approve', async (c) => {
    const viewer = c.get('viewer');
    const user = requireTierOrHide(viewer, TIER.staff);

    const slug = c.req.param('slug');
    const tag = await db.tag.findUnique({ where: { slug } });
    if (tag === null || tag.status !== 'pending') throw notFound('no such proposal');

    await db.tag.update({ where: { slug }, data: { status: 'approved' } });
    await audit({
      actorId: user.id,
      action: 'tag.approved',
      subjectType: 'tag',
      subjectId: slug,
      after: { slug },
    });

    return c.body(null, 204);
  });

  /**
   * Rejecting deletes the row and cascades through `link_tags`. The word goes;
   * the posts that carried it keep their other tags and simply stop showing
   * that one.
   */
  app.delete('/tags/:slug', async (c) => {
    const viewer = c.get('viewer');
    const user = requireTierOrHide(viewer, TIER.staff);

    const slug = c.req.param('slug');
    const tag = await db.tag.findUnique({ where: { slug } });
    if (tag === null) throw notFound('no such tag');

    await db.tag.delete({ where: { slug } });
    await audit({
      actorId: user.id,
      action: 'tag.rejected',
      subjectType: 'tag',
      subjectId: slug,
      before: { slug, status: tag.status },
    });

    return c.body(null, 204);
  });

  return app;
}
