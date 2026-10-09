import { db } from '../db.js';
import { isValidTagSlug, toTagSlug } from '../lib/slug.js';
import { TIER } from '../tier.js';
import { audit } from './audit.js';

/**
 * Tag resolution at submission time.
 *
 * An author below staff may **propose** a tag. The proposal applies to their
 * own post immediately but renders only to them and to staff until approved —
 * an unapproved word must not reach every reader on one person's say-so.
 *
 * Staff and above create tags outright and never produce a proposal, which is
 * what keeps the queue from leaking: every pending row traces back to someone
 * its reviewer can already see.
 */
export async function resolveTagIds(input: {
  slugs: readonly string[];
  names: readonly string[];
  authorId: bigint;
  authorTier: number;
}): Promise<bigint[]> {
  const wanted = new Set<string>();

  for (const slug of input.slugs) {
    const normalised = toTagSlug(slug);
    if (isValidTagSlug(normalised)) wanted.add(normalised);
  }
  for (const name of input.names) {
    const normalised = toTagSlug(name);
    if (isValidTagSlug(normalised)) wanted.add(normalised);
  }
  if (wanted.size === 0) return [];

  const slugs = [...wanted];
  const existing = await db.tag.findMany({ where: { slug: { in: slugs } } });
  const bySlug = new Map(existing.map((tag) => [tag.slug, tag]));

  const ids: bigint[] = [];

  for (const slug of slugs) {
    const found = bySlug.get(slug);
    if (found !== undefined) {
      // Joining someone else's pending proposal returns the same answer as
      // creating one. A different answer would say whether a stranger had
      // already proposed the word.
      ids.push(found.id);
      continue;
    }

    const status = input.authorTier >= TIER.staff ? 'approved' : 'pending';
    const created = await db.tag.upsert({
      where: { slug },
      update: {},
      create: { slug, name: slug, status, createdBy: input.authorId },
    });
    ids.push(created.id);

    if (status === 'approved') {
      await audit({
        actorId: input.authorId,
        action: 'tag.created',
        subjectType: 'tag',
        subjectId: slug,
        after: { slug },
      });
    }
  }

  return ids;
}

/**
 * Approved tags for everyone, plus the caller's own pending proposals so their
 * submit form can show them. Other people's pending tags are staff-only.
 */
export async function listTags(viewer: {
  userId: bigint | null;
  tier: number;
}): Promise<{ slug: string; name: string; pending: boolean }[]> {
  const rows = await db.tag.findMany({
    where:
      viewer.tier >= TIER.staff
        ? {}
        : viewer.userId === null
          ? { status: 'approved' }
          : { OR: [{ status: 'approved' }, { status: 'pending', createdBy: viewer.userId }] },
    orderBy: { name: 'asc' },
  });

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    pending: row.status === 'pending',
  }));
}
