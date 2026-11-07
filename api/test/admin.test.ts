import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { db } from '../src/db.js';
import { hashToken, publicId, secretToken } from '../src/lib/ids.js';
import { migrate } from '../src/lib/migrate.js';
import { TIER } from '../src/tier.js';

/**
 * The admin panel's write paths that guard an invariant: the owner set can only
 * change through /owner, a category cannot be deleted out from under the links
 * that reference it, and an invite never admits more people than its limit.
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
               recovery_codes, recovery_requests, rate_limits, tier_permissions
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

  /* ------------------------------------------------------------ invites */

  describe('invites', () => {
    let nextName = 0;
    const freshName = () => `newbie${(nextName += 1)}`;

    const signup = (invite: string, username = freshName()) =>
      app.request('/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: 'correct horse battery', invite }),
      });

    const issue = async (body: Record<string, unknown> = {}) => {
      const response = await call('admin', 'POST', '/admin/invites', body);
      expect(response.status).toBe(201);
      return (await response.json()) as { id: string; code: string; expiresAt: string | null; maxUses: number | null };
    };

    type Listed = {
      id: string;
      maxUses: number | null;
      expiresAt: string | null;
      exhausted: boolean;
      revokedAt: string | null;
      redeemedBy: { publicId: string; username: string | null; joinedAt: string }[];
    };
    const listed = async (id: string): Promise<Listed> => {
      const response = await call('admin', 'GET', '/admin/invites?limit=50');
      expect(response.status).toBe(200);
      const page = (await response.json()) as { items: Listed[] };
      const found = page.items.find((item) => item.id === id);
      if (found === undefined) throw new Error(`invite ${id} not listed`);
      return found;
    };

    it('defaults to one use and the instance expiry', async () => {
      const invite = await issue({ note: 'plain' });
      expect(invite.maxUses).toBe(1);
      expect(invite.expiresAt).not.toBeNull();
      const days = (new Date(invite.expiresAt!).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(13.9);
      expect(days).toBeLessThan(14.1);

      expect((await signup(invite.code)).status).toBe(201);
      const second = await signup(invite.code);
      expect(second.status).toBe(400);
      expect(await second.json()).toMatchObject({ code: 'bad_invite' });
    });

    it('admits up to its limit, then lists everyone who used it', async () => {
      const invite = await issue({ maxUses: 2 });
      expect((await signup(invite.code, 'first_in')).status).toBe(201);
      expect((await listed(invite.id)).exhausted).toBe(false);
      expect((await signup(invite.code, 'second_in')).status).toBe(201);
      expect((await signup(invite.code)).status).toBe(400);

      const row = await listed(invite.id);
      expect(row.exhausted).toBe(true);
      expect(row.redeemedBy.map((user) => user.username)).toEqual(['first_in', 'second_in']);
      // A flag and a list, never a number of anything.
      expect(row).not.toHaveProperty('uses');
      expect(row).not.toHaveProperty('count');

      const user = await db.user.findFirstOrThrow({ where: { username: 'first_in' } });
      expect(user.inviteId).toBe(BigInt(invite.id));
      expect(user.invitedBy).toBe(who('admin').id);
    });

    it('can be unlimited and never expire', async () => {
      const invite = await issue({ maxUses: null, ttlDays: null });
      expect(invite).toMatchObject({ maxUses: null, expiresAt: null });
      for (let index = 0; index < 3; index += 1) expect((await signup(invite.code)).status).toBe(201);
      const row = await listed(invite.id);
      expect(row).toMatchObject({ maxUses: null, expiresAt: null, exhausted: false });
      expect(row.redeemedBy).toHaveLength(3);
    });

    it('refuses a malformed issuance instead of falling back to defaults', async () => {
      expect((await call('admin', 'POST', '/admin/invites', { maxUses: 0 })).status).toBe(400);
      expect((await call('admin', 'POST', '/admin/invites', { ttlDays: 'soon' })).status).toBe(400);
      expect((await call('member', 'POST', '/admin/invites', {})).status).toBe(403);
    });

    it('gives the use back when signup fails for another reason', async () => {
      const invite = await issue();
      const taken = await signup(invite.code, 'first_in');
      expect(taken.status).toBe(409);
      expect((await signup(invite.code)).status).toBe(201);
    });

    it('lets exactly one of two simultaneous signups spend a single-use code', async () => {
      const invite = await issue();
      const results = await Promise.all([signup(invite.code), signup(invite.code)]);
      expect(results.map((response) => response.status).sort()).toEqual([201, 400]);
      expect((await listed(invite.id)).redeemedBy).toHaveLength(1);
    });

    it('edits the limit, the expiry, and the note, and audits what changed', async () => {
      const invite = await issue({ note: 'before' });
      expect((await signup(invite.code)).status).toBe(201);
      expect((await listed(invite.id)).exhausted).toBe(true);

      // Raising the limit reopens a used-up invite.
      const later = new Date(Date.now() + 30 * 86_400_000).toISOString();
      const edited = await call('admin', 'PATCH', `/admin/invites/${invite.id}`, {
        note: 'after',
        maxUses: 3,
        expiresAt: later,
      });
      expect(edited.status).toBe(204);
      const row = await listed(invite.id);
      expect(row).toMatchObject({ maxUses: 3, expiresAt: later, exhausted: false });
      expect((await signup(invite.code)).status).toBe(201);

      const logged = await db.auditLog.findFirstOrThrow({
        where: { action: 'invite.edited', subjectId: invite.id },
      });
      expect(logged.before).toMatchObject({ note: 'before', maxUses: 1 });
      expect(logged.after).toMatchObject({ note: 'after', maxUses: 3, expiresAt: later });

      // Never expiring, and back to unlimited.
      expect((await call('admin', 'PATCH', `/admin/invites/${invite.id}`, { expiresAt: null, maxUses: null })).status).toBe(204);
      expect(await listed(invite.id)).toMatchObject({ maxUses: null, expiresAt: null });
    });

    it('refuses an edit that would undercount, end in the past, or come from a non-admin', async () => {
      const invite = await issue({ maxUses: 3 });
      expect((await signup(invite.code)).status).toBe(201);
      expect((await signup(invite.code)).status).toBe(201);

      const below = await call('admin', 'PATCH', `/admin/invites/${invite.id}`, { maxUses: 1 });
      expect(below.status).toBe(409);
      expect(await below.json()).toMatchObject({ code: 'below_uses' });
      // Equal to what has been spent is allowed: it closes the invite.
      expect((await call('admin', 'PATCH', `/admin/invites/${invite.id}`, { maxUses: 2 })).status).toBe(204);
      expect((await listed(invite.id)).exhausted).toBe(true);

      const past = new Date(Date.now() - 60_000).toISOString();
      const ended = await call('admin', 'PATCH', `/admin/invites/${invite.id}`, { expiresAt: past });
      expect(ended.status).toBe(400);
      expect(await ended.json()).toMatchObject({ code: 'expiry_in_past' });

      expect((await call('admin', 'PATCH', `/admin/invites/${invite.id}`, {})).status).toBe(400);
      expect((await call('member', 'PATCH', `/admin/invites/${invite.id}`, { note: 'x' })).status).toBe(403);
      expect((await call('admin', 'PATCH', '/admin/invites/99999', { note: 'x' })).status).toBe(404);
      expect((await call('admin', 'PATCH', '/admin/invites/nope', { note: 'x' })).status).toBe(404);
    });

    it('revokes a partly used invite without touching who already joined, and freezes it', async () => {
      const invite = await issue({ maxUses: 5 });
      expect((await signup(invite.code, 'kept_user')).status).toBe(201);

      expect((await call('admin', 'DELETE', `/admin/invites/${invite.id}`)).status).toBe(204);
      expect((await signup(invite.code)).status).toBe(400);
      expect((await db.user.findFirstOrThrow({ where: { username: 'kept_user' } })).state).toBe('active');
      expect((await listed(invite.id)).redeemedBy.map((user) => user.username)).toEqual(['kept_user']);

      const edit = await call('admin', 'PATCH', `/admin/invites/${invite.id}`, { maxUses: 10 });
      expect(edit.status).toBe(409);
      expect(await edit.json()).toMatchObject({ code: 'revoked' });

      // Revoking again is a no-op, not a second audit row.
      expect((await call('admin', 'DELETE', `/admin/invites/${invite.id}`)).status).toBe(204);
      expect(await db.auditLog.count({ where: { action: 'invite.revoked', subjectId: invite.id } })).toBe(1);
    });
  });
});
