import { Prisma } from '@prisma/client';
import { db } from './db.js';
import type { Viewer } from './context.js';
import { TIER } from './tier.js';

/**
 * The ring predicate, in SQL, in one place.
 *
 * Rule one of the API: **filter in SQL, never in application code.** A
 * post-filter that runs after pagination yields short pages, and short pages
 * count hidden rows — which is the same leak as returning a total, arrived at
 * by arithmetic instead of by field.
 *
 * Every list in the product goes through `linkPredicate` below. Adding a query
 * that reimplements it is the failure mode this file exists to prevent.
 */

export interface LinkRow {
  id: bigint;
  public_id: string;
  kind: 'link' | 'text' | 'media';
  url: string | null;
  media_type: 'image' | 'video' | 'audio' | null;
  title: string;
  body: string | null;
  host: string | null;
  thumb_key: string | null;
  favicon_key: string | null;
  is_nsfw: boolean;
  created_at: Date;
  edited_at: Date | null;
  removed_at: Date | null;
  removed_reason: string | null;
  effective_tier: number;
  author_id: bigint;
  author_public_id: string;
  author_username: string | null;
  category_slug: string;
  category_name: string;
  score: number;
  viewer_vote: number;
  bookmarked: boolean;
  rank: bigint;
}

export type Sort = 'new' | 'top' | 'relevance';

export interface LinkQuery {
  readonly viewer: Viewer;
  readonly limit: number;
  readonly cursor: { rank: number; id: number } | null;
  readonly sort: Sort;
  readonly categorySlug?: string | undefined;
  readonly tagSlug?: string | undefined;
  readonly search?: string | undefined;
  readonly bookmarkedOnly?: boolean;
  readonly authorId?: bigint | undefined;
  /** Moderator views only. Lists never set this. */
  readonly includeRemoved?: boolean;
}

/**
 * `effective_tier = COALESCE(links.pinned_tier, author.tier)`.
 *
 * Visibility follows the author's **current** tier, not the tier they held when
 * posting: promotion and demotion move a whole back catalogue. `pinned_tier` is
 * the moderator's override and the tombstone a deleted account leaves behind so
 * the join still resolves. `author_tier_at_post` is audit only and is never
 * consulted here.
 */
export const EFFECTIVE_TIER = Prisma.sql`COALESCE(l.pinned_tier, u.tier)`;

/** Epoch microseconds — Postgres' own timestamp resolution, so no row is skipped. */
const RANK_NEW = Prisma.sql`(EXTRACT(EPOCH FROM l.created_at) * 1000000)::bigint`;

function contentHoldClause(): Prisma.Sql {
  // The only suspension type that touches visibility. It is also the only one
  // observable from outside, which is why GAPS.md says to use it deliberately.
  return Prisma.sql`
    NOT EXISTS (
      SELECT 1 FROM suspensions s
      WHERE s.user_id = l.author_id
        AND 'content_hold' = ANY(s.types)
        AND s.lifted_at IS NULL
        AND (s.expires_at IS NULL OR s.expires_at > now())
    )`;
}

export function linkPredicate(viewer: Viewer, includeRemoved = false): Prisma.Sql {
  const tier = viewer.tier;
  const showNsfw = viewer.showNsfw && tier >= TIER.full;

  return Prisma.sql`
    ${includeRemoved ? Prisma.sql`TRUE` : Prisma.sql`l.removed_at IS NULL`}
    AND ${EFFECTIVE_TIER} <= ${tier}::int + 1
    AND (NOT l.is_nsfw OR ${showNsfw})
    AND ${contentHoldClause()}
    AND u.state = 'active'
  `;
}

/**
 * A pending tag renders only to the person who proposed it and to staff and
 * above. Filtering *by* a tag obeys the same rule, or the filter itself becomes
 * a way to ask whether a word exists.
 */
function tagVisibility(viewer: Viewer): Prisma.Sql {
  if (viewer.tier >= TIER.staff) return Prisma.sql`TRUE`;
  if (viewer.user === null) return Prisma.sql`t.status = 'approved'`;
  return Prisma.sql`(t.status = 'approved' OR l.author_id = ${viewer.user.id})`;
}

export async function queryLinks(query: LinkQuery): Promise<LinkRow[]> {
  const { viewer, limit, cursor, sort } = query;
  const viewerId = viewer.user?.id ?? null;

  const filters: Prisma.Sql[] = [linkPredicate(viewer, query.includeRemoved === true)];

  if (query.categorySlug !== undefined) {
    filters.push(Prisma.sql`c.slug = ${query.categorySlug}`);
  }

  if (query.tagSlug !== undefined) {
    filters.push(Prisma.sql`
      EXISTS (
        SELECT 1 FROM link_tags lt JOIN tags t ON t.id = lt.tag_id
        WHERE lt.link_id = l.id AND t.slug = ${query.tagSlug} AND ${tagVisibility(viewer)}
      )`);
  }

  if (query.bookmarkedOnly === true && viewerId !== null) {
    filters.push(Prisma.sql`
      EXISTS (SELECT 1 FROM bookmarks b WHERE b.link_id = l.id AND b.user_id = ${viewerId})`);
  }

  if (query.authorId !== undefined) {
    filters.push(Prisma.sql`l.author_id = ${query.authorId}`);
  }

  const hasSearch = query.search !== undefined && query.search.trim() !== '';
  if (hasSearch) {
    filters.push(
      Prisma.sql`l.search_vec @@ websearch_to_tsquery('english', ${query.search as string})`,
    );
  }

  // The rank expression is both the ORDER BY key and the cursor payload, so the
  // two can never disagree about where a page ended.
  const rankExpr: Prisma.Sql = hasSearch && sort === 'relevance'
    ? Prisma.sql`(ts_rank(l.search_vec, websearch_to_tsquery('english', ${query.search as string})) * 1000000)::bigint`
    : sort === 'top'
      ? Prisma.sql`COALESCE(ls.score, 0)::bigint`
      : RANK_NEW;

  if (cursor !== null) {
    filters.push(
      Prisma.sql`(${rankExpr} < ${cursor.rank}::bigint
        OR (${rankExpr} = ${cursor.rank}::bigint AND l.id < ${BigInt(cursor.id)}))`,
    );
  }

  const where = filters.reduce((acc, part, index) =>
    index === 0 ? part : Prisma.sql`${acc} AND ${part}`,
  );

  // limit + 1: the extra row is how "there is more" is answered without a count.
  return db.$queryRaw<LinkRow[]>`
    SELECT
      l.id,
      l.public_id,
      l.kind::text  AS kind,
      l.url,
      l.media_type::text AS media_type,
      l.title,
      l.body,
      l.host,
      l.thumb_key,
      l.favicon_key,
      l.is_nsfw,
      l.created_at,
      l.edited_at,
      l.removed_at,
      l.removed_reason,
      ${EFFECTIVE_TIER}::int AS effective_tier,
      l.author_id,
      u.public_id   AS author_public_id,
      u.username::text AS author_username,
      c.slug        AS category_slug,
      c.name        AS category_name,
      COALESCE(ls.score, 0)::int AS score,
      COALESCE((
        SELECT v.value FROM votes v
        WHERE v.link_id = l.id AND v.user_id = ${viewerId}
      ), 0)::int AS viewer_vote,
      EXISTS (
        SELECT 1 FROM bookmarks b WHERE b.link_id = l.id AND b.user_id = ${viewerId}
      ) AS bookmarked,
      ${rankExpr} AS rank
    FROM links l
    JOIN users u      ON u.id = l.author_id
    JOIN categories c ON c.id = l.category_id
    LEFT JOIN link_scores ls ON ls.link_id = l.id
    WHERE ${where}
    ORDER BY ${rankExpr} DESC, l.id DESC
    LIMIT ${limit + 1}
  `;
}

/** A single link, through exactly the same predicate. */
export async function findVisibleLink(
  viewer: Viewer,
  publicId: string,
  includeRemoved = false,
): Promise<LinkRow | null> {
  const viewerId = viewer.user?.id ?? null;
  const rows = await db.$queryRaw<LinkRow[]>`
    SELECT
      l.id, l.public_id, l.kind::text AS kind, l.url, l.media_type::text AS media_type,
      l.title, l.body, l.host, l.thumb_key, l.favicon_key, l.is_nsfw,
      l.created_at, l.edited_at, l.removed_at, l.removed_reason,
      ${EFFECTIVE_TIER}::int AS effective_tier,
      l.author_id, u.public_id AS author_public_id, u.username::text AS author_username,
      c.slug AS category_slug, c.name AS category_name,
      COALESCE(ls.score, 0)::int AS score,
      COALESCE((SELECT v.value FROM votes v WHERE v.link_id = l.id AND v.user_id = ${viewerId}), 0)::int AS viewer_vote,
      EXISTS (SELECT 1 FROM bookmarks b WHERE b.link_id = l.id AND b.user_id = ${viewerId}) AS bookmarked,
      ${RANK_NEW} AS rank
    FROM links l
    JOIN users u      ON u.id = l.author_id
    JOIN categories c ON c.id = l.category_id
    LEFT JOIN link_scores ls ON ls.link_id = l.id
    WHERE l.public_id = ${publicId} AND ${linkPredicate(viewer, includeRemoved)}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export interface TagRow {
  link_id: bigint;
  slug: string;
  name: string;
  status: 'approved' | 'pending';
}

/**
 * Tags for a page of links, filtered the same way the links were. A pending tag
 * reaches its proposer and staff and nobody else: an unapproved word must not
 * land in front of every reader on one person's say-so.
 */
export async function tagsForLinks(viewer: Viewer, linkIds: readonly bigint[]): Promise<TagRow[]> {
  if (linkIds.length === 0) return [];
  const viewerId = viewer.user?.id ?? null;
  const staff = viewer.tier >= TIER.staff;

  return db.$queryRaw<TagRow[]>`
    SELECT lt.link_id, t.slug, t.name, t.status::text AS status
    FROM link_tags lt
    JOIN tags t  ON t.id = lt.tag_id
    JOIN links l ON l.id = lt.link_id
    WHERE lt.link_id IN (${Prisma.join(linkIds)})
      AND (t.status = 'approved' OR ${staff} OR l.author_id = ${viewerId})
    ORDER BY t.name ASC
  `;
}

/**
 * Dedup for `POST /links/preview`, scoped to what the submitter can already
 * see. A global check would confirm the existence of content they are not
 * allowed to know about, which turns submission into an oracle. The cost is
 * that the same URL legitimately exists at several tiers — which is why
 * `links.url_canonical` carries no unique constraint.
 */
export async function findVisibleDuplicate(
  viewer: Viewer,
  canonical: string,
): Promise<{ public_id: string; title: string } | null> {
  const rows = await db.$queryRaw<{ public_id: string; title: string }[]>`
    SELECT l.public_id, l.title
    FROM links l
    JOIN users u ON u.id = l.author_id
    WHERE l.url_canonical = ${canonical} AND ${linkPredicate(viewer)}
    ORDER BY l.created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}
