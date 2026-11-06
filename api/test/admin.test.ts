import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { db } from '../src/db.js';
import { hashToken, publicId, secretToken } from '../src/lib/ids.js';
import { migrate } from '../src/lib/migrate.js';
import { TIER } from '../src/tier.js';

/**
 * The admin panel's write paths that guard an invariant: the owner set can only
 * change through /owner, and a category cannot be deleted out from under the
 * links that reference it.
 */
const enabled = process.env['TEST_DATABASE_URL'] !== undefined;

describe.skipIf(!enabled)('admin writes', () => {
  const app = createApp();
  const people = new Map<string, { id: bigint; publicId: string; cookie: string }>();

  async function account(username: string, tier: number) {
    const user = await db.user.create({ data: { publicId: publicId('u'), username, tier } });
    const token = secretToken();
    await db.session.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) },
    });
    people.set(username, { id: user.id, publicId: user.publicId, cookie: `okm_session=${token}` });
  }

  const who = (username: string) => {
    const person = people.get(username);
    if (person === undefined) throw new Error(`no fixture ${username}`);
    return person;
  };

  const call = (as: string, method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { cookie: who(as).cookie, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const tierOf = async (username: string) =>
    (await db.user.findUniqueOrThrow({ where: { id: who(username).id } })).tier;

  beforeAll(async () => {
    await migrate();
    await db.$executeRawUnsafe(`
      TRUNCATE links, users, categories, tags, link_tags, votes, link_scores,
               bookmarks, notifications, suspensions, appeals, reports,
               audit_log, invites, identities, sessions, api_tokens,
               recovery_codes, recovery_requests, rate_limits
      RESTART IDENTITY CASCADE
    `);
    await account('owner', TIER.owner);
    await account('admin', TIER.admin);
    await account('admin2', TIER.admin);
    await account('member', TIER.full);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  /* ------------------------------------------------------------ tiers */

  describe('POST /admin/users/:publicId/tier', () => {
    it('refuses to demote the only owner, even when an owner asks', async () => {
      // This route used to let an owner re-tier anyone, which demoted the last
      // owner without the check /owner/owners makes.
      const response = await call('owner', 'POST', `/admin/users/${who('owner').publicId}/tier`, { tier: TIER.limited });
      expect(response.status).toBe(403);
      expect(await tierOf('owner')).toBe(TIER.owner);
    });

    it('refuses an admin re-tiering an owner', async () => {
      const response = await call('admin', 'POST', `/admin/users/${who('owner').publicId}/tier`, { tier: TIER.full });
      expect(response.status).toBe(403);
      expect(await tierOf('owner')).toBe(TIER.owner);
    });

    it('refuses promotion into the owner set', async () => {
      const response = await call('owner', 'POST', `/admin/users/${who('member').publicId}/tier`, { tier: TIER.owner });
      expect(response.status).toBe(403);
      expect(await tierOf('member')).toBe(TIER.full);
    });

    it('refuses an admin changing another admin', async () => {
      const response = await call('admin', 'POST', `/admin/users/${who('admin2').publicId}/tier`, { tier: TIER.full });
      expect(response.status).toBe(403);
      expect(await tierOf('admin2')).toBe(TIER.admin);
    });

    it('lets an admin promote a member, and an owner demote an admin', async () => {
      expect((await call('admin', 'POST', `/admin/users/${who('member').publicId}/tier`, { tier: TIER.staff })).status).toBe(204);
      expect(await tierOf('member')).toBe(TIER.staff);

      expect((await call('owner', 'POST', `/admin/users/${who('admin2').publicId}/tier`, { tier: TIER.full })).status).toBe(204);
      expect(await tierOf('admin2')).toBe(TIER.full);
    });

    it('sends no notification for a change to the same tier', async () => {
      const before = await db.notification.count({ where: { userId: who('member').id } });
      const response = await call('admin', 'POST', `/admin/users/${who('member').publicId}/tier`, { tier: TIER.staff });
      expect(response.status).toBe(204);
      expect(await db.notification.count({ where: { userId: who('member').id } })).toBe(before);
    });
  });

  /* ------------------------------------------------------------ categories */

  describe('category editor', () => {
    const slugs = async () => (await db.category.findMany({ orderBy: { slug: 'asc' } })).map((row) => row.slug);

    it('creates, lists with an in-use flag, and refuses non-admins', async () => {
      expect((await call('admin', 'POST', '/categories', { name: 'Music' })).status).toBe(201);
      expect((await call('admin', 'POST', '/categories', { name: 'Videos' })).status).toBe(201);
      expect((await call('member', 'POST', '/categories', { name: 'Nope' })).status).toBe(403);

      const music = await db.category.findUniqueOrThrow({ where: { slug: 'music' } });
      await db.link.create({
        data: {
          publicId: publicId('l'),
          kind: 'text',
          title: 'a post',
          body: 'body',
          categoryId: music.id,
          authorId: who('member').id,
          authorTierAtPost: TIER.full,
        },
      });

      const listed = (await (await call('admin', 'GET', '/admin/categories')).json()) as {
        items: { slug: string; name: string; inUse: boolean }[];
        nextCursor: null;
      };
      expect(listed.items.map((item) => [item.slug, item.inUse])).toEqual([
        ['music', true],
        ['videos', false],
      ]);
      // A yes/no, never a number: no list envelope carries a count.
      expect(listed).not.toHaveProperty('count');
      expect(listed.items[0]).not.toHaveProperty('count');

      expect((await call('member', 'GET', '/admin/categories')).status).toBe(403);
    });

    it('renames without moving the slug', async () => {
      const response = await call('admin', 'PATCH', '/categories/music', { name: 'Songs' });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ slug: 'music', name: 'Songs' });
      expect((await db.category.findUniqueOrThrow({ where: { slug: 'music' } })).name).toBe('Songs');

      expect((await call('admin', 'PATCH', '/categories/music', { name: '   ' })).status).toBe(400);
      expect((await call('admin', 'PATCH', '/categories/nope', { name: 'x' })).status).toBe(404);
      expect((await call('member', 'PATCH', '/categories/music', { name: 'x' })).status).toBe(403);
    });

    it('refuses to delete a category that still has links unless told where to move them', async () => {
      const refused = await call('admin', 'DELETE', '/categories/music');
      expect(refused.status).toBe(409);
      expect(await slugs()).toEqual(['music', 'videos']);

      expect((await call('admin', 'DELETE', '/categories/music?move_to=music')).status).toBe(400);
      expect((await call('admin', 'DELETE', '/categories/music?move_to=nope')).status).toBe(400);
      expect(await slugs()).toEqual(['music', 'videos']);
    });

    it('moves the links and deletes', async () => {
      expect((await call('admin', 'DELETE', '/categories/music?move_to=videos')).status).toBe(204);
      expect(await slugs()).toEqual(['videos']);

      const videos = await db.category.findUniqueOrThrow({ where: { slug: 'videos' } });
      expect(await db.link.count({ where: { categoryId: videos.id } })).toBe(1);

      const logged = await db.auditLog.findFirst({ where: { action: 'category.deleted' } });
      expect(logged?.subjectId).toBe('music');
    });

    it('deletes an empty category with no target', async () => {
      expect((await call('admin', 'POST', '/categories', { name: 'Empty' })).status).toBe(201);
      expect((await call('admin', 'DELETE', '/categories/empty')).status).toBe(204);
      expect(await slugs()).toEqual(['videos']);
      expect((await call('admin', 'DELETE', '/categories/empty')).status).toBe(404);
    });
  });
});
