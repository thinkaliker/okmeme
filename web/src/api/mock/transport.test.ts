import { beforeEach, describe, expect, it } from 'vitest';
import { createMockTransport } from '@/api/mock/transport';
import type { Author } from '@/domain/author';
import type { Link } from '@/domain/link';
import type { Page } from '@/domain/page';

/**
 * These are visibility tests, not fixture tests.
 *
 * The client can only be as correct as what it is handed, so the fake has to be
 * held to the same rule the server will be: `E <= T` gets a name, `E == T + 1`
 * gets a bare label and no id, and `E > T + 1` does not exist. Every assertion
 * below is one row of the table in VISIBILITY.md.
 */

const api = createMockTransport();

const feed = (): Promise<Page<Link>> => api.request<Page<Link>>('GET', '/feed', { query: { limit: 50 } });

const loginAs = (username: string | null) =>
  username === null
    ? api.request('POST', '/auth/logout')
    : api.request('POST', '/auth/login', { body: { username } });

function authorsOf(page: Page<Link>): Author[] {
  return page.items.map((item) => item.author);
}

beforeEach(async () => {
  await loginAs(null);
});

describe('the +1 rule', () => {
  it('shows an anonymous viewer limited-tier content only, never by name', async () => {
    const page = await feed();
    expect(page.items.length).toBeGreaterThan(0);
    for (const author of authorsOf(page)) {
      expect(author.kind).toBe('tier');
      if (author.kind === 'tier') expect(author.label).toBe('limited');
    }
  });

  it('omits the id entirely for an above-tier author, rather than nulling it', async () => {
    await loginAs('dana'); // limited
    const page = await feed();
    const aboveTier = authorsOf(page).filter((author) => author.kind === 'tier');
    expect(aboveTier.length).toBeGreaterThan(0);
    for (const author of aboveTier) {
      expect('id' in author).toBe(false);
      expect('name' in author).toBe(false);
    }
  });

  it('names authors at or below the viewer and labels exactly one rung up', async () => {
    await loginAs('sandra'); // full
    const page = await feed();
    const labels = new Set(
      authorsOf(page)
        .filter((author) => author.kind === 'tier')
        .map((author) => (author.kind === 'tier' ? author.label : '')),
    );
    // A full viewer knows staff exists. Nothing beyond it.
    expect(labels).toEqual(new Set(['staff']));
    expect(authorsOf(page).some((author) => author.kind === 'user')).toBe(true);
  });

  it('never reveals depth past one rung', async () => {
    await loginAs('dana'); // limited: must not learn that staff, admin or owner exist
    const labels = authorsOf(await feed())
      .filter((author) => author.kind === 'tier')
      .map((author) => (author.kind === 'tier' ? author.label : ''));
    expect(labels).not.toContain('staff');
    expect(labels).not.toContain('admin');
    expect(labels).not.toContain('owner');
  });

  it('reveals retroactively on promotion', async () => {
    await loginAs('dana');
    const asLimited = await feed();
    await loginAs('sandra');
    const asFull = await feed();

    const fullTierPost = 'l_7xz44b'; // authored by sandra, tier 2
    const before = asLimited.items.find((item) => item.publicId === fullTierPost);
    const after = asFull.items.find((item) => item.publicId === fullTierPost);

    expect(before?.author.kind).toBe('tier');
    expect(after?.author.kind).toBe('user');
  });
});

describe('the rest of the predicate', () => {
  it('keeps content-hold authors out of every feed', async () => {
    for (const username of ['dana', 'sandra', 'pip', 'root']) {
      await loginAs(username);
      const held = (await feed()).items.find((item) => item.publicId === 'l_1zz44k');
      expect(held).toBeUndefined();
    }
  });

  it('honours a moderator re-tier over the author current tier', async () => {
    await loginAs('dana'); // limited
    const page = await feed();
    // Authored by a full user, pinned to limited: visible — but not by name.
    // The pin moves the post down, not its author: a name shown here would be
    // a full user's identity crossing into limited, the handle the ring forbids.
    const pinned = page.items.find((item) => item.publicId === 'l_0jj88j');
    expect(pinned).toBeDefined();
    expect(pinned?.author).toEqual({ kind: 'tier', label: 'full' });

    await loginAs('sandra'); // full: the author's own tier, so by name
    const asFull = (await feed()).items.find((item) => item.publicId === 'l_0jj88j');
    expect(asFull?.author.kind).toBe('user');
  });

  it('lets an author post to a lower tier, never above, and keeps their name to themselves', async () => {
    const draft = (pinnedTier: number | null) => ({
      kind: 'text', title: `posted at ${pinnedTier}`, url: '', body: 'body', categorySlug: 'tech',
      tagSlugs: [], newTagNames: [], isNsfw: false, pinnedTier,
    });
    const status = (promise: Promise<unknown>) =>
      promise.then(() => 201, (error: { status: number }) => error.status);

    await loginAs('sandra'); // full: postBelow is staff and up by default
    expect(await status(api.request('POST', '/links', { body: draft(1) }))).toBe(403);
    await loginAs('pip'); // staff
    expect(await status(api.request('POST', '/links', { body: draft(4) }))).toBe(403);

    await loginAs('root'); // admin, posting all the way down
    const posted = await api.request<Link>('POST', '/links', { body: draft(1) });
    expect(posted.author.kind).toBe('user');

    const authorFor = async (username: string | null) => {
      await loginAs(username);
      return (await api.request<Link>('GET', `/links/${posted.publicId}`)).author;
    };
    expect(await authorFor(null)).toEqual({ kind: 'tier', label: 'limited' });
    expect(await authorFor('dana')).toEqual({ kind: 'tier', label: 'full' });
    expect(await authorFor('pip')).toEqual({ kind: 'tier', label: 'admin' });

    // Staff see it, cannot moderate it: its author stands above them.
    await loginAs('pip');
    expect((await api.request<Link>('GET', `/links/${posted.publicId}`)).viewerCan.moderate).toBe(false);
  });

  it('never sends nsfw rows to a limited viewer', async () => {
    await loginAs('dana');
    expect((await feed()).items.some((item) => item.isNsfw)).toBe(false);
  });

  it('sends nsfw rows to a full viewer who asked for them', async () => {
    await loginAs('sandra');
    await api.request('PATCH', '/me', { body: { showNsfw: true } });
    expect((await feed()).items.some((item) => item.isNsfw)).toBe(true);

    await api.request('PATCH', '/me', { body: { showNsfw: false } });
    expect((await feed()).items.some((item) => item.isNsfw)).toBe(false);
  });

  it('keeps removed rows out of the feed', async () => {
    await loginAs('root');
    expect((await feed()).items.some((item) => item.removed !== null)).toBe(false);
  });

  it('answers 404 for a link above the viewer tier, the same as for one that does not exist', async () => {
    await loginAs('dana');
    const hidden = api.request('GET', '/links/l_6pp31h'); // admin-authored
    const absent = api.request('GET', '/links/l_nope');
    await expect(hidden).rejects.toMatchObject({ status: 404 });
    await expect(absent).rejects.toMatchObject({ status: 404 });
  });
});

describe('pagination', () => {
  it('returns a cursor and no total', async () => {
    await loginAs('root');
    const page = await api.request<Page<Link>>('GET', '/feed', { query: { limit: 3 } });
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).not.toBeNull();
    expect(page).not.toHaveProperty('total');
    expect(page).not.toHaveProperty('count');

    const second = await api.request<Page<Link>>('GET', '/feed', {
      query: { limit: 3, cursor: page.nextCursor },
    });
    const firstIds = page.items.map((item) => item.publicId);
    expect(second.items.every((item) => !firstIds.includes(item.publicId))).toBe(true);
  });
});

describe('proposed tags', () => {
  const draft = {
    kind: 'link' as const,
    title: 'a post carrying a brand new tag',
    url: 'https://proposals.example.org/one',
    body: '',
    categorySlug: 'tech',
    tagSlugs: [],
    newTagNames: ['Totally New Thing'],
    isNsfw: false,
  };

  it('applies the tag to the post but shows it only to its proposer', async () => {
    await loginAs('dana'); // limited
    const created = await api.request<Link>('POST', '/links', { body: draft });
    const slug = 'totally-new-thing';

    expect(created.tags.map((tag) => tag.slug)).toContain(slug);
    expect(created.tags.find((tag) => tag.slug === slug)?.pending).toBe(true);

    // Another user at the same tier sees the post without the tag.
    await loginAs('kes');
    const asOther = (await feed()).items.find((item) => item.publicId === created.publicId);
    expect(asOther).toBeDefined();
    expect(asOther?.tags.map((tag) => tag.slug)).not.toContain(slug);

    // A reviewer sees it, marked pending.
    await loginAs('pip'); // staff
    const asStaff = (await feed()).items.find((item) => item.publicId === created.publicId);
    expect(asStaff?.tags.find((tag) => tag.slug === slug)?.pending).toBe(true);
  });

  it('keeps other people’s pending tags out of the tag list', async () => {
    await loginAs('kes');
    const listed = await api.request<readonly { slug: string }[]>('GET', '/tags');
    expect(listed.map((tag) => tag.slug)).not.toContain('totally-new-thing');

    await loginAs('pip');
    const asStaff = await api.request<readonly { slug: string }[]>('GET', '/tags');
    expect(asStaff.map((tag) => tag.slug)).toContain('totally-new-thing');
  });

  it('hides the queue from anyone who cannot create a tag', async () => {
    await loginAs('dana');
    await expect(api.request('GET', '/tags/pending')).rejects.toMatchObject({ status: 404 });
    await expect(api.request('POST', '/tags/totally-new-thing/approve')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('creates the tag outright when the author is already allowed to', async () => {
    // Staff and above never produce a proposal, which is what keeps every
    // pending tag traceable to someone the reviewer can already see.
    await loginAs('pip');
    const created = await api.request<Link>('POST', '/links', {
      body: { ...draft, url: 'https://proposals.example.org/two', newTagNames: ['staff made this'] },
    });
    expect(created.tags.find((tag) => tag.slug === 'staff-made-this')?.pending).toBe(false);
  });

  it('makes an approved tag visible to everyone', async () => {
    await loginAs('pip');
    await api.request('POST', '/tags/totally-new-thing/approve');

    await loginAs('kes');
    const listed = await api.request<readonly { slug: string }[]>('GET', '/tags');
    expect(listed.map((tag) => tag.slug)).toContain('totally-new-thing');
  });
});

describe('dedup on submission', () => {
  it('only matches urls the submitter can already see', async () => {
    const url = 'https://example.org/invite-min-tier'; // admin-authored post

    await loginAs('dana');
    const asLimited = await api.request<{ duplicate: unknown }>('POST', '/links/preview', {
      body: { url },
    });
    expect(asLimited.duplicate).toBeNull();

    await loginAs('root');
    const asAdmin = await api.request<{ duplicate: unknown }>('POST', '/links/preview', {
      body: { url },
    });
    expect(asAdmin.duplicate).not.toBeNull();
  });

  it('canonicalises before comparing', async () => {
    await loginAs('root');
    const result = await api.request<{ canonicalUrl: string; duplicate: unknown }>(
      'POST',
      '/links/preview',
      { body: { url: 'https://WWW.example.org/invite-min-tier?utm_source=x#frag' } },
    );
    expect(result.canonicalUrl).toBe('https://example.org/invite-min-tier');
    expect(result.duplicate).not.toBeNull();
  });
});

describe('permissions', () => {
  interface Matrix {
    tiers: { tier: number; label: string }[];
    rows: { capability: string; cells: { tier: number; granted: boolean; editable: boolean }[] }[];
  }
  const set = (tier: number, capability: string, granted: boolean) =>
    api.request<Matrix>('PATCH', '/admin/permissions', { body: { tier, capability, granted } });
  const status = (promise: Promise<unknown>) =>
    promise.then(
      () => 200,
      (error: { status: number }) => error.status,
    );

  it('shows a limited viewer their own column and nothing about the tiers above', async () => {
    await loginAs('dana');
    const table = await api.request<Matrix>('GET', '/me/permissions');
    expect(table.tiers.map((column) => column.label)).toEqual(['limited']);
    expect(table.rows.map((row) => row.capability)).toEqual(['submit', 'vote', 'bookmark', 'editOwn']);
  });

  it('lets an admin change tiers below admin and nothing else', async () => {
    await loginAs('root');
    expect(await status(set(4, 'submit', false))).toBe(403);
    expect(await status(set(2, 'seeNsfw', false))).toBe(403);
    expect(await status(set(1, 'postNsfw', true))).toBe(403);

    const table = await set(1, 'submit', false);
    expect(table.rows.find((row) => row.capability === 'submit')?.cells[0]).toMatchObject({
      granted: false,
      editable: true,
    });

    await loginAs('dana');
    const me = await api.request<{ permissions: string[] }>('GET', '/me');
    expect(me.permissions).not.toContain('submit');

    await loginAs('root');
    await set(1, 'submit', true);
  });

  it('refuses the table to anyone below admin', async () => {
    await loginAs('pip');
    expect(await status(set(1, 'vote', false))).toBe(403);
  });

  it('tells each viewer what they may do to a post', async () => {
    await loginAs('root');
    const byDana = (await feed()).items.find(
      (item) => item.author.kind === 'user' && item.author.name === 'dana',
    );
    expect(byDana).toBeDefined();
    if (byDana === undefined) return;
    expect(byDana.viewerCan).toEqual({ edit: true, remove: true, retier: true, moderate: true, setTier: false });

    await loginAs('sandra'); // full: above dana, no moderation by default
    const asFull = await api.request<Link>('GET', `/links/${byDana.publicId}`);
    expect(asFull.viewerCan).toEqual({ edit: false, remove: false, retier: false, moderate: false, setTier: false });

    await loginAs('dana');
    const asAuthor = await api.request<Link>('GET', `/links/${byDana.publicId}`);
    expect(asAuthor.viewerCan).toMatchObject({ edit: true, remove: true, moderate: false });

    await loginAs(null);
    const anonymous = await api.request<Link>('GET', `/links/${byDana.publicId}`);
    expect(anonymous.viewerCan).toEqual({ edit: false, remove: false, retier: false, moderate: false, setTier: false });
  });

  it('edits through PATCH and marks the post edited', async () => {
    await loginAs('root');
    const target = (await feed()).items.find(
      (item) => item.author.kind === 'user' && item.author.name === 'dana' && item.kind !== 'text',
    );
    expect(target).toBeDefined();
    if (target === undefined) return;
    const edited = await api.request<Link>('PATCH', `/links/${target.publicId}`, {
      body: { title: 'retitled by a moderator' },
    });
    expect(edited.title).toBe('retitled by a moderator');
    expect(edited.editedAt).not.toBeNull();
  });
});

describe('editing tags', () => {
  const tagSlugs = (link: Link) => link.tags.map((tag) => `${tag.slug}${tag.pending ? '?' : ''}`).sort();

  it('replaces the list, creating new names outright for a tier that holds createTags', async () => {
    await loginAs('dana');
    const posted = await api.request<Link>('POST', '/links', {
      body: {
        kind: 'text', title: 'tag me', url: '', body: 'body', categorySlug: 'tech',
        tagSlugs: ['longread'], newTagNames: [], isNsfw: false,
      },
    });

    await loginAs('root');
    const edited = await api.request<Link>('PATCH', `/links/${posted.publicId}`, {
      body: { tagSlugs: [], newTagNames: ['freshword'] },
    });
    expect(tagSlugs(edited)).toEqual(['freshword']);
  });

  it('keeps a pending tag the editor could not see', async () => {
    await loginAs('dana'); // limited: a new name is a proposal
    const posted = await api.request<Link>('POST', '/links', {
      body: {
        kind: 'text', title: 'proposal inside', url: '', body: 'body', categorySlug: 'tech',
        tagSlugs: ['longread'], newTagNames: ['danaword'], isNsfw: false,
      },
    });
    expect(tagSlugs(posted)).toEqual(['danaword?', 'longread']);

    await loginAs('root');
    await api.request('PATCH', '/admin/permissions', { body: { tier: 2, capability: 'moderate', granted: true } });

    await loginAs('sandra'); // full, now a moderator of limited, and blind to the proposal
    const asModerator = await api.request<Link>('GET', `/links/${posted.publicId}`);
    expect(tagSlugs(asModerator)).toEqual(['longread']);
    await api.request('PATCH', `/links/${posted.publicId}`, { body: { tagSlugs: [], newTagNames: [] } });

    await loginAs('dana');
    expect(tagSlugs(await api.request<Link>('GET', `/links/${posted.publicId}`))).toEqual(['danaword?']);

    await loginAs('root');
    await api.request('PATCH', '/admin/permissions', { body: { tier: 2, capability: 'moderate', granted: false } });
  });
});

describe('an author moving their own post', () => {
  const status = (promise: Promise<unknown>) =>
    promise.then(() => 200, (error: { status: number }) => error.status);

  it('raises an accidentally public post back up without any permission, and lowers it only with one', async () => {
    await loginAs('pip'); // staff
    const posted = await api.request<Link>('POST', '/links', {
      body: {
        kind: 'text', title: 'oops, too public', url: '', body: 'body', categorySlug: 'tech',
        tagSlugs: [], newTagNames: [], isNsfw: false, pinnedTier: 1,
      },
    });
    expect(posted.pinnedTier).toBe(1);
    expect(posted.viewerCan.setTier).toBe(true);
    const move = (tier: number | null) =>
      api.request<Link>('POST', `/links/${posted.publicId}/tier`, { body: { tier } });

    await loginAs('root');
    await api.request('PATCH', '/admin/permissions', { body: { tier: 3, capability: 'postBelow', granted: false } });
    // Someone else's view never carries the author's choice.
    expect('pinnedTier' in (await api.request<Link>('GET', `/links/${posted.publicId}`))).toBe(false);
    expect(await status(move(3))).toBe(404);

    await loginAs('pip');
    expect(await status(move(4))).toBe(403); // never above the author
    const raised = await move(null);
    expect(raised.pinnedTier).toBe(3); // their own tier, pinned
    expect(raised.editedAt).toBeNull(); // not an edit
    expect(await status(move(2))).toBe(403); // widening needs postBelow

    await loginAs('dana');
    expect(await status(api.request('GET', `/links/${posted.publicId}`))).toBe(404);

    await loginAs('root');
    await api.request('PATCH', '/admin/permissions', { body: { tier: 3, capability: 'postBelow', granted: true } });
  });
});

describe('view as a lower tier', () => {
  const page = (query: Record<string, string | number> = {}) =>
    api.request<Page<Link>>('GET', '/feed', { query: { limit: 50, ...query } });
  const status = (promise: Promise<unknown>) =>
    promise.then(
      () => 200,
      (error: { status: number }) => error.status,
    );
  const shape = (items: readonly Link[]) =>
    items.map((item) => [item.publicId, item.author]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  it('hands an admin exactly what a limited reader is handed', async () => {
    await loginAs('dana');
    const limited = shape((await page()).items);
    await loginAs('root');
    expect(shape((await page({ view_as: 1 })).items)).toEqual(limited);

    await loginAs(null);
    const anonymous = shape((await page()).items);
    await loginAs('root');
    expect(shape((await page({ view_as: 0 })).items)).toEqual(anonymous);
  });

  it('answers for nobody in particular', async () => {
    await loginAs('root');
    const first = (await page()).items[0];
    if (first === undefined) throw new Error('fixtures have no posts');
    await api.request('POST', `/links/${first.publicId}/vote`);
    await api.request('POST', `/links/${first.publicId}/bookmark`);

    const seen = (await page({ view_as: 3 })).items.find((item) => item.publicId === first.publicId);
    expect(seen).toMatchObject({ viewerVote: 0, bookmarked: false });
    for (const item of (await page({ view_as: 3 })).items) {
      expect(Object.values(item.viewerCan).some(Boolean)).toBe(false);
      expect('pinnedTier' in item).toBe(false);
    }
    const bookmarked = await api.request<Page<Link>>('GET', '/search', {
      query: { bookmarked: true, view_as: 3 },
    });
    expect(bookmarked.items).toEqual([]);

    await api.request('DELETE', `/links/${first.publicId}/vote`);
    await api.request('DELETE', `/links/${first.publicId}/bookmark`);
  });

  it('only goes down, with one answer for every tier above', async () => {
    await loginAs('sandra');
    for (const tier of [3, 4, 5, 9]) expect(await status(page({ view_as: tier }))).toBe(403);
    expect(await status(page({ view_as: 'full' }))).toBe(400);
    expect(shape((await page({ view_as: 2 })).items)).toEqual(shape((await page()).items));
    await loginAs(null);
    expect(await status(page({ view_as: 1 }))).toBe(403);
  });

  it('reads a single link through the same lens', async () => {
    await loginAs('root');
    const own = (await page()).items.map((item) => item.publicId);
    const forLimited = new Set((await page({ view_as: 1 })).items.map((item) => item.publicId));
    const hidden = own.find((id) => !forLimited.has(id));
    if (hidden === undefined) throw new Error('fixtures have nothing above full');
    expect(await status(api.request('GET', `/links/${hidden}`, { query: { view_as: 1 } }))).toBe(404);
    expect(await status(api.request('GET', `/links/${hidden}`))).toBe(200);
  });

});
