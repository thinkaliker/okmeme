import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resetEnv } from '../src/env.js';
import { blobStore, resetBlobStore } from '../src/ports/blob/index.js';
import { deriveAtSubmit, readOrRegenerate } from '../src/services/media.js';
import { thumbnailsEnabled } from '../src/services/settings.js';
import { decodeCursor, encodeCursor, parseLimit, toPage } from '../src/lib/cursor.js';
import { canonicalize, hostOf } from '../src/services/canonical.js';
import { isValidTagSlug, isValidUsername, toTagSlug } from '../src/lib/slug.js';
import { splitStatements } from '../src/lib/migrate.js';
import {
  canEditCell,
  effectivePermissions,
  isConfigurable,
  mayModerate,
  permissionMatrix,
  type Capability,
} from '../src/permissions.js';
import {
  TIER,
  can,
  canSetTier,
  isIdentified,
  isWithinRing,
  tierLabel,
} from '../src/tier.js';

describe('the ring rule', () => {
  it('shows exactly one rung up and no further', () => {
    // A limited user knows `full` exists and nothing beyond it.
    expect(isWithinRing(TIER.limited, TIER.full)).toBe(true);
    expect(isWithinRing(TIER.limited, TIER.staff)).toBe(false);
    expect(isWithinRing(TIER.anonymous, TIER.limited)).toBe(true);
    expect(isWithinRing(TIER.anonymous, TIER.full)).toBe(false);
  });

  it('attaches a real name only at or below the viewer', () => {
    expect(isIdentified(TIER.full, TIER.full)).toBe(true);
    expect(isIdentified(TIER.full, TIER.staff)).toBe(false);
  });

  it('never labels anything as anonymous', () => {
    expect(tierLabel(TIER.limited)).toBe('limited');
    expect(() => tierLabel(TIER.anonymous)).toThrow();
  });
});

describe('capabilities', () => {
  it('keeps owners out of participation', () => {
    expect(can.submit(TIER.owner)).toBe(false);
    expect(can.vote(TIER.owner)).toBe(false);
    expect(can.ownerSettings(TIER.owner)).toBe(true);
  });

  it('gives NSFW to full and above only', () => {
    expect(can.seeNsfw(TIER.limited)).toBe(false);
    expect(can.seeNsfw(TIER.full)).toBe(true);
  });

  it('lets staff moderate below them and admins moderate staff', () => {
    const as = (tier: number) => ({ tier, permissions: effectivePermissions(tier, new Map()) });
    expect(mayModerate(as(TIER.staff), TIER.full)).toBe(true);
    expect(mayModerate(as(TIER.staff), TIER.staff)).toBe(false);
    expect(mayModerate(as(TIER.admin), TIER.staff)).toBe(true);
    expect(mayModerate(as(TIER.admin), TIER.admin)).toBe(false);
    expect(mayModerate(as(TIER.full), TIER.limited)).toBe(false);
    expect(mayModerate(as(TIER.owner), TIER.limited)).toBe(false);
  });

  it('refuses to let an admin demote another admin', () => {
    expect(canSetTier(TIER.admin, TIER.admin, TIER.limited)).toBe(false);
    expect(canSetTier(TIER.admin, TIER.full, TIER.admin)).toBe(true);
    expect(canSetTier(TIER.staff, TIER.limited, TIER.full)).toBe(true);
    expect(canSetTier(TIER.staff, TIER.limited, TIER.staff)).toBe(false);
  });

  it('never moves anyone into or out of the owner set, not even for an owner', () => {
    // That set has its own route, which is the one that refuses to remove the
    // last owner. A re-tier that could reach it would skip that check.
    expect(canSetTier(TIER.owner, TIER.owner, TIER.limited)).toBe(false);
    expect(canSetTier(TIER.owner, TIER.owner, TIER.admin)).toBe(false);
    expect(canSetTier(TIER.owner, TIER.admin, TIER.owner)).toBe(false);
    expect(canSetTier(TIER.admin, TIER.owner, TIER.limited)).toBe(false);
    // Outside the set, an owner may still re-tier anyone, admins included.
    expect(canSetTier(TIER.owner, TIER.admin, TIER.full)).toBe(true);
    expect(canSetTier(TIER.owner, TIER.limited, TIER.admin)).toBe(true);
  });
});

describe('permissions', () => {
  const none = new Map<Capability, boolean>();
  const actor = (tier: number, overrides: ReadonlyMap<Capability, boolean> = none) => ({
    tier,
    permissions: effectivePermissions(tier, overrides),
  });

  it('defaults to exactly the fixed capability table', () => {
    for (let tier = TIER.anonymous; tier <= TIER.owner; tier += 1) {
      const granted = effectivePermissions(tier, none);
      expect(granted.has('submit')).toBe(can.submit(tier));
      expect(granted.has('vote')).toBe(can.vote(tier));
      expect(granted.has('bookmark')).toBe(can.bookmark(tier));
      expect(granted.has('postNsfw')).toBe(can.postNsfw(tier));
      expect(granted.has('seeNsfw')).toBe(can.seeNsfw(tier));
      expect(granted.has('createTags')).toBe(can.createTags(tier));
      expect(granted.has('moderate')).toBe(can.moderateContent(tier));
      expect(granted.has('reviewReports')).toBe(can.reviewReports(tier));
      expect(granted.has('ownerSettings')).toBe(can.ownerSettings(tier));
    }
    expect(effectivePermissions(TIER.anonymous, none).size).toBe(0);
  });

  it('applies overrides only to configurable cells', () => {
    const overrides = new Map<Capability, boolean>([
      ['submit', false],
      ['seeNsfw', true],
      ['reviewReports', true],
    ]);
    const limited = effectivePermissions(TIER.limited, overrides);
    expect(limited.has('submit')).toBe(false);
    // Fixed rows ignore a stored override rather than trusting it.
    expect(limited.has('seeNsfw')).toBe(false);
    expect(limited.has('reviewReports')).toBe(false);
  });

  it('never lets the owner column, a locked row, or a cell below the floor change', () => {
    expect(isConfigurable('submit', TIER.owner)).toBe(false);
    expect(isConfigurable('seeNsfw', TIER.full)).toBe(false);
    expect(isConfigurable('issueInvites', TIER.staff)).toBe(false);
    expect(isConfigurable('readAuditLog', TIER.staff)).toBe(false);
    // Limited never receives NSFW rows, so it cannot be allowed to post one.
    expect(isConfigurable('postNsfw', TIER.limited)).toBe(false);
    expect(isConfigurable('postNsfw', TIER.full)).toBe(true);
    expect(isConfigurable('moderate', TIER.limited)).toBe(false);
    expect(isConfigurable('moderate', TIER.full)).toBe(true);
  });

  it('lets admins and owners edit only tiers below their own', () => {
    expect(canEditCell(actor(TIER.admin), TIER.staff, 'moderate')).toBe(true);
    expect(canEditCell(actor(TIER.admin), TIER.admin, 'submit')).toBe(false);
    expect(canEditCell(actor(TIER.owner), TIER.admin, 'submit')).toBe(true);
    expect(canEditCell(actor(TIER.owner), TIER.owner, 'bookmark')).toBe(false);
    expect(canEditCell(actor(TIER.staff), TIER.limited, 'submit')).toBe(false);
    expect(canEditCell(actor(TIER.full), TIER.limited, 'submit')).toBe(false);
  });

  it('stops an admin handing out a permission they do not hold', () => {
    const stripped = actor(TIER.admin, new Map([['moderate', false]]));
    expect(canEditCell(stripped, TIER.staff, 'moderate')).toBe(false);
    expect(canEditCell(stripped, TIER.staff, 'submit')).toBe(true);
    // Owners hold almost nothing themselves and are exempt.
    expect(canEditCell(actor(TIER.owner), TIER.staff, 'moderate')).toBe(true);
  });

  it('extends moderation to full when granted, and still only strictly downward', () => {
    const full = actor(TIER.full, new Map([['moderate', true]]));
    expect(mayModerate(full, TIER.limited)).toBe(true);
    expect(mayModerate(full, TIER.full)).toBe(false);
    expect(mayModerate(full, TIER.staff)).toBe(false);
  });

  it('shows a viewer their own tier and below, and only rows that apply', () => {
    const grantsFor = (tier: number) => effectivePermissions(tier, none);

    const limited = permissionMatrix(actor(TIER.limited), grantsFor);
    expect(limited.tiers.map((column) => column.label)).toEqual(['limited']);
    expect(limited.rows.map((row) => row.capability)).toEqual([
      'submit',
      'vote',
      'bookmark',
      'editOwn',
    ]);
    expect(limited.rows.every((row) => row.cells.every((cell) => !cell.editable))).toBe(true);

    const admin = permissionMatrix(actor(TIER.admin), grantsFor);
    expect(admin.tiers.map((column) => column.label)).toEqual(['limited', 'full', 'staff', 'admin']);
    expect(admin.rows.some((row) => row.capability === 'ownerSettings')).toBe(false);
    const moderate = admin.rows.find((row) => row.capability === 'moderate');
    expect(moderate?.cells.map((cell) => cell.editable)).toEqual([false, true, true, false]);

    const owner = permissionMatrix(actor(TIER.owner), grantsFor);
    expect(owner.tiers).toHaveLength(5);
    const ownerSubmit = owner.rows.find((row) => row.capability === 'submit');
    expect(ownerSubmit?.cells.map((cell) => cell.editable)).toEqual([true, true, true, true, false]);
  });
});

describe('cursors', () => {
  it('round-trips', () => {
    expect(decodeCursor(encodeCursor({ rank: 17, id: 42 }))).toEqual({ rank: 17, id: 42 });
  });

  it('rejects garbage rather than silently paging from zero', () => {
    expect(() => decodeCursor('!!!not-base64!!!')).toThrow();
  });

  it('caps the page size', () => {
    expect(parseLimit('9999')).toBe(50);
    expect(parseLimit(undefined)).toBe(20);
    expect(parseLimit('-3')).toBe(20);
  });

  it('never emits a total, and reports the end of a list by omitting a cursor', () => {
    const rows = [{ n: 1 }, { n: 2 }];
    const page = toPage(rows, 5, (row) => row, (row) => ({ rank: row.n, id: row.n }));
    expect(page.nextCursor).toBeNull();
    expect(Object.keys(page)).toEqual(['items', 'nextCursor']);
  });

  it('emits a cursor when the extra row shows there is more', () => {
    const rows = [{ n: 3 }, { n: 2 }, { n: 1 }];
    const page = toPage(rows, 2, (row) => row, (row) => ({ rank: row.n, id: row.n }));
    expect(page.items).toHaveLength(2);
    expect(decodeCursor(page.nextCursor)).toEqual({ rank: 2, id: 2 });
  });
});

describe('url canonicalization', () => {
  it('applies the steps DESIGN.md fixes', () => {
    expect(canonicalize('https://WWW.Example.com/a?utm_source=x&b=2&a=1#frag')).toBe(
      'https://example.com/a?a=1&b=2',
    );
  });

  it('treats a bare origin the same with or without the slash', () => {
    expect(canonicalize('https://example.com')).toBe(canonicalize('https://example.com/'));
  });

  it('refuses anything that is not http(s)', () => {
    expect(() => canonicalize('javascript:alert(1)')).toThrow();
    expect(() => canonicalize('file:///etc/passwd')).toThrow();
  });

  it('extracts a host without www', () => {
    expect(hostOf('https://www.example.com/x')).toBe('example.com');
  });
});

describe('tag slugs', () => {
  it('collapses two spellings of one word into one tag', () => {
    expect(toTagSlug('Fresh Tag')).toBe(toTagSlug('fresh   tag'));
    expect(toTagSlug('  Café  ')).toBe('cafe');
  });

  it('rejects one-character tags', () => {
    expect(isValidTagSlug(toTagSlug('a'))).toBe(false);
    expect(isValidTagSlug(toTagSlug('ab'))).toBe(true);
  });

  it('keeps the username character set dull', () => {
    expect(isValidUsername('dana')).toBe(true);
    expect(isValidUsername('da na')).toBe(false);
    expect(isValidUsername('-dana')).toBe(false);
  });
});

describe('the migration splitter', () => {
  it('does not cut a dollar-quoted function body in half', () => {
    const sql = `
      CREATE TABLE t (id int);
      CREATE FUNCTION f() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'no; really';
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
      CREATE INDEX i ON t (id);
    `;
    const statements = splitStatements(sql);
    expect(statements).toHaveLength(3);
    expect(statements[1]).toContain('RAISE EXCEPTION');
    expect(statements[2]).toContain('CREATE INDEX');
  });

  it('drops comments without dropping statements', () => {
    expect(splitStatements('-- a comment\nSELECT 1; /* block */ SELECT 2;')).toEqual([
      'SELECT 1',
      'SELECT 2',
    ]);
  });
});

describe('thumbnails turned off', () => {
  /**
   * `BLOB_STORE=none` is the deployment-shaped half of the switch, and the only
   * half that can be checked without a database: it short-circuits before the
   * settings lookup, which is exactly the property that lets an instance with
   * nowhere to keep bytes boot at all.
   */
  function withNoStore<T>(run: () => Promise<T>): Promise<T> {
    process.env['BLOB_STORE'] = 'none';
    resetEnv();
    resetBlobStore();
    return run().finally(() => {
      delete process.env['BLOB_STORE'];
      resetEnv();
      resetBlobStore();
    });
  }

  it('is off when there is nowhere to put an image', async () => {
    await withNoStore(async () => {
      expect(await thumbnailsEnabled()).toBe(false);
    });
  });

  it('keeps nothing it is handed', async () => {
    await withNoStore(async () => {
      const store = blobStore();
      expect(store.name).toBe('none');
      // put resolves rather than throwing: a submission is not a failure
      // because the instance chose not to keep a picture of it.
      await store.put('th_l_1', { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/webp' });
      expect(await store.get('th_l_1')).toBeNull();
    });
  });

  it('serves nothing, so /thumb/:key is a 404 like any unknown key', async () => {
    await withNoStore(async () => {
      expect(await readOrRegenerate('th_l_1')).toBeNull();
      expect(await readOrRegenerate('fav_example.org')).toBeNull();
    });
  });

  it('hands the client no key, so nothing can become a foreign image URL', async () => {
    await withNoStore(async () => {
      // The degraded state is *fewer pictures*, never *pictures from the site
      // the link points at*. A thumbKey the client cannot resolve would be the
      // first step towards the client resolving it somewhere else.
      const derived = await deriveAtSubmit(
        'l_1',
        'https://example.org/og.png',
        'https://example.org/favicon.ico',
        'example.org',
      );
      expect(derived).toEqual({ thumbKey: null, faviconKey: null });
    });
  });
});

describe('the thumbnails migration', () => {
  it('is one statement that cannot flip an instance which already chose', () => {
    const sql = readFileSync(
      new URL('../migrations/0002_thumbnails_setting.sql', import.meta.url),
      'utf8',
    );
    const statements = splitStatements(sql);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('ON CONFLICT (key) DO NOTHING');
  });
});

describe('favicons, off unless switched on', () => {
  /**
   * The settings rows the switches read, without a database. A store is
   * configured (the test default is local-fs), so these exercise the setting
   * itself rather than the BLOB_STORE short-circuit.
   */
  async function withSettings<T>(
    rows: readonly { key: string; value: unknown }[],
    run: () => Promise<T>,
  ): Promise<T> {
    const { db } = await import('../src/db.js');
    const { vi } = await import('vitest');
    const spy = vi.spyOn(db.setting, 'findMany').mockResolvedValue(rows as never);
    return run().finally(() => spy.mockRestore());
  }

  it('is off on an instance that never wrote the setting', async () => {
    const { faviconsEnabled, mediaSwitches } = await import('../src/services/settings.js');
    await withSettings([], async () => {
      expect(await faviconsEnabled()).toBe(false);
      // Thumbnails keep their old default, and the two are independent.
      expect(await mediaSwitches()).toEqual({ thumbnails: true, favicons: false });
    });
  });

  it('is on only for a real true, and only with somewhere to put the bytes', async () => {
    const { faviconsEnabled } = await import('../src/services/settings.js');
    await withSettings([{ key: 'favicons_enabled', value: 'true' }], async () => {
      expect(await faviconsEnabled()).toBe(false);
    });
    await withSettings([{ key: 'favicons_enabled', value: true }], async () => {
      expect(await faviconsEnabled()).toBe(true);
    });

    process.env['BLOB_STORE'] = 'none';
    resetEnv();
    try {
      expect(await faviconsEnabled()).toBe(false);
    } finally {
      delete process.env['BLOB_STORE'];
      resetEnv();
    }
  });

  it('fetches no icon and serves none while off, with thumbnails still on', async () => {
    const { vi } = await import('vitest');
    resetBlobStore();
    const get = vi.spyOn(blobStore(), 'get');
    try {
      await withSettings([{ key: 'thumbnails_enabled', value: true }], async () => {
        const derived = await deriveAtSubmit(
          'l_1',
          null,
          'https://example.org/favicon.ico',
          'example.org',
        );
        expect(derived).toEqual({ thumbKey: null, faviconKey: null });
        expect(await readOrRegenerate('fav_example.org')).toBeNull();
        // Not even a look in the store: off is decided before any lookup.
        expect(get).not.toHaveBeenCalled();
      });
    } finally {
      get.mockRestore();
      resetBlobStore();
    }
  });

  it('sends no favicon key while off, and the stored one again once on', async () => {
    const { linkPayload } = await import('../src/serialize.js');
    const { effectivePermissions } = await import('../src/permissions.js');
    const viewer = {
      tier: TIER.anonymous,
      user: null,
      permissions: effectivePermissions(TIER.anonymous, new Map()),
    } as never;
    const row = {
      id: 1n,
      public_id: 'l_1',
      kind: 'link',
      url: 'https://example.org/post',
      media_type: null,
      title: 'a post',
      body: null,
      host: 'example.org',
      thumb_key: 'th_l_1',
      favicon_key: 'fav_example.org',
      is_nsfw: false,
      created_at: new Date(0),
      edited_at: null,
      removed_at: null,
      removed_reason: null,
      effective_tier: TIER.limited,
      attribution_tier: TIER.limited,
      pinned_tier: null,
      author_id: 2n,
      author_public_id: 'u_1',
      author_username: 'dana',
      category_slug: 'tech',
      category_name: 'Tech',
      score: 1,
      viewer_vote: 0,
      bookmarked: false,
      rank: 0n,
    } as never;

    expect(linkPayload(viewer, row, [], { thumbnails: true, favicons: false })).toMatchObject({
      thumbKey: 'th_l_1',
      faviconKey: null,
    });
    expect(linkPayload(viewer, row, [], { thumbnails: false, favicons: true })).toMatchObject({
      thumbKey: null,
      faviconKey: 'fav_example.org',
    });
  });
});

describe('the favicons migration', () => {
  it('is one statement, off, that cannot flip an instance which already chose', () => {
    const sql = readFileSync(
      new URL('../migrations/0006_favicons_setting.sql', import.meta.url),
      'utf8',
    );
    const statements = splitStatements(sql);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("('favicons_enabled', 'false'::jsonb, 4)");
    expect(statements[0]).toContain('ON CONFLICT (key) DO NOTHING');
  });
});

describe('permissions before the migration has run', () => {
  it('falls back to the defaults when the table does not exist, and only then', async () => {
    const { Prisma } = await import('@prisma/client');
    const { db } = await import('../src/db.js');
    const { loadPermissions } = await import('../src/services/permissions.js');
    const { vi } = await import('vitest');

    const missing = new Prisma.PrismaClientKnownRequestError('The table `tier_permissions` does not exist', {
      code: 'P2021',
      clientVersion: 'test',
    });
    const spy = vi.spyOn(db.tierPermission, 'findMany').mockRejectedValueOnce(missing);
    const granted = await loadPermissions(TIER.staff);
    expect(granted.has('moderate')).toBe(true);
    expect(granted.has('reviewReports')).toBe(false);

    const denied = new Prisma.PrismaClientKnownRequestError('permission denied for table tier_permissions', {
      code: 'P2010',
      clientVersion: 'test',
    });
    spy.mockRejectedValueOnce(denied);
    await expect(loadPermissions(TIER.staff)).rejects.toBe(denied);
    spy.mockRestore();
  });
});

describe('attribution of a post pinned below its author', () => {
  it('names the author only to viewers at or above both the post and the author', async () => {
    const { authorPayload } = await import('../src/serialize.js');
    const { effectivePermissions } = await import('../src/permissions.js');
    const viewerAt = (tier: number) =>
      ({ tier, user: null, permissions: effectivePermissions(tier, new Map()) }) as never;
    // An admin's post, pinned down to limited.
    const row = {
      effective_tier: TIER.limited,
      attribution_tier: TIER.admin,
      author_public_id: 'u_admin',
      author_username: 'root',
    } as never;

    expect(authorPayload(viewerAt(TIER.anonymous), row)).toEqual({ kind: 'tier', label: 'limited' });
    expect(authorPayload(viewerAt(TIER.limited), row)).toEqual({ kind: 'tier', label: 'full' });
    expect(authorPayload(viewerAt(TIER.staff), row)).toEqual({ kind: 'tier', label: 'admin' });
    expect(authorPayload(viewerAt(TIER.admin), row)).toEqual({ kind: 'user', id: 'u_admin', name: 'root' });

    // Pinned *up* above a limited author: the old rule, unchanged.
    const up = { effective_tier: TIER.full, attribution_tier: TIER.limited, author_public_id: 'u_l', author_username: 'dana' } as never;
    expect(authorPayload(viewerAt(TIER.limited), up)).toEqual({ kind: 'tier', label: 'full' });
    expect(authorPayload(viewerAt(TIER.full), up)).toMatchObject({ kind: 'user', name: 'dana' });
  });
});

describe('an author moving their own post', () => {
  it('allows narrowing always, widening with postBelow, and nothing above the author', async () => {
    const { canSetOwnTier, canAdjustOwnTier, effectivePermissions } = await import('../src/permissions.js');
    const full = { tier: TIER.full, permissions: effectivePermissions(TIER.full, new Map()) };
    const fullBelow = { tier: TIER.full, permissions: new Set(['postBelow'] as const) };

    // Posted to everyone by accident: back up to full needs nothing.
    expect(canSetOwnTier(full, TIER.limited, null)).toBe(true);
    expect(canSetOwnTier(full, TIER.limited, TIER.full)).toBe(true);
    expect(canAdjustOwnTier(full, TIER.limited)).toBe(true);
    // Down again does.
    expect(canSetOwnTier(full, TIER.full, TIER.limited)).toBe(false);
    expect(canSetOwnTier(fullBelow, TIER.full, TIER.limited)).toBe(true);
    expect(canAdjustOwnTier(full, TIER.full)).toBe(false);
    // Never above the author, and not a post a moderator pinned above them.
    expect(canSetOwnTier(fullBelow, TIER.full, TIER.staff)).toBe(false);
    expect(canSetOwnTier(fullBelow, TIER.staff, null)).toBe(false);
  });
});
