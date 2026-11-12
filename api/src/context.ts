import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { db } from './db.js';
import { env } from './env.js';
import { forbidden, invalid, notFound, unauthenticated } from './errors.js';
import { hashToken } from './lib/ids.js';
import type { Capability } from './permissions.js';
import { loadPermissions } from './services/permissions.js';
import { TIER } from './tier.js';

/**
 * Who is asking.
 *
 * The API **authorizes** every request but does not **authenticate** every
 * request: anonymous is a supported path that resolves to tier 0, not an error.
 * Two credential types land in the same place — an opaque session cookie and a
 * bearer token — because a token carries exactly its issuer's tier and nothing
 * else distinguishes them downstream.
 */

export interface ActiveSanction {
  readonly id: bigint;
  readonly publicId: string;
  readonly types: readonly string[];
  readonly expiresAt: Date | null;
  readonly reasonCategory: string;
  readonly note: string | null;
  readonly appealFiled: boolean;
}

export interface ViewerUser {
  readonly id: bigint;
  readonly publicId: string;
  readonly username: string;
  readonly tier: number;
  readonly showNsfw: boolean;
  readonly theme: string;
  readonly display: unknown;
  readonly createdAt: Date;
}

export interface Viewer {
  readonly user: ViewerUser | null;
  /** 0 when anonymous. Every list query takes this and nothing else about you. */
  readonly tier: number;
  /** Effective NSFW preference. Anonymous and limited users never receive them. */
  readonly showNsfw: boolean;
  readonly sanction: ActiveSanction | null;
  /**
   * What this viewer's tier may do on this instance: the defaults in
   * src/permissions.ts with any admin or owner overrides applied. Read per
   * request, so a change lands on the next one. Empty when anonymous.
   */
  readonly permissions: ReadonlySet<Capability>;
  /**
   * A locked-out user authenticates normally into a session authorised for
   * exactly two things: reading the sanction and filing one appeal. Refusing
   * the login outright would leave them with no channel at all, since nothing
   * here sends mail.
   */
  readonly lockedOut: boolean;
  readonly via: 'cookie' | 'token' | 'anonymous';
  readonly ip: string;
  /**
   * A stand-in built by `viewAs` for one content read: some member of a lower
   * tier, not the person asking. It has no user, so nothing can be written as
   * it — every write path starts with `requireUser`.
   */
  readonly preview: boolean;
}

export const ANONYMOUS_VIEWER = (ip: string): Viewer => ({
  user: null,
  tier: TIER.anonymous,
  showNsfw: false,
  sanction: null,
  permissions: new Set(),
  lockedOut: false,
  via: 'anonymous',
  ip,
  preview: false,
});

export function clientIp(c: Context): string {
  if (env().trustProxy) {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded !== undefined && forwarded !== '') {
      const first = forwarded.split(',')[0];
      if (first !== undefined) return first.trim();
    }
    const real = c.req.header('x-real-ip');
    if (real !== undefined && real !== '') return real;
  }
  return c.req.header('cf-connecting-ip') ?? '0.0.0.0';
}

async function loadUser(userId: bigint): Promise<ViewerUser | null> {
  const row = await db.user.findUnique({ where: { id: userId } });
  if (row === null || row.state !== 'active' || row.username === null) return null;
  return {
    id: row.id,
    publicId: row.publicId,
    username: row.username,
    tier: row.tier,
    showNsfw: row.showNsfw,
    theme: row.theme,
    display: row.display,
    createdAt: row.createdAt,
  };
}

/**
 * The active sanction, if any. Read on every authenticated request because
 * `content_hold` changes what the feed returns and `lockout` changes what the
 * session may do — both have to be current, not cached from login.
 */
export async function loadSanction(userId: bigint): Promise<ActiveSanction | null> {
  const row = await db.suspension.findFirst({
    where: {
      userId,
      liftedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: 'desc' },
    include: { appeal: { select: { id: true } } },
  });
  if (row === null) return null;
  return {
    id: row.id,
    publicId: row.publicId,
    types: row.types,
    expiresAt: row.expiresAt,
    reasonCategory: row.reasonCategory,
    note: row.note,
    appealFiled: row.appeal !== null,
  };
}

export async function resolveViewer(c: Context): Promise<Viewer> {
  const ip = clientIp(c);

  const header = c.req.header('authorization');
  if (header !== undefined && header.toLowerCase().startsWith('bearer ')) {
    const token = header.slice(7).trim();
    const row = await db.apiToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (row === null || row.revokedAt !== null) return ANONYMOUS_VIEWER(ip);

    const user = await loadUser(row.userId);
    if (user === null) return ANONYMOUS_VIEWER(ip);

    // Fire and forget: a last-used timestamp is not worth a round trip on the
    // hot path, and losing one on a crash costs nothing.
    void db.apiToken
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return buildViewer(user, ...(await loadAccess(user)), 'token', ip);
  }

  const cookie = getCookie(c, env().cookieName);
  if (cookie !== undefined && cookie !== '') {
    const row = await db.session.findUnique({
      where: { tokenHash: hashToken(cookie) },
      select: { userId: true, expiresAt: true, revokedAt: true },
    });
    if (row === null || row.revokedAt !== null || row.expiresAt.getTime() < Date.now()) {
      return ANONYMOUS_VIEWER(ip);
    }
    const user = await loadUser(row.userId);
    if (user === null) return ANONYMOUS_VIEWER(ip);
    return buildViewer(user, ...(await loadAccess(user)), 'cookie', ip);
  }

  return ANONYMOUS_VIEWER(ip);
}

const loadAccess = (
  user: ViewerUser,
): Promise<[ActiveSanction | null, ReadonlySet<Capability>]> =>
  Promise.all([loadSanction(user.id), loadPermissions(user.tier)]);

function buildViewer(
  user: ViewerUser,
  sanction: ActiveSanction | null,
  permissions: ReadonlySet<Capability>,
  via: 'cookie' | 'token',
  ip: string,
): Viewer {
  return {
    user,
    tier: user.tier,
    showNsfw: user.showNsfw && user.tier >= TIER.full,
    sanction,
    permissions,
    lockedOut: sanction !== null && sanction.types.includes('lockout'),
    via,
    ip,
    preview: false,
  };
}

/* ---------------------------------------------------------------- view as */

/**
 * "View as", the way Discord lets you view a server as a role: answer one read
 * for a member of a lower tier rather than for the person asking.
 *
 * The ring makes this safe by construction. Everything a tier `P` viewer
 * receives, a `T >= P` viewer can already see: rows at `E <= P + 1` are inside
 * `E <= T + 1`, and a label is never more than `P + 1 <= T + 1`. So a preview can
 * only take things away from the asker; it never shows them a row, a name or a
 * rung they could not already reach, and it holds no permission they do not
 * hold themselves. That is why it only goes down — asking to
 * view a tier above your own is refused, with one answer for every tier above
 * yours, so the refusal does not say which tiers exist.
 *
 * So it is not a permission: every signed-in viewer may preview any tier below
 * their own. Comparing views does show which tier a named author posted at,
 * but that is only ever about people at or below you, and it is exactly what
 * a real member of that tier sees on their own screen. See VISIBILITY.md.
 *
 * The stand-in is *some* member of that tier, not you demoted. It has no user,
 * so the payload carries no votes, bookmarks, pending tags of your own, pinned
 * tier or `viewerCan` — exactly what a stranger at that tier would receive, and
 * a viewer nothing can be written as. Only content reads take it (feed,
 * search, a link, the tag list). Every other route, and every write, still
 * answers for the person asking.
 */
export async function viewAs(viewer: Viewer, raw: string | undefined): Promise<Viewer> {
  if (raw === undefined || raw === '') return viewer;
  if (!/^\d$/.test(raw)) throw invalid('view_as must be a tier ordinal', 'invalid_view_as');

  const tier = Number(raw);
  // Your own tier is just you. The control sends nothing for it, but a client
  // that does gets the ordinary answer rather than an error.
  if (tier === viewer.tier) return viewer;

  // Anonymous is tier 0, so this refuses them anything but their own view.
  if (tier > viewer.tier) throw forbidden('you can only preview your own tier or a lower one');

  // The tier's permissions, so a staff preview reads a removed post the way
  // staff would — but only those you hold too. Cells are adjustable, so a lower
  // tier can hold something yours was refused, and a preview must never be a
  // way to borrow it. `viewerCan` stays empty regardless: there is no user.
  const permissions = new Set<Capability>();
  if (tier !== TIER.anonymous) {
    for (const capability of await loadPermissions(tier)) {
      if (viewer.permissions.has(capability)) permissions.add(capability);
    }
  }

  return {
    user: null,
    tier,
    // Your own preference, at a tier allowed to have one. Previewing must not
    // switch on something you switched off.
    showNsfw: viewer.showNsfw && tier >= TIER.full,
    sanction: null,
    permissions,
    lockedOut: false,
    via: viewer.via,
    ip: viewer.ip,
    preview: true,
  };
}

/* ---------------------------------------------------------------- guards */

export function requireUser(viewer: Viewer): ViewerUser {
  if (viewer.user === null) throw unauthenticated();
  return viewer.user;
}

export function requireTier(viewer: Viewer, minimum: number): ViewerUser {
  const user = requireUser(viewer);
  if (user.tier < minimum) throw forbidden();
  return user;
}

/**
 * Staff-and-above routes 404 rather than 403 below that tier. A 403 on
 * `/tags/pending` tells a limited user there is a review queue; a 404 tells
 * them nothing, which is the same thing every other hidden surface says.
 */
export function requireTierOrHide(viewer: Viewer, minimum: number): ViewerUser {
  const user = viewer.user;
  if (user === null || user.tier < minimum) throw notFound('no such route');
  return user;
}

/** A permission check, 403 when the viewer's tier does not hold it. */
export function requirePermission(
  viewer: Viewer,
  capability: Capability,
  message?: string,
): ViewerUser {
  const user = requireUser(viewer);
  if (!viewer.permissions.has(capability)) throw forbidden(message);
  return user;
}

export const hasSanctionType = (viewer: Viewer, type: string): boolean =>
  viewer.sanction !== null && viewer.sanction.types.includes(type);
