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
    // Authored by a full user, pinned to limited: visible, and by name.
    const pinned = page.items.find((item) => item.publicId === 'l_0jj88j');
    expect(pinned).toBeDefined();
    expect(pinned?.author.kind).toBe('user');
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
