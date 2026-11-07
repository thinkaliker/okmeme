import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { db } from '../src/db.js';
import { hashToken, publicId, secretToken } from '../src/lib/ids.js';
import { migrate } from '../src/lib/migrate.js';
import { TIER } from '../src/tier.js';

/**
 * The permission table over HTTP: who may change which cell, that a change
 * reaches the next request, and the per-post `viewerCan` the cog reads.
 */
const enabled = process.env['TEST_DATABASE_URL'] !== undefined;

interface MatrixBody {
  tiers: { tier: number; label: string }[];
  rows: { capability: string; locked: boolean; cells: { tier: number; granted: boolean; editable: boolean }[] }[];
}

describe.skipIf(!enabled)('permissions', () => {
  const app = createApp();
  const people = new Map<string, { id: bigint; publicId: string; cookie: string }>();
  let postId = '';

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

  const set = (as: string, tier: number, capability: string, granted: boolean) =>
    call(as, 'PATCH', '/admin/permissions', { tier, capability, granted });

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
    await account('staffer', TIER.staff);
    await account('member', TIER.full);
    await account('newbie', TIER.limited);

    const category = await db.category.create({ data: { slug: 'misc', name: 'Misc' } });
    const link = await db.link.create({
      data: {
        publicId: publicId('l'),
        kind: 'text',
        title: 'a limited post',
        body: 'body',
        categoryId: category.id,
        authorId: who('newbie').id,
        authorTierAtPost: TIER.limited,
      },
    });
    postId = link.publicId;
  });

  afterAll(async () => {
    await db.$executeRawUnsafe('TRUNCATE tier_permissions');
    await db.$disconnect();
  });

  it('shows each viewer their own tier and below', async () => {
    const limited = (await (await call('newbie', 'GET', '/me/permissions')).json()) as MatrixBody;
    expect(limited.tiers.map((column) => column.label)).toEqual(['limited']);
    expect(limited.rows.flatMap((row) => row.cells).some((cell) => cell.editable)).toBe(false);

    const admin = (await (await call('admin', 'GET', '/me/permissions')).json()) as MatrixBody;
    expect(admin.tiers.map((column) => column.label)).toEqual(['limited', 'full', 'staff', 'admin']);
  });

  it('refuses a change from below admin, to your own tier, or to a fixed row', async () => {
    expect((await set('staffer', TIER.limited, 'submit', false)).status).toBe(403);
    expect((await set('admin', TIER.admin, 'submit', false)).status).toBe(403);
    expect((await set('admin', TIER.full, 'seeNsfw', false)).status).toBe(403);
    expect((await set('owner', TIER.owner, 'bookmark', false)).status).toBe(403);
    expect((await set('admin', TIER.limited, 'postNsfw', true)).status).toBe(403);
    expect((await set('admin', TIER.limited, 'nope', true)).status).toBe(400);
  });

  it('takes effect on the next request, and is audited', async () => {
    const revoked = await set('admin', TIER.limited, 'vote', false);
    expect(revoked.status).toBe(200);
    const table = (await revoked.json()) as MatrixBody;
    expect(table.rows.find((row) => row.capability === 'vote')?.cells[0]).toMatchObject({
      tier: TIER.limited,
      granted: false,
      editable: true,
    });

    expect((await call('newbie', 'POST', `/links/${postId}/vote`)).status).toBe(403);
    const me = (await (await call('newbie', 'GET', '/me')).json()) as { permissions: string[] };
    expect(me.permissions).not.toContain('vote');

    expect(await db.auditLog.count({ where: { action: 'permission.updated' } })).toBe(1);

    // Restoring the default deletes the override rather than storing a copy.
    expect((await set('admin', TIER.limited, 'vote', true)).status).toBe(200);
    expect(await db.tierPermission.count()).toBe(0);
    expect((await call('newbie', 'POST', `/links/${postId}/vote`)).status).toBe(200);
  });

  it('stops an admin granting what the owner took from admins', async () => {
    expect((await set('owner', TIER.admin, 'moderate', false)).status).toBe(200);
    expect((await set('admin', TIER.staff, 'moderate', false)).status).toBe(403);
    expect((await set('owner', TIER.admin, 'moderate', true)).status).toBe(200);
  });

  it('tells each viewer what they may do to a post, and nothing more', async () => {
    const as = async (username: string) =>
      ((await (await call(username, 'GET', `/links/${postId}`)).json()) as {
        viewerCan: Record<string, boolean>;
      }).viewerCan;

    expect(await as('newbie')).toEqual({ edit: true, remove: true, retier: false, moderate: false });
    expect(await as('staffer')).toEqual({ edit: true, remove: true, retier: false, moderate: true });
    expect(await as('admin')).toEqual({ edit: true, remove: true, retier: true, moderate: true });
    // Full is above the post but holds no moderation by default.
    expect(await as('member')).toEqual({ edit: false, remove: false, retier: false, moderate: false });

    // Granting it lets full moderate limited, and only limited.
    expect((await set('admin', TIER.full, 'moderate', true)).status).toBe(200);
    expect(await as('member')).toMatchObject({ edit: true, moderate: true });
    const edited = await call('member', 'PATCH', `/links/${postId}`, { title: 'retitled' });
    expect(edited.status).toBe(200);
    expect(await db.auditLog.count({ where: { action: 'link.edited_by_moderator' } })).toBe(1);
    expect((await set('admin', TIER.full, 'moderate', false)).status).toBe(200);
  });

  it('refuses to empty a text post', async () => {
    const response = await call('newbie', 'PATCH', `/links/${postId}`, { body: '   ' });
    expect(response.status).toBe(400);
  });

  it('keeps a pending tag that a moderator below staff could not see', async () => {
    const proposal = await db.tag.create({
      data: { slug: 'newbieword', name: 'newbieword', status: 'pending', createdBy: who('newbie').id },
    });
    const link = await db.link.findUniqueOrThrow({ where: { publicId: postId } });
    await db.linkTag.create({ data: { linkId: link.id, tagId: proposal.id } });

    expect((await set('admin', TIER.full, 'moderate', true)).status).toBe(200);
    const seen = (await (await call('member', 'GET', `/links/${postId}`)).json()) as { tags: unknown[] };
    expect(seen.tags).toEqual([]);

    const edited = await call('member', 'PATCH', `/links/${postId}`, { tagSlugs: [], newTagNames: [] });
    expect(edited.status).toBe(200);
    expect(await db.linkTag.count({ where: { linkId: link.id, tagId: proposal.id } })).toBe(1);

    // Staff see pending tags, so their list is the whole list.
    expect((await call('staffer', 'PATCH', `/links/${postId}`, { tagSlugs: [] })).status).toBe(200);
    expect(await db.linkTag.count({ where: { linkId: link.id } })).toBe(0);
    expect((await set('admin', TIER.full, 'moderate', false)).status).toBe(200);
  });

  it('honours a revoked editOwn without hiding the post', async () => {
    expect((await set('admin', TIER.limited, 'editOwn', false)).status).toBe(200);
    expect((await call('newbie', 'PATCH', `/links/${postId}`, { title: 'mine' })).status).toBe(403);
    expect((await set('admin', TIER.limited, 'editOwn', true)).status).toBe(200);
  });
});
