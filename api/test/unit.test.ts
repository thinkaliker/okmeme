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
  TIER,
  can,
  canModerateTier,
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
    expect(canModerateTier(TIER.staff, TIER.full)).toBe(true);
    expect(canModerateTier(TIER.staff, TIER.staff)).toBe(false);
    expect(canModerateTier(TIER.admin, TIER.staff)).toBe(true);
    expect(canModerateTier(TIER.admin, TIER.admin)).toBe(false);
  });

  it('refuses to let an admin demote another admin', () => {
    expect(canSetTier(TIER.admin, TIER.admin, TIER.limited)).toBe(false);
    expect(canSetTier(TIER.admin, TIER.full, TIER.admin)).toBe(true);
    expect(canSetTier(TIER.staff, TIER.limited, TIER.full)).toBe(true);
    expect(canSetTier(TIER.staff, TIER.limited, TIER.staff)).toBe(false);
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
