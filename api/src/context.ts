import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { db } from './db.js';
import { env } from './env.js';
import { forbidden, notFound, unauthenticated } from './errors.js';
import { hashToken } from './lib/ids.js';
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
   * A locked-out user authenticates normally into a session authorised for
   * exactly two things: reading the sanction and filing one appeal. Refusing
   * the login outright would leave them with no channel at all, since nothing
   * here sends mail.
   */
  readonly lockedOut: boolean;
  readonly via: 'cookie' | 'token' | 'anonymous';
  readonly ip: string;
}

export const ANONYMOUS_VIEWER = (ip: string): Viewer => ({
  user: null,
  tier: TIER.anonymous,
  showNsfw: false,
  sanction: null,
  lockedOut: false,
  via: 'anonymous',
  ip,
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

    return buildViewer(user, await loadSanction(user.id), 'token', ip);
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
    return buildViewer(user, await loadSanction(user.id), 'cookie', ip);
  }

  return ANONYMOUS_VIEWER(ip);
}

function buildViewer(
  user: ViewerUser,
  sanction: ActiveSanction | null,
  via: 'cookie' | 'token',
  ip: string,
): Viewer {
  return {
    user,
    tier: user.tier,
    showNsfw: user.showNsfw && user.tier >= TIER.full,
    sanction,
    lockedOut: sanction !== null && sanction.types.includes('lockout'),
    via,
    ip,
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

export const hasSanctionType = (viewer: Viewer, type: string): boolean =>
  viewer.sanction !== null && viewer.sanction.types.includes(type);
