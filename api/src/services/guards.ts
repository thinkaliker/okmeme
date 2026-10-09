import type { Viewer, ViewerUser } from '../context.js';
import { forbidden, unauthenticated } from '../errors.js';
import { TIER, can } from '../tier.js';

/**
 * Sanctions, applied at the point of action.
 *
 * The four types are combinable and only one of them touches visibility:
 *
 * - `mute` — read-only. No posting, commenting, or voting.
 * - `submission_ban` — no submitting; voting, commenting and bookmarking stay.
 * - `lockout` — handled in the middleware; the session can read the sanction and
 *   file one appeal, and nothing else.
 * - `content_hold` — a clause in the feed predicate, not a check here.
 */

const has = (viewer: Viewer, type: string): boolean =>
  viewer.sanction !== null && viewer.sanction.types.includes(type);

export function requireCanSubmit(viewer: Viewer): ViewerUser {
  const user = viewer.user;
  if (user === null) throw unauthenticated();
  if (!can.submit(user.tier)) {
    throw forbidden(
      user.tier >= TIER.owner
        ? 'owner accounts cannot post, comment, or vote'
        : 'this tier cannot post',
    );
  }
  if (has(viewer, 'mute')) throw forbidden('this account is muted');
  if (has(viewer, 'submission_ban')) throw forbidden('this account cannot submit');
  return user;
}

export function requireCanVote(viewer: Viewer): ViewerUser {
  const user = viewer.user;
  if (user === null) throw unauthenticated();
  if (!can.vote(user.tier)) throw forbidden('this tier cannot vote');
  if (has(viewer, 'mute')) throw forbidden('this account is muted');
  return user;
}

export function requireCanBookmark(viewer: Viewer): ViewerUser {
  const user = viewer.user;
  if (user === null) throw unauthenticated();
  if (!can.bookmark(user.tier)) throw forbidden('this tier cannot bookmark');
  return user;
}

export function requireCanEdit(viewer: Viewer): ViewerUser {
  const user = viewer.user;
  if (user === null) throw unauthenticated();
  if (has(viewer, 'mute')) throw forbidden('this account is muted');
  return user;
}
