import { ApiError, type Method, type RequestOptions, type Transport } from '@/api/client';
import {
  MOCK_CATEGORIES,
  MOCK_LINKS,
  MOCK_NOTIFICATIONS,
  MOCK_TAGS,
  MOCK_USERS,
  type MockLink,
  type MockUser,
} from '@/api/mock/data';
import type { AdminInvite } from '@/domain/admin';
import type { Author } from '@/domain/author';
import type { Category, Link, LinkPatch, PreviewResult, SubmitDraft, Tag, TagProposal } from '@/domain/link';
import {
  CAPABILITIES,
  NOTHING,
  canEditCell,
  defaultGrant,
  effectivePermissions,
  isCapability,
  isConfigurable,
  mayModerate,
  permissionMatrix,
  type Capability,
  type ViewerCan,
} from '@/domain/permissions';
import type { Notification } from '@/domain/notification';
import type { Page } from '@/domain/page';
import {
  DEFAULT_DISPLAY,
  type DisplayPreferences,
  type Me,
  type MePatch,
  type Sanction,
  type ThemePreference,
} from '@/domain/user';
import { isValidTagSlug, toCategorySlug, toTagSlug } from '@/lib/slug';
import {
  ANONYMOUS,
  TIER,
  can,
  effectiveTier,
  isIdentified,
  isWithinRing,
  type AuthorTierLabel,
  type EffectiveTier,
  type TierOrdinal,
  type ViewerTier,
  viewerTier,
} from '@/domain/tier';

/**
 * An in-browser stand-in for the API, kept honest in one specific way: it starts
 * from rows and applies the ring predicate itself, exactly where SQL will.
 *
 * That is the whole reason it exists. A mock that returns pre-resolved payloads
 * would let the client be built against a shape that has never been filtered,
 * and the first real leak would be found in production. This one lets you log in
 * as each tier and watch the same rows change, disappear, and lose their authors.
 *
 * It is not a spec. SCHEMA.md is.
 */

const SESSION_KEY = 'okmeme.mock.session';
const LATENCY_MS = 120;

const START = Date.now();

const isoFromMinutes = (minutes: number): string =>
  new Date(START - minutes * 60_000).toISOString();

interface Row extends MockLink {
  createdAt: string;
  editedAt: string | null;
  removedAt: string | null;
}

function toRow(link: MockLink): Row {
  return {
    ...link,
    createdAt: isoFromMinutes(link.minutesAgo),
    editedAt: link.editedMinutesAgo === undefined ? null : isoFromMinutes(link.editedMinutesAgo),
    removedAt: link.removedReasonKey === undefined ? null : isoFromMinutes(link.minutesAgo - 10),
  };
}

interface Prefs {
  showNsfw: boolean;
  theme: ThemePreference;
  display: DisplayPreferences;
}

/** A tag someone below staff proposed, keyed by slug. */
interface Proposal {
  slug: string;
  name: string;
  proposedByUserId: number;
  proposedAt: string;
}

/**
 * Two invites that have been used, so the panel's "used by" line has something
 * to show. Nothing in the fake can sign anyone up; redemptions are fixtures.
 */
function seedInvites(): AdminInvite[] {
  const inDays = (days: number) => new Date(START + days * 86_400_000).toISOString();
  const joined = (username: string, minutesAgo: number) => ({
    publicId: `u_${username}`,
    username,
    joinedAt: isoFromMinutes(minutesAgo),
  });
  return [
    {
      id: '1',
      issuedAt: isoFromMinutes(60 * 24 * 20),
      expiresAt: inDays(-6),
      maxUses: 1,
      exhausted: true,
      redeemedBy: [joined('dana', 60 * 24 * 19)],
      note: 'for dana',
      issuedBy: 'root',
      revokedAt: null,
    },
    {
      id: '2',
      issuedAt: isoFromMinutes(60 * 24 * 3),
      expiresAt: null,
      maxUses: 5,
      exhausted: false,
      redeemedBy: [joined('kes', 60 * 24 * 2), joined('sandra', 60 * 5)],
      note: 'book club',
      issuedBy: 'root',
      revokedAt: null,
    },
  ];
}

interface State {
  sessionUserId: number | null;
  rows: Row[];
  votes: Set<string>;
  bookmarks: Set<string>;
  readNotifications: Set<string>;
  appealsFiled: Set<string>;
  prefs: Map<number, Prefs>;
  approvedTags: Tag[];
  proposals: Map<string, Proposal>;
  categories: Category[];
  invites: AdminInvite[];
  /** Overridden cells of the permission table, per tier. Absent means default. */
  permissionOverrides: Map<number, Map<Capability, boolean>>;
  nextId: number;
}

const state: State = {
  sessionUserId: readStoredSession(),
  rows: MOCK_LINKS.map(toRow),
  votes: new Set(),
  bookmarks: new Set(),
  readNotifications: new Set(
    MOCK_NOTIFICATIONS.filter((n) => n.read).map((n) => n.id),
  ),
  appealsFiled: new Set(),
  prefs: new Map(),
  approvedTags: MOCK_TAGS.map((tag) => ({ ...tag, pending: false })),
  proposals: new Map(),
  categories: [...MOCK_CATEGORIES],
  invites: seedInvites(),
  permissionOverrides: new Map(),
  nextId: 1000,
};

function readStoredSession(): number | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

function writeStoredSession(userId: number | null): void {
  try {
    if (userId === null) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, String(userId));
  } catch {
    /* private browsing; the session simply does not survive a reload */
  }
}

/* ---------------------------------------------------------------- *
 * Viewer resolution
 * ---------------------------------------------------------------- */

function currentUser(): MockUser | null {
  if (state.sessionUserId === null) return null;
  return MOCK_USERS.find((u) => u.id === state.sessionUserId) ?? null;
}

function currentTier(): ViewerTier {
  const user = currentUser();
  return user === null ? ANONYMOUS : viewerTier(user.tier);
}

function permissionsFor(tier: number): Set<Capability> {
  return effectivePermissions(tier, state.permissionOverrides.get(tier) ?? new Map());
}

/** `viewer.permissions` on the server: read fresh on every request. */
function viewerPermissions(): ReadonlySet<Capability> {
  const user = currentUser();
  return user === null ? new Set() : permissionsFor(user.tier);
}

function allows(capability: Capability): boolean {
  return viewerPermissions().has(capability);
}

function prefsFor(user: MockUser): Prefs {
  const existing = state.prefs.get(user.id);
  if (existing) return existing;
  const created: Prefs = {
    showNsfw: user.tier >= TIER.full,
    theme: 'system',
    display: { ...DEFAULT_DISPLAY },
  };
  state.prefs.set(user.id, created);
  return created;
}

function authorOf(row: Row): MockUser {
  const user = MOCK_USERS.find((u) => u.id === row.authorId);
  if (!user) throw new Error(`fixture references a missing user: ${row.authorId}`);
  return user;
}

function effectiveTierOf(row: Row): EffectiveTier {
  return effectiveTier(row.pinnedTier ?? authorOf(row).tier);
}

const TIER_LABEL_BY_ORDINAL: Readonly<Record<number, AuthorTierLabel>> = {
  [TIER.limited]: 'limited',
  [TIER.full]: 'full',
  [TIER.staff]: 'staff',
  [TIER.admin]: 'admin',
  [TIER.owner]: 'owner',
};

/**
 * The one place authorship is decided. Below or at the viewer's tier: a real
 * name and an id. Exactly one rung up: a bare label, and the id is not in the
 * object at all. Above that, the row never reaches this function.
 */
function resolveAuthor(viewer: ViewerTier, row: Row): Author {
  const effective = effectiveTierOf(row);
  if (isIdentified(viewer, effective)) {
    const user = authorOf(row);
    return { kind: 'user', id: user.publicId, name: user.username };
  }
  const label = TIER_LABEL_BY_ORDINAL[effective];
  if (label === undefined) throw new Error(`no label for tier ${effective}`);
  return { kind: 'tier', label };
}

/** The predicate from SCHEMA.md, in the only other place it is allowed to live. */
function visibleTo(viewer: ViewerTier, showNsfw: boolean, row: Row): boolean {
  if (!isWithinRing(viewer, effectiveTierOf(row))) return false;
  if (row.isNsfw && !(viewer >= TIER.full && showNsfw)) return false;
  if (authorOf(row).contentHold === true) return false;
  return true;
}

function viewerShowsNsfw(): boolean {
  const user = currentUser();
  return user === null ? false : prefsFor(user).showNsfw;
}

function categoryOf(slug: string): Category {
  return (
    state.categories.find((c) => c.slug === slug) ?? {
      slug,
      nameKey: `category.${slug}`,
      name: slug,
    }
  );
}

/**
 * Tags on a link, resolved for this viewer.
 *
 * Approved tags go to everyone. A pending one goes only to the person who
 * proposed it and to staff and above — a tag nobody approved must not be a word
 * one user gets to show every reader.
 */
function tagsOf(slugs: readonly string[], row: Row, viewer: ViewerTier): Tag[] {
  const user = currentUser();
  const canSeePending = viewer >= TIER.staff || (user !== null && user.id === row.authorId);

  return slugs.flatMap((slug) => {
    const approved = state.approvedTags.find((t) => t.slug === slug);
    if (approved) return [approved];

    const proposal = state.proposals.get(slug);
    if (proposal === undefined) return [];
    if (!canSeePending) return [];
    return [{ slug, name: proposal.name, pending: true }];
  });
}

/**
 * Stands in for "the fetcher found an icon at submission time". Deterministic so
 * a given host behaves the same on every reload, and deliberately not universal
 * so the letter fallback is visible in the feed rather than only in a test.
 */
function faviconKeyFor(host: string): string | null {
  return host.length % 4 === 0 ? null : `fav_${host}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** `viewerCan` in api/src/serialize.ts. */
function viewerCanFor(row: Row): ViewerCan {
  const user = currentUser();
  if (user === null) return NOTHING;
  const permissions = permissionsFor(user.tier);
  const muted = sanctionFor(user)?.types.includes('mute') ?? false;
  const live = row.removedAt === null;
  const mine = row.authorId === user.id;
  const moderate = !mine && mayModerate({ tier: user.tier, permissions }, effectiveTierOf(row));
  return {
    edit: live && !muted && ((mine && permissions.has('editOwn')) || moderate),
    remove: live && !muted && (mine || moderate),
    retier: permissions.has('retier'),
    moderate: live && !muted && moderate,
  };
}

/** Serialised the way the server would: already resolved for exactly this viewer. */
function toPayload(viewer: ViewerTier, row: Row): Link {
  const removed = row.removedAt === null ? null : {
    at: row.removedAt,
    reasonKey: row.removedReasonKey ?? null,
  };

  const common = {
    publicId: row.publicId,
    title: row.title,
    author: resolveAuthor(viewer, row),
    category: categoryOf(row.categorySlug),
    tags: tagsOf(row.tagSlugs, row, viewer),
    score: row.score + (state.votes.has(row.publicId) ? 1 : 0),
    viewerVote: (state.votes.has(row.publicId) ? 1 : 0) as 1 | 0,
    bookmarked: state.bookmarks.has(row.publicId),
    isNsfw: row.isNsfw,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    removed,
    viewerCan: viewerCanFor(row),
  };

  // A removed post keeps its notice and loses its body. The notice never names
  // an actor, at any tier.
  const body = removed === null ? (row.body ?? null) : '';

  switch (row.kind) {
    case 'text':
      return { ...common, kind: 'text', body: body ?? '' };
    case 'media': {
      const host = hostOf(row.url ?? '');
      return {
        ...common,
        kind: 'media',
        url: row.url ?? '',
        host,
        mediaType: row.mediaType ?? 'image',
        thumbKey: removed === null ? `th_${row.publicId}` : null,
        faviconKey: removed === null ? faviconKeyFor(host) : null,
        body,
      };
    }
    case 'link': {
      const host = hostOf(row.url ?? '');
      return {
        ...common,
        kind: 'link',
        url: row.url ?? '',
        host,
        thumbKey: removed === null ? `th_${row.publicId}` : null,
        faviconKey: removed === null ? faviconKeyFor(host) : null,
        body,
      };
    }
  }
}

/* ---------------------------------------------------------------- *
 * Cursor pagination
 * ---------------------------------------------------------------- */

interface Cursor {
  readonly rank: number;
  readonly id: number;
}

function encodeCursor(cursor: Cursor): string {
  return btoa(`${cursor.rank}:${cursor.id}`);
}

function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const [rank, id] = atob(raw).split(':');
    if (rank === undefined || id === undefined) return null;
    return { rank: Number(rank), id: Number(id) };
  } catch {
    return null;
  }
}

/**
 * Keyset, never offset. Filtering happens before the slice, so a short page
 * means the end of the list rather than a count of what was hidden.
 */
function paginate(rows: readonly Row[], rank: (row: Row) => number, raw: RequestOptions['query']): Page<Link> {
  const viewer = currentTier();
  const showNsfw = viewerShowsNsfw();
  const limit = Math.min(Number(raw?.['limit'] ?? 20) || 20, 50);
  const cursor = decodeCursor(raw?.['cursor'] as string | undefined);

  const ordered = rows
    .filter((row) => row.removedAt === null)
    .filter((row) => visibleTo(viewer, showNsfw, row))
    .sort((a, b) => rank(b) - rank(a) || b.id - a.id);

  const after = cursor === null
    ? ordered
    : ordered.filter((row) => {
        const r = rank(row);
        return r < cursor.rank || (r === cursor.rank && row.id < cursor.id);
      });

  const page = after.slice(0, limit);
  const last = page[page.length - 1];
  const more = last !== undefined && after.length > page.length;

  return {
    items: page.map((row) => toPayload(viewer, row)),
    nextCursor: more && last ? encodeCursor({ rank: rank(last), id: last.id }) : null,
  };
}

const byNew = (row: Row): number => new Date(row.createdAt).getTime();
const byScore = (row: Row): number => row.score;

/* ---------------------------------------------------------------- *
 * /me
 * ---------------------------------------------------------------- */

const SANCTIONED_USER_ID = 5;

function sanctionFor(user: MockUser): Sanction | null {
  if (user.id !== SANCTIONED_USER_ID) return null;
  return {
    id: 's_1',
    types: ['mute', 'content_hold'],
    expiresAt: null,
    reasonCategory: 'abuse',
    note: 'Repeated personal attacks in comments on other people’s posts.',
    appealFiled: state.appealsFiled.has('s_1'),
  };
}

function unreadCount(userId: number): number {
  return MOCK_NOTIFICATIONS.filter(
    (n) => n.userId === userId && !state.readNotifications.has(n.id),
  ).length;
}

function mePayload(user: MockUser): Me {
  const prefs = prefsFor(user);
  return {
    publicId: user.publicId,
    username: user.username,
    tier: user.tier,
    showNsfw: prefs.showNsfw,
    theme: prefs.theme,
    display: prefs.display,
    unreadNotifications: unreadCount(user.id),
    sanction: sanctionFor(user),
    permissions: CAPABILITIES.filter((capability) => permissionsFor(user.tier).has(capability)),
    createdAt: isoFromMinutes(60 * 24 * 400),
  };
}

function notificationsPage(user: MockUser, raw: RequestOptions['query']): Page<Notification> {
  const unreadOnly = raw?.['unread'] === true || raw?.['unread'] === 'true';
  const items = MOCK_NOTIFICATIONS.filter((n) => n.userId === user.id)
    .filter((n) => !unreadOnly || !state.readNotifications.has(n.id))
    .sort((a, b) => a.minutesAgo - b.minutesAgo)
    .map<Notification>((n) => ({
      id: n.id,
      kind: n.kind,
      createdAt: isoFromMinutes(n.minutesAgo),
      readAt: state.readNotifications.has(n.id) ? isoFromMinutes(n.minutesAgo - 5) : null,
      subject:
        n.subjectPublicId === undefined
          ? null
          : { type: 'link', publicId: n.subjectPublicId, title: n.subjectTitle ?? '' },
      detailKey: n.detailKey ?? null,
      note: n.note ?? null,
    }));

  // Never pruned, and short enough here that one page is the whole history.
  return { items, nextCursor: null };
}

/* ---------------------------------------------------------------- *
 * Submission
 * ---------------------------------------------------------------- */

function canonicalize(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.hash = '';
    const params = [...url.searchParams.entries()]
      .filter(([key]) => !/^(utm_|fbclid$|gclid$)/i.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    url.search = '';
    for (const [key, value] of params) url.searchParams.append(key, value);
    return url.toString();
  } catch {
    return rawUrl;
  }
}

/** Dedup runs only over rows this viewer can already see. Never globally. */
function previewFor(rawUrl: string): PreviewResult {
  const viewer = currentTier();
  const showNsfw = viewerShowsNsfw();
  const canonical = canonicalize(rawUrl);
  const hit = state.rows.find(
    (row) =>
      row.url !== undefined &&
      canonicalize(row.url) === canonical &&
      row.removedAt === null &&
      visibleTo(viewer, showNsfw, row),
  );

  return {
    canonicalUrl: canonical,
    title: null,
    host: hostOf(canonical),
    thumbKey: null,
    duplicate: hit ? { publicId: hit.publicId, title: hit.title } : null,
  };
}

/**
 * Turns typed tag names into slugs the link can carry.
 *
 * An existing approved tag is simply applied. Anything else becomes a proposal —
 * except from staff and above, who create tags outright, which is why a pending
 * tag can only ever come from someone a reviewer is already allowed to see.
 */
function resolveNewTags(names: readonly string[], user: MockUser): string[] {
  const slugs: string[] = [];

  for (const name of names) {
    const slug = toTagSlug(name);
    if (!isValidTagSlug(slug)) continue;
    if (slugs.includes(slug)) continue;

    if (state.approvedTags.some((tag) => tag.slug === slug)) {
      slugs.push(slug);
      continue;
    }

    if (permissionsFor(user.tier).has('createTags')) {
      state.approvedTags.push({ slug, name: slug, pending: false });
      slugs.push(slug);
      continue;
    }

    // Already queued by someone else: join it rather than answering
    // differently, which would say whether a stranger had proposed the word.
    if (!state.proposals.has(slug)) {
      state.proposals.set(slug, {
        slug,
        name: slug,
        proposedByUserId: user.id,
        proposedAt: new Date().toISOString(),
      });
    }
    slugs.push(slug);
  }

  return slugs;
}

function submit(draft: SubmitDraft): Link {
  const user = currentUser();
  if (user === null) throw new ApiError(401, 'unauthenticated', 'log in first');
  if (!allows('submit')) throw new ApiError(403, 'forbidden', 'this tier cannot post');
  if (draft.isNsfw && !allows('postNsfw')) {
    throw new ApiError(403, 'forbidden', 'this tier cannot mark posts nsfw');
  }

  const proposed = resolveNewTags(draft.newTagNames, user);
  const id = ++state.nextId;
  const row: Row = {
    id,
    publicId: `l_${id.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind: draft.kind,
    title: draft.title,
    ...(draft.kind === 'text' ? {} : { url: draft.url }),
    ...(draft.kind === 'media' ? { mediaType: 'image' as const } : {}),
    ...(draft.body ? { body: draft.body } : {}),
    authorId: user.id,
    categorySlug: draft.categorySlug,
    tagSlugs: [...new Set([...draft.tagSlugs, ...proposed])],
    isNsfw: draft.isNsfw,
    score: 1,
    minutesAgo: 0,
    createdAt: new Date().toISOString(),
    editedAt: null,
    removedAt: null,
  };

  state.rows = [row, ...state.rows];
  return toPayload(viewerTier(user.tier), row);
}

/* ---------------------------------------------------------------- *
 * Routing
 * ---------------------------------------------------------------- */

function requireUser(): MockUser {
  const user = currentUser();
  if (user === null) throw new ApiError(401, 'unauthenticated', 'log in first');
  return user;
}

/** `requireTier(viewer, TIER.admin)`: admins and owners, like the server. */
function requireAdmin(): MockUser {
  const user = requireUser();
  if (user.tier < TIER.admin) throw new ApiError(403, 'forbidden', 'admin only');
  return user;
}

function findRow(publicId: string): Row {
  const row = state.rows.find((r) => r.publicId === publicId);
  if (row === undefined) throw new ApiError(404, 'not_found', 'no such link');
  // Outside the ring, "hidden" and "does not exist" have to be the same answer.
  if (!visibleTo(currentTier(), viewerShowsNsfw(), row)) {
    throw new ApiError(404, 'not_found', 'no such link');
  }
  return row;
}

function toggle(set: Set<string>, key: string, on: boolean): void {
  if (on) set.add(key);
  else set.delete(key);
}

interface LoginBody {
  username?: string;
}

function handle(method: Method, path: string, options: RequestOptions): unknown {
  const query = options.query;

  if (method === 'GET' && path === '/feed') {
    const category = query?.['category'] as string | undefined;
    const tag = query?.['tag'] as string | undefined;
    const sort = (query?.['sort'] as string | undefined) ?? 'new';
    const rows = state.rows
      .filter((row) => !category || row.categorySlug === category)
      .filter((row) => !tag || row.tagSlugs.includes(tag));
    return paginate(rows, sort === 'top' ? byScore : byNew, query);
  }

  if (method === 'GET' && path === '/search') {
    const q = String(query?.['q'] ?? '').toLowerCase().trim();
    const bookmarked = query?.['bookmarked'] === true || query?.['bookmarked'] === 'true';
    const rows = state.rows
      .filter((row) => !bookmarked || state.bookmarks.has(row.publicId))
      .filter((row) => {
        if (!q) return true;
        const haystack = `${row.title} ${row.body ?? ''} ${row.tagSlugs.join(' ')}`.toLowerCase();
        return haystack.includes(q);
      });
    // No result count, here as anywhere else: a count of matches is a count of rows.
    return paginate(rows, byNew, query);
  }

  if (method === 'GET' && path === '/categories') return state.categories;

  /*
   * The category editor. Unlike the moderation queues below, this one is
   * modelled: an edit here changes what the nav and the submit form show, and
   * deleting has a rule worth exercising — a category with links needs
   * somewhere to move them.
   */
  if (method === 'GET' && path === '/admin/categories') {
    requireAdmin();
    return {
      items: state.categories.map((category) => ({
        ...category,
        inUse: state.rows.some((row) => row.categorySlug === category.slug),
        createdAt: isoFromMinutes(60 * 24 * 30),
      })),
      nextCursor: null,
    };
  }

  if (method === 'POST' && path === '/categories') {
    requireAdmin();
    const name = String((options.body as { name?: unknown } | undefined)?.name ?? '').trim();
    if (name === '' || name.length > 48) throw new ApiError(400, 'invalid_body', 'a category needs a name');
    const slug = toCategorySlug(name);
    if (slug === '') throw new ApiError(400, 'bad_slug', 'that name has no usable slug');
    if (state.categories.some((c) => c.slug === slug)) {
      throw new ApiError(409, 'category_exists', 'that category already exists');
    }
    const created: Category = { slug, nameKey: `category.${slug}`, name };
    state.categories = [...state.categories, created];
    return created;
  }

  const categoryMatch = /^\/categories\/([^/]+)$/.exec(path);
  if (categoryMatch?.[1] !== undefined && (method === 'PATCH' || method === 'DELETE')) {
    requireAdmin();
    const slug = categoryMatch[1];
    const existing = state.categories.find((c) => c.slug === slug);
    if (existing === undefined) throw new ApiError(404, 'not_found', 'no such category');

    if (method === 'PATCH') {
      const name = String((options.body as { name?: unknown } | undefined)?.name ?? '').trim();
      if (name === '' || name.length > 48) throw new ApiError(400, 'invalid_body', 'a category needs a name');
      // The slug never moves: it is the URL, and the colour is derived from it.
      const renamed: Category = { ...existing, name };
      state.categories = state.categories.map((c) => (c.slug === slug ? renamed : c));
      return renamed;
    }

    const moveTo = (query?.['move_to'] as string | undefined)?.trim() || undefined;
    if (moveTo === slug) throw new ApiError(400, 'bad_target', 'cannot move links into the category being deleted');
    if (state.rows.some((row) => row.categorySlug === slug)) {
      if (moveTo === undefined) {
        throw new ApiError(409, 'category_in_use', 'that category still has links; choose where to move them');
      }
      if (!state.categories.some((c) => c.slug === moveTo)) {
        throw new ApiError(400, 'bad_target', 'no such category to move links into');
      }
      state.rows = state.rows.map((row) =>
        row.categorySlug === slug ? { ...row, categorySlug: moveTo } : row,
      );
    }
    state.categories = state.categories.filter((c) => c.slug !== slug);
    return null;
  }

  if (method === 'GET' && path === '/tags') {
    const user = currentUser();
    const viewer = currentTier();
    // Approved to everyone; pending only to its proposer and to staff upward.
    const pending = [...state.proposals.values()]
      .filter((p) => viewer >= TIER.staff || (user !== null && p.proposedByUserId === user.id))
      .map<Tag>((p) => ({ slug: p.slug, name: p.name, pending: true }));
    return [...state.approvedTags, ...pending];
  }

  if (method === 'GET' && path === '/tags/pending') {
    const viewer = currentTier();
    if (viewer < TIER.staff) throw new ApiError(404, 'not_found', 'no such route');
    return [...state.proposals.values()]
      .sort((a, b) => a.proposedAt.localeCompare(b.proposedAt))
      .map<TagProposal>((p) => {
        const proposer = MOCK_USERS.find((u) => u.id === p.proposedByUserId);
        return {
          slug: p.slug,
          name: p.name,
          proposedAt: p.proposedAt,
          // Proposals only come from below staff, so a reviewer can always see
          // the proposer by name. Resolved through the same union regardless.
          proposedBy:
            proposer && isIdentified(viewer, effectiveTier(proposer.tier))
              ? { kind: 'user', id: proposer.publicId, name: proposer.username }
              : { kind: 'tier', label: 'full' },
        };
      });
  }

  const approveMatch = /^\/tags\/([^/]+)\/approve$/.exec(path);
  if (approveMatch?.[1] !== undefined && method === 'POST') {
    const viewer = currentTier();
    if (!can.createTags(viewer)) throw new ApiError(403, 'forbidden', 'staff and above');
    const proposal = state.proposals.get(approveMatch[1]);
    if (proposal === undefined) throw new ApiError(404, 'not_found', 'no such proposal');
    state.proposals.delete(proposal.slug);
    state.approvedTags.push({ slug: proposal.slug, name: proposal.name, pending: false });
    return null;
  }

  const rejectMatch = /^\/tags\/([^/]+)$/.exec(path);
  if (rejectMatch?.[1] !== undefined && method === 'DELETE') {
    const viewer = currentTier();
    if (!can.createTags(viewer)) throw new ApiError(403, 'forbidden', 'staff and above');
    const slug = rejectMatch[1];
    state.proposals.delete(slug);
    // The word goes; the posts stay. A rejected tag simply stops resolving.
    return null;
  }


  if (method === 'POST' && path === '/links') {
    return submit(options.body as SubmitDraft);
  }

  if (method === 'POST' && path === '/links/preview') {
    requireUser();
    return previewFor(String((options.body as { url?: string }).url ?? ''));
  }

  const linkMatch = /^\/links\/([^/]+)$/.exec(path);
  if (linkMatch?.[1] !== undefined) {
    const publicId = linkMatch[1];
    if (method === 'GET') {
      const row = state.rows.find((r) => r.publicId === publicId);
      if (row === undefined) throw new ApiError(404, 'not_found', 'no such link');
      const viewer = currentTier();
      // A removed row is still readable by its author and by moderators, with
      // the same anonymous notice everyone else would see.
      if (row.removedAt !== null) {
        const user = currentUser();
        const mine = user !== null && user.id === row.authorId;
        const mod = allows('moderate') || allows('readAuditLog');
        if (!mine && !mod) throw new ApiError(404, 'not_found', 'no such link');
        return toPayload(viewer, row);
      }
      return toPayload(viewer, findRow(publicId));
    }

    if (method === 'PATCH' || method === 'DELETE') {
      const user = requireUser();
      if (sanctionFor(user)?.types.includes('mute') === true) {
        throw new ApiError(403, 'forbidden', 'this account is muted');
      }
      const row = findRow(publicId);
      const mine = row.authorId === user.id;
      const asModerator = !mine && mayModerate({ tier: user.tier, permissions: viewerPermissions() }, effectiveTierOf(row));
      if (!mine && !asModerator) throw new ApiError(404, 'not_found', 'no such link');
      const replaceRow = (next: Row) => {
        state.rows = state.rows.map((candidate) => (candidate.publicId === publicId ? next : candidate));
        return next;
      };

      if (method === 'DELETE') {
        const reason = typeof options.query?.['reason'] === 'string' ? options.query['reason'] : undefined;
        const { removedReasonKey: _dropped, ...rest } = row;
        replaceRow({
          ...rest,
          removedAt: new Date().toISOString(),
          ...(asModerator && reason !== undefined ? { removedReasonKey: reason } : {}),
        });
        return null;
      }

      if (mine && !allows('editOwn')) throw new ApiError(403, 'forbidden', 'this tier cannot edit its own posts');
      const patch = (options.body ?? {}) as LinkPatch;
      if (patch.isNsfw === true && !allows('postNsfw')) {
        throw new ApiError(403, 'forbidden', 'this tier cannot mark posts nsfw');
      }
      if (patch.title !== undefined && patch.title.trim() === '') {
        throw new ApiError(400, 'invalid_body', 'a title is required');
      }
      if (row.kind === 'text' && patch.body !== undefined && patch.body.trim() === '') {
        throw new ApiError(400, 'missing_body', 'a text post needs a body');
      }
      if (patch.categorySlug !== undefined && !state.categories.some((c) => c.slug === patch.categorySlug)) {
        throw new ApiError(400, 'bad_category', 'no such category');
      }
      // Same rule as the server: pending tags this editor cannot see are kept.
      const seesPending = mine || user.tier >= TIER.staff;
      const hidden = seesPending
        ? []
        : row.tagSlugs.filter((slug) => !state.approvedTags.some((tag) => tag.slug === slug));
      const tagSlugs =
        patch.tagSlugs === undefined && patch.newTagNames === undefined
          ? row.tagSlugs
          : [
              ...new Set([
                ...hidden,
                ...(patch.tagSlugs ?? []),
                ...resolveNewTags(patch.newTagNames ?? [], user),
              ]),
            ];
      const { body: _body, ...withoutBody } = row;
      const body = patch.body === undefined ? row.body : patch.body === '' ? undefined : patch.body;
      const next = replaceRow({
        ...withoutBody,
        ...(body === undefined ? {} : { body }),
        tagSlugs,
        title: patch.title?.trim() ?? row.title,
        categorySlug: patch.categorySlug ?? row.categorySlug,
        isNsfw: patch.isNsfw ?? row.isNsfw,
        editedAt: new Date().toISOString(),
      });
      // The edit may have moved it out of this viewer's NSFW preference.
      if (!visibleTo(currentTier(), viewerShowsNsfw(), next)) {
        throw new ApiError(404, 'not_found', 'no such link');
      }
      return toPayload(currentTier(), next);
    }
  }

  const voteMatch = /^\/links\/([^/]+)\/vote$/.exec(path);
  if (voteMatch?.[1] !== undefined && (method === 'POST' || method === 'DELETE')) {
    requireUser();
    if (!allows('vote')) throw new ApiError(403, 'forbidden', 'this tier cannot vote');
    const row = findRow(voteMatch[1]);
    toggle(state.votes, row.publicId, method === 'POST');
    return toPayload(currentTier(), row);
  }

  const bookmarkMatch = /^\/links\/([^/]+)\/bookmark$/.exec(path);
  if (bookmarkMatch?.[1] !== undefined && (method === 'POST' || method === 'DELETE')) {
    requireUser();
    if (!allows('bookmark')) throw new ApiError(403, 'forbidden', 'this tier cannot bookmark');
    const row = findRow(bookmarkMatch[1]);
    toggle(state.bookmarks, row.publicId, method === 'POST');
    return toPayload(currentTier(), row);
  }

  if (path === '/me' && method === 'GET') {
    const user = currentUser();
    if (user === null) throw new ApiError(401, 'unauthenticated', 'anonymous');
    return mePayload(user);
  }

  if (path === '/me' && method === 'PATCH') {
    const user = requireUser();
    const patch = options.body as MePatch;
    const prefs = prefsFor(user);
    if (patch.showNsfw !== undefined) prefs.showNsfw = patch.showNsfw && user.tier >= TIER.full;
    if (patch.theme !== undefined) prefs.theme = patch.theme;
    // Display preferences merge: a client sends only what changed.
    if (patch.display !== undefined) prefs.display = { ...prefs.display, ...patch.display };
    return mePayload(user);
  }

  if (path === '/me/bookmarks' && method === 'GET') {
    requireUser();
    // Filtered by the same predicate as the feed, so a demoted author's post
    // simply drops out. No tombstone: a tombstone would date the demotion.
    const rows = state.rows.filter((row) => state.bookmarks.has(row.publicId));
    return paginate(rows, byNew, query);
  }

  if (path === '/me/notifications' && method === 'GET') {
    return notificationsPage(requireUser(), query);
  }

  if (path === '/me/notifications/read' && method === 'POST') {
    const user = requireUser();
    const body = options.body as { ids?: string[] } | undefined;
    const ids = body?.ids ?? MOCK_NOTIFICATIONS.filter((n) => n.userId === user.id).map((n) => n.id);
    for (const id of ids) state.readNotifications.add(id);
    return { unread: unreadCount(user.id) };
  }

  if (path === '/me/suspension/appeal' && method === 'POST') {
    const user = requireUser();
    const sanction = sanctionFor(user);
    if (sanction === null) throw new ApiError(404, 'not_found', 'no sanction');
    if (state.appealsFiled.has(sanction.id)) {
      throw new ApiError(409, 'already_appealed', 'one appeal per sanction');
    }
    state.appealsFiled.add(sanction.id);
    return null;
  }

  if (path === '/reports' && method === 'POST') {
    requireUser();
    // The response confirms acceptance and nothing about the subject.
    return null;
  }

  if (path === '/auth/login' && method === 'POST') {
    const { username } = (options.body ?? {}) as LoginBody;
    const user = MOCK_USERS.find((u) => u.username === username);
    if (user === undefined) throw new ApiError(401, 'invalid_credentials', 'no');
    state.sessionUserId = user.id;
    writeStoredSession(user.id);
    return mePayload(user);
  }

  if (path === '/auth/logout' && method === 'POST') {
    state.sessionUserId = null;
    writeStoredSession(null);
    return null;
  }

  /* ---------------------------------------------------------------- *
   * The admin, owner and bootstrap surfaces.
   *
   * The fake models the ring predicate because that is the part the client can
   * get wrong. It does not model a moderation queue: there is no interesting
   * visibility rule in a list only admins can read, and inventing fixtures for
   * one would be a second implementation with nothing to check it against.
   *
   * So these answer empty and say so, rather than 404ing and looking broken.
   * ---------------------------------------------------------------- */

  const EMPTY_PAGE = { items: [], nextCursor: null };

  // The account list is not a queue — it is the fixture itself, and listing it
  // lets the tier legend and the read-only owner/admin/self rows be seen
  // without a server. Changing a tier still answers 501 below.
  if (method === 'GET' && path === '/admin/users') {
    requireAdmin();
    const q = ((query?.['q'] as string | undefined) ?? '').toLowerCase();
    return {
      items: MOCK_USERS.filter((u) => u.username.includes(q))
        .sort((a, b) => b.id - a.id)
        .map((u) => ({
          publicId: u.publicId,
          username: u.username,
          tier: u.tier,
          state: 'active',
          createdAt: isoFromMinutes(60 * 24 * u.id),
          invitedBy: null,
          sanction: null,
        })),
      nextCursor: null,
    };
  }

  if (method === 'GET' && /^\/admin\/(reports|appeals|recovery-requests|users|audit|suspensions\/indefinite)$/.test(path)) {
    if (currentTier() < TIER.admin) throw new ApiError(403, 'forbidden', 'admin only');
    return EMPTY_PAGE;
  }

  /*
   * Invites, modelled like categories: the panel's rules — a limit can never
   * drop below what has been spent, and revoked is final — are worth
   * exercising without a server. The code is fake and cannot sign anyone up.
   */
  if (method === 'GET' && path === '/admin/invites') {
    requireAdmin();
    return { items: [...state.invites].sort((a, b) => Number(b.id) - Number(a.id)), nextCursor: null };
  }

  if (method === 'POST' && path === '/admin/invites') {
    const user = requireAdmin();
    const body = (options.body ?? {}) as { note?: unknown; maxUses?: unknown; ttlDays?: unknown };
    const maxUses = body.maxUses === undefined ? 1 : body.maxUses;
    const ttlDays = body.ttlDays === undefined ? 14 : body.ttlDays;
    const whole = (value: unknown, max: number): value is number =>
      Number.isInteger(value) && (value as number) >= 1 && (value as number) <= max;
    if ((maxUses !== null && !whole(maxUses, 10_000)) || (ttlDays !== null && !whole(ttlDays, 365))) {
      throw new ApiError(400, 'invalid_body', 'maxUses and ttlDays are whole numbers or null');
    }
    state.nextId += 1;
    const id = String(state.nextId);
    const expiresAt = ttlDays === null ? null : new Date(Date.now() + ttlDays * 86_400_000).toISOString();
    const note = String(body.note ?? '').trim();
    state.invites = [
      ...state.invites,
      {
        id,
        issuedAt: new Date().toISOString(),
        expiresAt,
        maxUses,
        exhausted: false,
        redeemedBy: [],
        note: note === '' ? null : note,
        issuedBy: user.username,
        revokedAt: null,
      },
    ];
    return { id, code: `okmi_mock${id}`, expiresAt, maxUses };
  }

  const inviteMatch = /^\/admin\/invites\/([^/]+)$/.exec(path);
  if (inviteMatch?.[1] !== undefined && (method === 'PATCH' || method === 'DELETE')) {
    requireAdmin();
    const id = inviteMatch[1];
    const existing = state.invites.find((invite) => invite.id === id);
    if (existing === undefined) throw new ApiError(404, 'not_found', 'no such invite');
    const replace = (next: AdminInvite) => {
      state.invites = state.invites.map((invite) => (invite.id === id ? next : invite));
    };

    if (method === 'DELETE') {
      if (existing.revokedAt === null) replace({ ...existing, revokedAt: new Date().toISOString() });
      return null;
    }

    if (existing.revokedAt !== null) throw new ApiError(409, 'revoked', 'a revoked invite cannot be changed');
    const body = (options.body ?? {}) as { note?: string; maxUses?: number | null; expiresAt?: string | null };
    let next: AdminInvite = existing;
    if (body.note !== undefined) next = { ...next, note: body.note.trim() === '' ? null : body.note.trim() };
    if (body.maxUses !== undefined) {
      if (body.maxUses !== null && body.maxUses < existing.redeemedBy.length) {
        throw new ApiError(409, 'below_uses', 'more people have already used this invite than that');
      }
      next = { ...next, maxUses: body.maxUses };
    }
    if (body.expiresAt !== undefined) {
      if (body.expiresAt !== null && new Date(body.expiresAt).getTime() <= Date.now()) {
        throw new ApiError(400, 'expiry_in_past', 'an expiry has to be in the future; revoke the invite to end it now');
      }
      next = { ...next, expiresAt: body.expiresAt };
    }
    replace({ ...next, exhausted: next.maxUses !== null && next.redeemedBy.length >= next.maxUses });
    return null;
  }

  if (method === 'GET' && path === '/admin/settings') {
    if (currentTier() < TIER.admin) throw new ApiError(403, 'forbidden', 'admin only');
    return {
      items: [
        { key: 'instance_name', value: 'okmeme', minWriterTier: 4, updatedAt: isoFromMinutes(0) },
        { key: 'invite_min_tier', value: 4, minWriterTier: 5, updatedAt: isoFromMinutes(0) },
      ],
    };
  }

  if (method === 'GET' && path === '/owner/owners') {
    if (currentTier() < TIER.owner) throw new ApiError(403, 'forbidden', 'owner only');
    return EMPTY_PAGE;
  }

  if (path === '/me/tokens' && method === 'GET') {
    requireUser();
    return EMPTY_PAGE;
  }

  if (path === '/me/permissions' && method === 'GET') {
    const user = requireUser();
    return permissionMatrix({ tier: user.tier, permissions: viewerPermissions() }, permissionsFor);
  }

  if (path === '/admin/permissions' && method === 'PATCH') {
    const user = requireAdmin();
    const body = (options.body ?? {}) as { tier?: unknown; capability?: unknown; granted?: unknown };
    if (typeof body.tier !== 'number' || typeof body.granted !== 'boolean') {
      throw new ApiError(400, 'invalid_body', 'tier, capability and granted are required');
    }
    if (!isCapability(body.capability)) throw new ApiError(400, 'bad_permission', 'no such permission');
    const actor = { tier: user.tier, permissions: viewerPermissions() };
    if (!isConfigurable(body.capability, body.tier) || !canEditCell(actor, body.tier, body.capability)) {
      throw new ApiError(403, 'forbidden', 'you can only change permissions you hold, for tiers below yours');
    }
    const overrides = state.permissionOverrides.get(body.tier) ?? new Map<Capability, boolean>();
    if (body.granted === defaultGrant(body.capability, body.tier)) overrides.delete(body.capability);
    else overrides.set(body.capability, body.granted);
    state.permissionOverrides.set(body.tier, overrides);
    return permissionMatrix(actor, permissionsFor);
  }

  const retierMatch = /^\/admin\/links\/([^/]+)\/tier$/.exec(path);
  if (retierMatch?.[1] !== undefined && method === 'POST') {
    requireAdmin();
    if (!allows('retier')) throw new ApiError(403, 'forbidden', 'not permitted');
    const tier = (options.body as { tier?: unknown } | undefined)?.tier;
    if (tier !== null && !(typeof tier === 'number' && Number.isInteger(tier) && tier >= 1 && tier <= 5)) {
      throw new ApiError(400, 'invalid_body', 'a tier ordinal or null is required');
    }
    const row = state.rows.find((candidate) => candidate.publicId === retierMatch[1]);
    if (row === undefined) throw new ApiError(404, 'not_found', 'no such link');
    const { pinnedTier: _unpinned, ...rest } = row;
    const next: Row = tier === null ? rest : { ...rest, pinnedTier: tier as TierOrdinal };
    state.rows = state.rows.map((candidate) => (candidate.publicId === row.publicId ? next : candidate));
    return null;
  }

  if (path.startsWith('/admin/') || path.startsWith('/owner/') || path === '/setup') {
    throw new ApiError(501, 'not_implemented', 'the in-browser fake does not model this route');
  }

  if (path === '/auth/accounts' && method === 'GET') {
    // Mock-only. There is no endpoint that lists accounts by tier, and there
    // never will be — this exists so the dev switcher has something to offer.
    return MOCK_USERS.map((u) => ({ username: u.username, tier: u.tier as TierOrdinal }));
  }

  throw new ApiError(404, 'not_found', `mock has no route for ${method} ${path}`);
}

export function createMockTransport(): Transport {
  return {
    request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            resolve(handle(method, path, options) as T);
          } catch (error) {
            reject(error instanceof ApiError ? error : new ApiError(500, 'mock_error', String(error)));
          }
        }, LATENCY_MS);
      });
    },
  };
}
