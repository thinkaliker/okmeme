import type { Viewer, ActiveSanction, ViewerUser } from './context.js';
import { isIdentified, tierLabel } from './tier.js';
import type { LinkRow, TagRow } from './visibility.js';

/**
 * The wire shape. One rule dominates everything below:
 *
 * **Identity is resolved on the server.** An author one rung up is sent as
 * `{ kind: "tier", label: "full" }` with **no id field present at all** — not
 * present-and-null, not present-and-hidden-by-the-client. Shipping identity to
 * the browser and relying on the UI to suppress it is the single most common
 * way a system like this leaks, and it survives every redesign until someone
 * opens devtools.
 *
 * Field names are camelCase; see API.md.
 */

export type AuthorPayload =
  | { kind: 'user'; id: string; name: string }
  | { kind: 'tier'; label: string };

export function authorPayload(viewer: Viewer, row: LinkRow): AuthorPayload {
  if (isIdentified(viewer.tier, row.effective_tier) && row.author_username !== null) {
    return { kind: 'user', id: row.author_public_id, name: row.author_username };
  }
  return { kind: 'tier', label: tierLabel(row.effective_tier) };
}

/** Resolves any user reference — proposers, appellants — through the same rule. */
export function authorFor(
  viewer: Viewer,
  user: { publicId: string; username: string | null; tier: number },
): AuthorPayload {
  if (isIdentified(viewer.tier, user.tier) && user.username !== null) {
    return { kind: 'user', id: user.publicId, name: user.username };
  }
  return { kind: 'tier', label: tierLabel(user.tier) };
}

export interface CategoryPayload {
  slug: string;
  /** Server-chosen i18n key. Labels are never assembled client-side. */
  nameKey: string;
  name: string;
}

export const categoryPayload = (slug: string, name: string): CategoryPayload => ({
  slug,
  nameKey: `category.${slug}`,
  name,
});

export interface TagPayload {
  slug: string;
  name: string;
  pending: boolean;
}

export function linkPayload(
  viewer: Viewer,
  row: LinkRow,
  tags: readonly TagRow[],
): Record<string, unknown> {
  const removed =
    row.removed_at === null
      ? null
      : {
          at: row.removed_at.toISOString(),
          // Never an actor and never a tier: every moderation action renders as
          // a generic "moderator", at every tier. That is what stops the removal
          // notice from punching through the +1 rule.
          reasonKey: row.removed_reason,
        };

  const common = {
    publicId: row.public_id,
    title: row.title,
    author: authorPayload(viewer, row),
    category: categoryPayload(row.category_slug, row.category_name),
    tags: tags.map<TagPayload>((tag) => ({
      slug: tag.slug,
      name: tag.name,
      pending: tag.status === 'pending',
    })),
    score: row.score,
    viewerVote: row.viewer_vote === 1 ? 1 : 0,
    bookmarked: row.bookmarked,
    isNsfw: row.is_nsfw,
    createdAt: row.created_at.toISOString(),
    editedAt: row.edited_at === null ? null : row.edited_at.toISOString(),
    removed,
  };

  // A removed post keeps its notice and loses its body.
  const body = removed === null ? row.body : '';

  switch (row.kind) {
    case 'text':
      return { ...common, kind: 'text', body: body ?? '' };
    case 'media':
      return {
        ...common,
        kind: 'media',
        url: row.url ?? '',
        host: row.host ?? '',
        mediaType: row.media_type ?? 'image',
        thumbKey: removed === null ? row.thumb_key : null,
        faviconKey: removed === null ? row.favicon_key : null,
        body,
      };
    default:
      return {
        ...common,
        kind: 'link',
        url: row.url ?? '',
        host: row.host ?? '',
        thumbKey: removed === null ? row.thumb_key : null,
        faviconKey: removed === null ? row.favicon_key : null,
        body,
      };
  }
}

/** Groups a flat tag join into per-link lists. */
export function groupTags(rows: readonly TagRow[]): Map<string, TagRow[]> {
  const byLink = new Map<string, TagRow[]>();
  for (const row of rows) {
    const key = String(row.link_id);
    const list = byLink.get(key);
    if (list === undefined) byLink.set(key, [row]);
    else list.push(row);
  }
  return byLink;
}

/* ---------------------------------------------------------------- me */

export interface DisplayPreferences {
  density: 'comfortable' | 'compact';
  width: 'normal' | 'wide';
  feedView: 'list' | 'gallery';
}

const DEFAULT_DISPLAY: DisplayPreferences = {
  density: 'comfortable',
  width: 'normal',
  feedView: 'list',
};

export function displayPreferences(raw: unknown): DisplayPreferences {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_DISPLAY;
  const value = raw as Partial<DisplayPreferences>;
  return {
    density: value.density === 'compact' ? 'compact' : 'comfortable',
    width: value.width === 'wide' ? 'wide' : 'normal',
    feedView: value.feedView === 'gallery' ? 'gallery' : 'list',
  };
}

export function sanctionPayload(sanction: ActiveSanction): Record<string, unknown> {
  return {
    id: sanction.publicId,
    types: sanction.types,
    expiresAt: sanction.expiresAt === null ? null : sanction.expiresAt.toISOString(),
    reasonCategory: sanction.reasonCategory,
    // Written by an admin who can see everything, shown to a user who cannot.
    // It may never name a reporter or reference content above their tier; that
    // is enforced at write time, in the admin route.
    note: sanction.note,
    appealFiled: sanction.appealFiled,
  };
}

export function mePayload(
  user: ViewerUser,
  unread: number,
  sanction: ActiveSanction | null,
): Record<string, unknown> {
  return {
    publicId: user.publicId,
    username: user.username,
    tier: user.tier,
    showNsfw: user.showNsfw,
    theme: user.theme,
    display: displayPreferences(user.display),
    unreadNotifications: unread,
    sanction: sanction === null ? null : sanctionPayload(sanction),
    createdAt: user.createdAt.toISOString(),
  };
}

/* ---------------------------------------------------------------- notifications */

interface NotificationRowLike {
  publicId: string;
  kind: string;
  payload: unknown;
  createdAt: Date;
  readAt: Date | null;
}

/**
 * Notification payloads obey every rule in this file. There is no actor field
 * because there is no actor to send: a removal notification says "moderator"
 * exactly as the post does.
 */
export function notificationPayload(row: NotificationRowLike): Record<string, unknown> {
  const payload = (typeof row.payload === 'object' && row.payload !== null
    ? row.payload
    : {}) as Record<string, unknown>;

  const subjectPublicId = payload['subjectPublicId'];
  const subjectTitle = payload['subjectTitle'];

  return {
    id: row.publicId,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt === null ? null : row.readAt.toISOString(),
    subject:
      typeof subjectPublicId === 'string'
        ? {
            type: 'link',
            publicId: subjectPublicId,
            title: typeof subjectTitle === 'string' ? subjectTitle : '',
          }
        : null,
    detailKey: typeof payload['detailKey'] === 'string' ? payload['detailKey'] : null,
    note: typeof payload['note'] === 'string' ? payload['note'] : null,
  };
}
