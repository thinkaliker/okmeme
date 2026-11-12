import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app.js';
import { requireTier, viewAs } from '../context.js';
import { db } from '../db.js';
import { forbidden, invalid, notFound } from '../errors.js';
import { publicId } from '../lib/ids.js';
import { BUCKETS, limit } from '../ratelimit.js';
import { canSetOwnTier, mayModerate } from '../permissions.js';
import { TIER } from '../tier.js';
import { audit } from '../services/audit.js';
import { canonicalize, hostOf } from '../services/canonical.js';
import {
  requireCanBookmark,
  requireCanEdit,
  requireCanSubmit,
  requireCanVote,
} from '../services/guards.js';
import { deriveAtSubmit } from '../services/media.js';
import { notify } from '../services/notify.js';
import { singleLink } from '../services/linkpage.js';
import { thumbnailsEnabled } from '../services/settings.js';
import { resolveTagIds } from '../services/tags.js';
import { unfurl } from '../services/unfurl.js';
import { findVisibleDuplicate, findVisibleLink, standingTier } from '../visibility.js';

const submitSchema = z.object({
  kind: z.enum(['link', 'text', 'media']),
  title: z.string().trim().min(1).max(300),
  url: z.string().trim().max(2048).optional().default(''),
  body: z.string().max(20_000).optional().default(''),
  categorySlug: z.string().trim().min(1),
  tagSlugs: z.array(z.string()).max(10).optional().default([]),
  newTagNames: z.array(z.string()).max(10).optional().default([]),
  isNsfw: z.boolean().optional().default(false),
  /**
   * The tier the post lives at. Absent or null is the author's own tier; lower
   * is a wider audience. The post stays there through the author's later
   * promotions and demotions. Never above the author: that would let them post
   * under a higher tier's label.
   */
  pinnedTier: z.number().int().min(TIER.limited).max(TIER.admin).nullable().optional().default(null),
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  body: z.string().max(20_000).optional(),
  categorySlug: z.string().trim().min(1).optional(),
  tagSlugs: z.array(z.string()).max(10).optional(),
  newTagNames: z.array(z.string()).max(10).optional(),
  isNsfw: z.boolean().optional(),
});

async function parse<T extends z.ZodTypeAny>(body: unknown, schema: T): Promise<z.infer<T>> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw invalid(result.error.issues[0]?.message ?? 'invalid request', 'invalid_body');
  }
  return result.data;
}

export function linkRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  /* -------------------------------------------------------------- read */

  app.get('/links/:publicId', async (c) => {
    // A shared link opened while previewing is read as that tier would read it.
    const viewer = await viewAs(c.get('viewer'), c.req.query('view_as'));
    const id = c.req.param('publicId');

    const visible = await findVisibleLink(viewer, id);
    if (visible !== null) return c.json(await singleLink(viewer, visible));

    // A removed post stays readable by its author and by moderators — with the
    // same anonymous notice everyone else would have seen. To anyone else it is
    // a 404, because "hidden" and "does not exist" must be one answer.
    const removed = await findVisibleLink(viewer, id, true);
    if (removed !== null && removed.removed_at !== null) {
      // Moderators, and whoever can read the audit log that records it.
      const mine = viewer.user !== null && removed.author_id === viewer.user.id;
      const staffView = viewer.permissions.has('moderate') || viewer.permissions.has('readAuditLog');
      if (mine || staffView) {
        return c.json(await singleLink(viewer, removed));
      }
    }

    throw notFound('no such link');
  });

  /**
   * The revision chain. Readers see only an "edited" marker; the chain itself is
   * admin and owner, because it is the record of an author quietly rewriting a
   * post after it collected votes — and of a moderator rewriting someone else's.
   */
  app.get('/links/:publicId/revisions', async (c) => {
    const viewer = c.get('viewer');
    requireTier(viewer, TIER.admin);

    const link = await db.link.findUnique({
      where: { publicId: c.req.param('publicId') },
      select: { id: true },
    });
    if (link === null) throw notFound('no such link');

    const rows = await db.linkRevision.findMany({
      where: { linkId: link.id },
      orderBy: { seq: 'desc' },
    });

    const editors = await db.user.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.editorId))] } },
      select: { id: true, publicId: true, username: true, tier: true },
    });
    const byId = new Map(editors.map((editor) => [String(editor.id), editor]));

    return c.json({
      items: rows.map((row) => {
        const editor = byId.get(String(row.editorId));
        return {
          seq: row.seq,
          title: row.title,
          body: row.body,
          createdAt: row.createdAt.toISOString(),
          // Admin and owner see everything, so this one is a real name.
          editor:
            editor === undefined
              ? null
              : { id: editor.publicId, name: editor.username, tier: editor.tier },
        };
      }),
      nextCursor: null,
    });
  });

  /* -------------------------------------------------------------- preview */

  app.post('/links/preview', async (c) => {
    const viewer = c.get('viewer');
    requireCanSubmit(viewer);
    await limit(BUCKETS.fetch, viewer);

    const body = await parse(await c.req.json().catch(() => ({})), z.object({ url: z.string() }));
    const canonical = canonicalize(body.url);

    // Scoped to what this submitter can already see. A global check would
    // confirm the existence of content they are not allowed to know about,
    // which turns submission into an oracle.
    const duplicate = await findVisibleDuplicate(viewer, canonical);
    const meta = await unfurl(canonical);

    return c.json({
      canonicalUrl: canonical,
      title: meta.title,
      host: hostOf(canonical),
      // Nothing is stored yet: the derivative is written at submission, keyed
      // by the link that does not exist until then.
      thumbKey: null,
      duplicate:
        duplicate === null ? null : { publicId: duplicate.public_id, title: duplicate.title },
    });
  });

  /* -------------------------------------------------------------- submit */

  app.post('/links', async (c) => {
    const viewer = c.get('viewer');
    const user = requireCanSubmit(viewer);
    await limit(BUCKETS.writes, viewer);

    const draft = await parse(await c.req.json().catch(() => ({})), submitSchema);

    if (draft.isNsfw && !viewer.permissions.has('postNsfw')) {
      throw forbidden('this tier cannot mark posts nsfw');
    }
    // Every post is pinned where it is posted, so promoting its author later
    // neither takes it away from the tier it was written for nor relabels it.
    const pinnedTier = draft.pinnedTier ?? user.tier;
    if (pinnedTier > user.tier) throw forbidden('a post cannot live above its author');
    if (pinnedTier < user.tier && !viewer.permissions.has('postBelow')) {
      throw forbidden('this tier cannot post to a lower tier');
    }

    if (draft.kind !== 'text' && draft.url.trim() === '') {
      throw invalid('a link needs a url', 'missing_url');
    }
    if (draft.kind === 'text' && draft.body.trim() === '') {
      throw invalid('a text post needs a body', 'missing_body');
    }

    const category = await db.category.findUnique({ where: { slug: draft.categorySlug } });
    if (category === null) throw invalid('no such category', 'bad_category');

    const canonical = draft.kind === 'text' ? null : canonicalize(draft.url);
    const host = canonical === null ? null : hostOf(canonical);

    const tagIds = await resolveTagIds({
      slugs: draft.tagSlugs,
      names: draft.newTagNames,
      authorId: user.id,
      approve: viewer.permissions.has('createTags'),
    });

    const linkPublicId = publicId('l');

    // The fetch happens once, here, and never from a viewer's browser. With
    // thumbnails off there is nothing to fetch it for, so the request is not
    // made at all and the submitter's fetch budget is not spent on it.
    let thumbKey: string | null = null;
    let faviconKey: string | null = null;
    if (canonical !== null && (await thumbnailsEnabled())) {
      await limit(BUCKETS.fetch, viewer);
      const meta = await unfurl(canonical);
      const derived = await deriveAtSubmit(
        linkPublicId,
        meta.imageUrl,
        meta.faviconUrl,
        host ?? '',
      );
      thumbKey = derived.thumbKey;
      faviconKey = derived.faviconKey;
    }

    const created = await db.$transaction(async (tx) => {
      const link = await tx.link.create({
        data: {
          publicId: linkPublicId,
          kind: draft.kind,
          url: canonical,
          urlCanonical: canonical,
          mediaType: draft.kind === 'media' ? 'image' : null,
          title: draft.title,
          body: draft.body === '' ? null : draft.body,
          host,
          thumbKey,
          faviconKey,
          categoryId: category.id,
          authorId: user.id,
          // Audit only.
          authorTierAtPost: user.tier,
          pinnedTier,
          // Who may see the author's name on it, fixed now. See standingTier.
          attributionTier: user.tier,
          isNsfw: draft.isNsfw,
        },
      });

      if (tagIds.length > 0) {
        await tx.linkTag.createMany({
          data: tagIds.map((tagId) => ({ linkId: link.id, tagId })),
          skipDuplicates: true,
        });
      }

      await tx.vote.create({ data: { linkId: link.id, userId: user.id, value: 1 } });
      await tx.linkScore.create({ data: { linkId: link.id, score: 1 } });

      return link;
    });

    const row = await findVisibleLink(viewer, created.publicId);
    if (row === null) throw notFound('no such link');
    return c.json(await singleLink(viewer, row), 201);
  });

  /* -------------------------------------------------------------- edit */

  app.patch('/links/:publicId', async (c) => {
    const viewer = c.get('viewer');
    const user = requireCanEdit(viewer);
    await limit(BUCKETS.writes, viewer);

    const row = await findVisibleLink(viewer, c.req.param('publicId'));
    if (row === null) throw notFound('no such link');

    const mine = row.author_id === user.id;
    const asModerator = !mine && mayModerate(viewer, standingTier(row));
    if (!mine && !asModerator) throw notFound('no such link');
    // The post is theirs and they can see it, so a 403 confirms nothing new.
    if (mine && !viewer.permissions.has('editOwn')) {
      throw forbidden('this tier cannot edit its own posts');
    }

    const patch = await parse(await c.req.json().catch(() => ({})), patchSchema);

    if (patch.isNsfw === true && !viewer.permissions.has('postNsfw')) {
      throw forbidden('this tier cannot mark posts nsfw');
    }

    const existing = await db.link.findUniqueOrThrow({ where: { id: row.id } });

    // A text post is its body. Emptying it would leave a row the wire shape
    // cannot represent.
    if (existing.kind === 'text' && patch.body !== undefined && patch.body.trim() === '') {
      throw invalid('a text post needs a body', 'missing_body');
    }

    const categoryId =
      patch.categorySlug === undefined
        ? existing.categoryId
        : (await db.category.findUnique({ where: { slug: patch.categorySlug } }))?.id;
    if (categoryId === undefined) throw invalid('no such category', 'bad_category');

    const tagIds =
      patch.tagSlugs === undefined && patch.newTagNames === undefined
        ? null
        : await resolveTagIds({
            slugs: patch.tagSlugs ?? [],
            names: patch.newTagNames ?? [],
            authorId: user.id,
            approve: viewer.permissions.has('createTags'),
          });

    // Pending tags render to the post's author and to staff and above, and to
    // nobody else (tagsForLinks). An editor outside that set never saw them, so
    // could not have meant to remove them: they are kept, not silently dropped.
    const seesPending = mine || viewer.tier >= TIER.staff;

    const tagSlugsOf = async (tx: Pick<typeof db, 'linkTag'>) =>
      (
        await tx.linkTag.findMany({
          where: { linkId: row.id },
          select: { tag: { select: { slug: true } } },
        })
      )
        .map((entry) => entry.tag.slug)
        .sort();

    const tagChange = await db.$transaction(async (tx) => {
      // One revision row per edit by anyone, including the author. The public
      // "edited" marker plus this chain is the entire deterrent against
      // rewriting a title after it has collected votes.
      const last = await tx.linkRevision.findFirst({
        where: { linkId: row.id },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });
      await tx.linkRevision.create({
        data: {
          linkId: row.id,
          seq: (last?.seq ?? 0) + 1,
          title: existing.title,
          body: existing.body,
          editorId: user.id,
        },
      });

      await tx.link.update({
        where: { id: row.id },
        data: {
          title: patch.title ?? existing.title,
          body: patch.body === undefined ? existing.body : patch.body === '' ? null : patch.body,
          categoryId,
          isNsfw: patch.isNsfw ?? existing.isNsfw,
          editedAt: new Date(),
        },
      });

      if (tagIds === null) return null;

      const before = await tagSlugsOf(tx);
      await tx.linkTag.deleteMany({
        where: { linkId: row.id, ...(seesPending ? {} : { tag: { status: 'approved' } }) },
      });
      if (tagIds.length > 0) {
        await tx.linkTag.createMany({
          data: tagIds.map((tagId) => ({ linkId: row.id, tagId })),
          skipDuplicates: true,
        });
      }
      return { before, after: await tagSlugsOf(tx) };
    });

    if (asModerator) {
      // An unlogged moderator edit of someone else's post is undetectable by
      // design in a system where identity is deliberately obscured.
      await audit({
        actorId: user.id,
        action: 'link.edited_by_moderator',
        subjectType: 'link',
        subjectId: row.public_id,
        before: {
          title: existing.title,
          body: existing.body,
          categorySlug: row.category_slug,
          isNsfw: existing.isNsfw,
          ...(tagChange === null ? {} : { tags: tagChange.before }),
        },
        after: {
          title: patch.title ?? existing.title,
          body: patch.body ?? existing.body,
          categorySlug: patch.categorySlug ?? row.category_slug,
          isNsfw: patch.isNsfw ?? existing.isNsfw,
          ...(tagChange === null ? {} : { tags: tagChange.after }),
        },
      });
    }

    const updated = await findVisibleLink(viewer, row.public_id);
    if (updated === null) throw notFound('no such link');
    return c.json(await singleLink(viewer, updated));
  });

  /* -------------------------------------------------------------- author tier */

  /**
   * The author choosing who can see their own post, after the fact. Rules are
   * in canSetOwnTier: never above themselves, narrowing always, widening with
   * `postBelow`. Not an edit — the content is unchanged — so no revision row
   * and no "edited" marker. Moderators re-tier through /admin, audited.
   *
   * Always a pin: null and the author's own tier both pin it there. Moving it
   * never changes `attribution_tier`, the tier the author is named at.
   */
  app.post('/links/:publicId/tier', async (c) => {
    const viewer = c.get('viewer');
    const user = requireCanEdit(viewer);
    await limit(BUCKETS.writes, viewer);

    const row = await findVisibleLink(viewer, c.req.param('publicId'));
    if (row === null || row.author_id !== user.id) throw notFound('no such link');

    const body = await parse(
      await c.req.json().catch(() => ({})),
      z.object({ tier: z.number().int().min(TIER.limited).max(TIER.owner).nullable() }),
    );
    const next = body.tier ?? user.tier;
    if (!canSetOwnTier(viewer, row.effective_tier, next)) {
      throw forbidden('you can choose your own tier or, with permission, one below it');
    }

    await db.link.update({ where: { id: row.id }, data: { pinnedTier: next } });

    const updated = await findVisibleLink(viewer, row.public_id);
    if (updated === null) throw notFound('no such link');
    return c.json(await singleLink(viewer, updated));
  });

  /* -------------------------------------------------------------- remove */

  app.delete('/links/:publicId', async (c) => {
    const viewer = c.get('viewer');
    const user = requireCanEdit(viewer);

    const row = await findVisibleLink(viewer, c.req.param('publicId'));
    if (row === null) throw notFound('no such link');

    const mine = row.author_id === user.id;
    const asModerator = !mine && mayModerate(viewer, standingTier(row));
    if (!mine && !asModerator) throw notFound('no such link');

    const reasonKey = c.req.query('reason') ?? null;

    await db.link.update({
      where: { id: row.id },
      data: { removedAt: new Date(), removedReason: asModerator ? reasonKey : null },
    });

    if (asModerator) {
      await audit({
        actorId: user.id,
        action: 'link.removed',
        subjectType: 'link',
        subjectId: row.public_id,
        before: { title: row.title },
        after: { reasonKey },
      });
      // The notification says "moderator" exactly as the post does: no actor,
      // no tier, nothing that punches through the +1 rule.
      await notify(row.author_id, 'content_removed', {
        subjectPublicId: row.public_id,
        subjectTitle: row.title,
        ...(reasonKey !== null ? { detailKey: reasonKey } : {}),
      });
    }

    return c.body(null, 204);
  });

  /* -------------------------------------------------------------- vote */

  app.on(['POST', 'DELETE'], '/links/:publicId/vote', async (c) => {
    const viewer = c.get('viewer');
    const user = requireCanVote(viewer);
    await limit(BUCKETS.votes, viewer);

    const row = await findVisibleLink(viewer, c.req.param('publicId'));
    if (row === null) throw notFound('no such link');

    const on = c.req.method === 'POST';

    await db.$transaction(async (tx) => {
      if (on) {
        const created = await tx.vote.createMany({
          data: [{ linkId: row.id, userId: user.id, value: 1 }],
          skipDuplicates: true,
        });
        if (created.count > 0) {
          await tx.linkScore.upsert({
            where: { linkId: row.id },
            update: { score: { increment: 1 }, updatedAt: new Date() },
            create: { linkId: row.id, score: 1 },
          });
        }
      } else {
        const removed = await tx.vote.deleteMany({ where: { linkId: row.id, userId: user.id } });
        if (removed.count > 0) {
          await tx.linkScore.update({
            where: { linkId: row.id },
            data: { score: { decrement: 1 }, updatedAt: new Date() },
          });
        }
      }
    });

    const updated = await findVisibleLink(viewer, row.public_id);
    if (updated === null) throw notFound('no such link');
    return c.json(await singleLink(viewer, updated));
  });

  /* -------------------------------------------------------------- bookmark */

  app.on(['POST', 'DELETE'], '/links/:publicId/bookmark', async (c) => {
    const viewer = c.get('viewer');
    const user = requireCanBookmark(viewer);

    const row = await findVisibleLink(viewer, c.req.param('publicId'));
    if (row === null) throw notFound('no such link');

    if (c.req.method === 'POST') {
      await db.bookmark.upsert({
        where: { userId_linkId: { userId: user.id, linkId: row.id } },
        update: {},
        create: { userId: user.id, linkId: row.id },
      });
    } else {
      // Only the user removing a bookmark deletes one. A visibility change
      // never does: that would let one person's demotion destroy someone
      // else's saved items.
      await db.bookmark.deleteMany({ where: { userId: user.id, linkId: row.id } });
    }

    const updated = await findVisibleLink(viewer, row.public_id);
    if (updated === null) throw notFound('no such link');
    return c.json(await singleLink(viewer, updated));
  });

  return app;
}
