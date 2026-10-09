import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { migrate } from '../src/lib/migrate.js';
import { publicId } from '../src/lib/ids.js';
import { TIER } from '../src/tier.js';
import type { Viewer } from '../src/context.js';
import { findVisibleDuplicate, queryLinks, tagsForLinks } from '../src/visibility.js';
import { authorPayload } from '../src/serialize.js';

/**
 * The predicate, against Postgres.
 *
 * Everything else in the suite tests a reimplementation of the rule. This file
 * tests the rule — filtering happens in SQL, so a test that does not reach SQL
 * proves nothing about what a viewer receives.
 */
const enabled = process.env['TEST_DATABASE_URL'] !== undefined;

const viewer = (tier: number, userId: bigint | null = null, showNsfw = false): Viewer => ({
  user:
    userId === null
      ? null
      : {
          id: userId,
          publicId: 'u_test',
          username: 'test',
          tier,
          showNsfw,
          theme: 'system',
          display: {},
          createdAt: new Date(),
        },
  tier,
  showNsfw: showNsfw && tier >= TIER.full,
  sanction: null,
  lockedOut: false,
  via: userId === null ? 'anonymous' : 'cookie',
  ip: '203.0.113.1',
});

describe.skipIf(!enabled)('the visibility predicate', () => {
  const ids: Record<string, bigint> = {};

  beforeAll(async () => {
    await migrate();

    // A clean slate. TRUNCATE ... CASCADE rather than per-table deletes so the
    // order of the foreign keys stops being this file's problem.
    await db.$executeRawUnsafe(`
      TRUNCATE links, users, categories, tags, link_tags, votes, link_scores,
               bookmarks, notifications, suspensions, appeals, reports,
               audit_log, invites, identities, sessions, api_tokens,
               recovery_codes, recovery_requests, rate_limits
      RESTART IDENTITY CASCADE
    `);

    const category = await db.category.create({ data: { slug: 'general', name: 'General' } });

    for (const [name, tier] of [
      ['limited', TIER.limited],
      ['full', TIER.full],
      ['staff', TIER.staff],
      ['admin', TIER.admin],
    ] as const) {
      const user = await db.user.create({
        data: { publicId: publicId('u'), username: name, tier },
      });
      ids[name] = user.id;

      const link = await db.link.create({
        data: {
          publicId: `l_${name}`,
          kind: 'text',
          title: `post by ${name}`,
          body: 'searchable body about otters',
          categoryId: category.id,
          authorId: user.id,
          authorTierAtPost: tier,
        },
      });
      ids[`link_${name}`] = link.id;
    }

    // One NSFW post from the full tier, and one pinned down a rung.
    await db.link.create({
      data: {
        publicId: 'l_nsfw',
        kind: 'text',
        title: 'nsfw post',
        body: 'body',
        categoryId: category.id,
        authorId: ids['full']!,
        authorTierAtPost: TIER.full,
        isNsfw: true,
      },
    });
    await db.link.create({
      data: {
        publicId: 'l_pinned',
        kind: 'text',
        title: 'pinned down a tier',
        body: 'body',
        categoryId: category.id,
        authorId: ids['admin']!,
        authorTierAtPost: TIER.admin,
        // A moderator re-tier freezes the post regardless of the author's tier.
        pinnedTier: TIER.limited,
      },
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  const titlesFor = async (v: Viewer): Promise<string[]> => {
    const rows = await queryLinks({ viewer: v, limit: 50, cursor: null, sort: 'new' });
    return rows.map((row) => row.public_id).sort();
  };

  it('shows anonymous viewers limited content and one rung, nothing beyond', async () => {
    expect(await titlesFor(viewer(TIER.anonymous))).toEqual(['l_limited', 'l_pinned']);
  });

  it('shows a limited user up to full, and no further', async () => {
    expect(await titlesFor(viewer(TIER.limited, ids['limited']!))).toEqual([
      'l_full',
      'l_limited',
      'l_pinned',
    ]);
  });

  it('shows an admin everything', async () => {
    const seen = await titlesFor(viewer(TIER.admin, ids['admin']!));
    expect(seen).toContain('l_staff');
    expect(seen).toContain('l_admin');
  });

  it('withholds NSFW from limited users entirely, and from full users by preference', async () => {
    expect(await titlesFor(viewer(TIER.limited, ids['limited']!))).not.toContain('l_nsfw');
    expect(await titlesFor(viewer(TIER.full, ids['full']!, false))).not.toContain('l_nsfw');
    expect(await titlesFor(viewer(TIER.full, ids['full']!, true))).toContain('l_nsfw');
  });

  it('keeps a pinned post where the moderator put it, not where its author is', async () => {
    // Authored by an admin, pinned to limited: an anonymous viewer sees it.
    expect(await titlesFor(viewer(TIER.anonymous))).toContain('l_pinned');
  });

  it('resolves an above-tier author to a bare label with no id in the payload', async () => {
    const rows = await queryLinks({
      viewer: viewer(TIER.limited, ids['limited']!),
      limit: 50,
      cursor: null,
      sort: 'new',
    });
    const fullPost = rows.find((row) => row.public_id === 'l_full');
    expect(fullPost).toBeDefined();

    const author = authorPayload(viewer(TIER.limited, ids['limited']!), fullPost!);
    expect(author).toEqual({ kind: 'tier', label: 'full' });
    // Not present-and-null: absent.
    expect('id' in author).toBe(false);
  });

  it('follows the author across a promotion, retroactively', async () => {
    await db.user.update({ where: { id: ids['limited']! }, data: { tier: TIER.staff } });
    // The whole back catalogue moves with them.
    expect(await titlesFor(viewer(TIER.anonymous))).not.toContain('l_limited');
    await db.user.update({ where: { id: ids['limited']! }, data: { tier: TIER.limited } });
    expect(await titlesFor(viewer(TIER.anonymous))).toContain('l_limited');
  });

  it('removes a content-held author from every feed, with no tombstone', async () => {
    const suspension = await db.suspension.create({
      data: {
        publicId: publicId('s'),
        userId: ids['limited']!,
        types: ['content_hold'],
        reasonCategory: 'abuse',
        createdBy: ids['admin']!,
      },
    });
    expect(await titlesFor(viewer(TIER.admin, ids['admin']!))).not.toContain('l_limited');
    await db.suspension.update({
      where: { id: suspension.id },
      data: { liftedAt: new Date(), liftedBy: ids['admin']! },
    });
    expect(await titlesFor(viewer(TIER.admin, ids['admin']!))).toContain('l_limited');
  });

  it('pages by keyset without ever counting rows', async () => {
    const first = await queryLinks({
      viewer: viewer(TIER.admin, ids['admin']!),
      limit: 2,
      cursor: null,
      sort: 'new',
    });
    expect(first.length).toBe(3); // limit + 1, the probe row

    const second = await queryLinks({
      viewer: viewer(TIER.admin, ids['admin']!),
      limit: 2,
      cursor: { rank: Number(first[1]!.rank), id: Number(first[1]!.id) },
      sort: 'new',
    });
    expect(second.map((row) => row.public_id)).not.toContain(first[0]!.public_id);
    expect(second.map((row) => row.public_id)).not.toContain(first[1]!.public_id);
  });

  it('searches through the same predicate', async () => {
    const hidden = await queryLinks({
      viewer: viewer(TIER.anonymous),
      limit: 50,
      cursor: null,
      sort: 'relevance',
      search: 'otters',
    });
    // The word is in every fixture body; the predicate is what decides.
    expect(hidden.map((row) => row.public_id)).toEqual(['l_limited']);
  });

  it('scopes the dedup check to the submitter, not to the database', async () => {
    const category = await db.category.findUniqueOrThrow({ where: { slug: 'general' } });
    await db.link.create({
      data: {
        publicId: 'l_staff_url',
        kind: 'link',
        url: 'https://example.com/a',
        urlCanonical: 'https://example.com/a',
        host: 'example.com',
        title: 'a staff link',
        categoryId: category.id,
        authorId: ids['staff']!,
        authorTierAtPost: TIER.staff,
      },
    });

    // A limited user cannot see staff content, so the URL is not a duplicate
    // *for them* — answering otherwise would confirm hidden content exists.
    await expect(
      findVisibleDuplicate(viewer(TIER.limited, ids['limited']!), 'https://example.com/a'),
    ).resolves.toBeNull();

    await expect(
      findVisibleDuplicate(viewer(TIER.admin, ids['admin']!), 'https://example.com/a'),
    ).resolves.not.toBeNull();
  });

  it('shows a pending tag to its proposer and to staff, and to nobody else', async () => {
    const tag = await db.tag.create({
      data: { slug: 'proposed', name: 'proposed', status: 'pending', createdBy: ids['limited']! },
    });
    await db.linkTag.create({ data: { linkId: ids['link_limited']!, tagId: tag.id } });

    const asProposer = await tagsForLinks(viewer(TIER.limited, ids['limited']!), [
      ids['link_limited']!,
    ]);
    expect(asProposer.map((row) => row.slug)).toContain('proposed');

    const asStaff = await tagsForLinks(viewer(TIER.staff, ids['staff']!), [ids['link_limited']!]);
    expect(asStaff.map((row) => row.slug)).toContain('proposed');

    const asStranger = await tagsForLinks(viewer(TIER.full, ids['full']!), [ids['link_limited']!]);
    expect(asStranger.map((row) => row.slug)).not.toContain('proposed');

    const asAnonymous = await tagsForLinks(viewer(TIER.anonymous), [ids['link_limited']!]);
    expect(asAnonymous.map((row) => row.slug)).not.toContain('proposed');
  });
});
