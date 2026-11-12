import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { db } from '../src/db.js';
import { hashToken, publicId, secretToken } from '../src/lib/ids.js';
import { migrate } from '../src/lib/migrate.js';
import { TIER } from '../src/tier.js';

/**
 * "View as", over HTTP and against Postgres: a preview is exactly what some
 * member of that tier receives, it only ever goes down, and it never hands the
 * caller anything — a row, a name, a permission — they could not already reach.
 */
const enabled = process.env['TEST_DATABASE_URL'] !== undefined;

interface LinkBody {
  publicId: string;
  title: string;
  author: { kind: string; label?: string; name?: string; id?: string };
  viewerVote: number;
  bookmarked: boolean;
  tags: { slug: string; pending: boolean }[];
  viewerCan: Record<string, boolean>;
  pinnedTier?: number | null;
}

describe.skipIf(!enabled)('view as a lower tier', () => {
  const app = createApp();
  const people = new Map<string, { id: bigint; cookie: string }>();
  const posts = new Map<string, string>();

  async function account(username: string, tier: number) {
    const user = await db.user.create({ data: { publicId: publicId('u'), username, tier, showNsfw: true } });
    const token = secretToken();
    await db.session.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) },
    });
    people.set(username, { id: user.id, cookie: `okm_session=${token}` });
  }

  const who = (username: string) => {
    const person = people.get(username);
    if (person === undefined) throw new Error(`no fixture ${username}`);
    return person;
  };

  const call = (as: string | null, method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: {
        ...(as === null ? {} : { cookie: who(as).cookie }),
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const feed = async (as: string | null, query = '') => {
    const response = await call(as, 'GET', `/feed${query}`);
    expect(response.status).toBe(200);
    return ((await response.json()) as { items: LinkBody[] }).items;
  };

  const titles = (items: readonly LinkBody[]) => items.map((item) => item.title).sort();

  const set = (tier: number, capability: string, granted: boolean) =>
    call('admin', 'PATCH', '/admin/permissions', { tier, capability, granted });

  beforeAll(async () => {
    await migrate();
    await db.$executeRawUnsafe(`
      TRUNCATE links, users, categories, tags, link_tags, votes, link_scores,
               bookmarks, notifications, suspensions, appeals, reports,
               audit_log, invites, identities, sessions, api_tokens,
               recovery_codes, recovery_requests, rate_limits, tier_permissions
      RESTART IDENTITY CASCADE
    `);
    await account('admin', TIER.admin);
    await account('staffer', TIER.staff);
    await account('member', TIER.full);
    await account('newbie', TIER.limited);

    const category = await db.category.create({ data: { slug: 'misc', name: 'Misc' } });
    const post = async (title: string, author: string, tier: number, extra: object = {}) => {
      const link = await db.link.create({
        data: {
          publicId: publicId('l'),
          kind: 'text',
          title,
          body: 'body',
          categoryId: category.id,
          authorId: who(author).id,
          authorTierAtPost: tier,
          attributionTier: tier,
          pinnedTier: tier,
          ...extra,
        },
      });
      posts.set(title, link.publicId);
      return link;
    };

    await post('at limited', 'newbie', TIER.limited);
    await post('at full', 'member', TIER.full);
    await post('at staff', 'staffer', TIER.staff);
    await post('at admin', 'admin', TIER.admin);
    // An admin writing for limited readers: everyone below admin sees a label.
    await post('admin, pinned down', 'admin', TIER.admin, { pinnedTier: TIER.limited });
    await post('nsfw at full', 'member', TIER.full, { isNsfw: true });
    await post('removed at limited', 'newbie', TIER.limited, {
      removedAt: new Date(),
      removedReason: 'moderation.spam',
    });

    // The admin's own traces on a post: none of it belongs in a preview.
    const limitedPost = await db.link.findUniqueOrThrow({ where: { publicId: posts.get('at limited') ?? '' } });
    await db.vote.create({ data: { linkId: limitedPost.id, userId: who('admin').id, value: 1 } });
    await db.bookmark.create({ data: { linkId: limitedPost.id, userId: who('admin').id } });
  });

  afterAll(async () => {
    await db.$executeRawUnsafe('TRUNCATE tier_permissions');
    await db.$disconnect();
  });

  it('shows an admin exactly what limited and logged-out readers get', async () => {
    const asLimited = await feed('admin', '?view_as=1');
    const asNewbie = await feed('newbie');
    expect(titles(asLimited)).toEqual(titles(asNewbie));
    expect(titles(asLimited)).toEqual(['admin, pinned down', 'at full', 'at limited']);
    // Names and labels as limited sees them: the admin's own post is [full].
    expect(asLimited.map((item) => [item.title, item.author]).sort()).toEqual(
      asNewbie.map((item) => [item.title, item.author]).sort(),
    );

    const asAnonymous = await feed('admin', '?view_as=0');
    expect(titles(asAnonymous)).toEqual(titles(await feed(null)));
    expect(asAnonymous.every((item) => item.author.kind === 'tier' && item.author.label === 'limited')).toBe(true);
  });

  it('answers for nobody in particular: no votes, bookmarks, pin or controls of your own', async () => {
    const asStaff = await feed('admin', '?view_as=3');
    const limited = asStaff.find((item) => item.title === 'at limited');
    expect(limited).toMatchObject({ viewerVote: 0, bookmarked: false });
    expect(asStaff.every((item) => Object.values(item.viewerCan).every((can) => !can))).toBe(true);
    // The admin's own post, pinned down, seen as staff: no pin, no name.
    const own = asStaff.find((item) => item.title === 'admin, pinned down');
    expect(own === undefined ? true : 'pinnedTier' in own).toBe(false);
    expect(own?.author).toEqual({ kind: 'tier', label: 'admin' });

    // The ordinary view still carries them.
    const mine = (await feed('admin')).find((item) => item.title === 'at limited');
    expect(mine).toMatchObject({ viewerVote: 1, bookmarked: true });
  });

  it('gives the same answer for your own tier as for no preview at all', async () => {
    expect(await feed('member', '?view_as=2')).toEqual(await feed('member'));
  });

  it('keeps your NSFW preference, and drops it below full', async () => {
    expect(titles(await feed('admin', '?view_as=2'))).toContain('nsfw at full');
    expect(titles(await feed('admin', '?view_as=1'))).not.toContain('nsfw at full');
    await db.user.update({ where: { id: who('admin').id }, data: { showNsfw: false } });
    try {
      expect(titles(await feed('admin', '?view_as=2'))).not.toContain('nsfw at full');
    } finally {
      await db.user.update({ where: { id: who('admin').id }, data: { showNsfw: true } });
    }
  });

  it('only ever goes down, and says nothing about the tiers it refuses', async () => {
    for (const tier of ['3', '4', '5', '9']) {
      const response = await call('member', 'GET', `/feed?view_as=${tier}`);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ code: 'forbidden', message: expect.any(String) });
    }
    expect((await call(null, 'GET', '/feed?view_as=1')).status).toBe(403);
    expect((await call('member', 'GET', '/feed?view_as=full')).status).toBe(400);
  });

  it('applies to a single link, search and the tag list', async () => {
    const staffPost = posts.get('at staff') ?? '';
    expect((await call('admin', 'GET', `/links/${staffPost}?view_as=1`)).status).toBe(404);
    const asFull = await call('admin', 'GET', `/links/${staffPost}?view_as=2`);
    expect(((await asFull.json()) as LinkBody).author).toEqual({ kind: 'tier', label: 'staff' });

    const search = await call('admin', 'GET', '/search?q=staff&view_as=1');
    expect(((await search.json()) as { items: LinkBody[] }).items).toEqual([]);

    // A preview has bookmarked nothing; dropping the filter would list everything.
    const bookmarked = await call('admin', 'GET', '/search?bookmarked=true&view_as=1');
    expect(await bookmarked.json()).toEqual({ items: [], nextCursor: null });

    await db.tag.create({ data: { slug: 'unreviewed', name: 'unreviewed', status: 'pending', createdBy: who('newbie').id } });
    const tags = async (query: string) =>
      ((await (await call('admin', 'GET', `/tags${query}`)).json()) as { slug: string }[]).map((tag) => tag.slug);
    expect(await tags('')).toContain('unreviewed');
    expect(await tags('?view_as=3')).toContain('unreviewed');
    expect(await tags('?view_as=2')).not.toContain('unreviewed');
  });

  it('never lends you a permission a lower tier holds and yours was refused', async () => {
    // Staff lose moderate; full is given it. A moderator may read a removed
    // post, so a staff preview as full must not become a way to do that.
    const removed = posts.get('removed at limited') ?? '';
    expect((await set(TIER.staff, 'moderate', false)).status).toBe(200);
    expect((await set(TIER.full, 'moderate', true)).status).toBe(200);
    try {
      expect((await call('member', 'GET', `/links/${removed}`)).status).toBe(200);
      expect((await call('staffer', 'GET', `/links/${removed}`)).status).toBe(404);
      expect((await call('staffer', 'GET', `/links/${removed}?view_as=2`)).status).toBe(404);
    } finally {
      expect((await set(TIER.full, 'moderate', false)).status).toBe(200);
      expect((await set(TIER.staff, 'moderate', true)).status).toBe(200);
    }
  });

  it('leaves writes answering for the person asking', async () => {
    const id = posts.get('at full') ?? '';
    const voted = await call('member', 'POST', `/links/${id}/vote?view_as=1`);
    expect(voted.status).toBe(200);
    // Resolved for the member themselves: their own post, by name.
    expect(((await voted.json()) as LinkBody).author).toMatchObject({ kind: 'user', name: 'member' });
    expect((await call('member', 'DELETE', `/links/${id}/vote`)).status).toBe(200);
  });
});
