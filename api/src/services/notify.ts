import { db } from '../db.js';
import { publicId } from '../lib/ids.js';

/**
 * With no email provider, the in-app inbox is **the only channel that reaches a
 * user at all**. That raises it from a nicety to infrastructure: sanctions,
 * moderation on your own content, tier changes, appeal outcomes and approved
 * recovery requests all have to land somewhere the user will see them.
 *
 * Nothing is ever pruned. The table doubles as a permanent per-user account
 * history, which is worth more than the storage on a site where moderation is
 * otherwise opaque. Growth tracks moderation volume, not traffic.
 */
export type NotificationKind =
  | 'sanction'
  | 'content_removed'
  | 'content_retiered'
  | 'tier_changed'
  | 'appeal_resolved'
  | 'recovery_approved';

export interface NotifyPayload {
  /** A link the recipient can still see. Omitted otherwise. */
  readonly subjectPublicId?: string;
  readonly subjectTitle?: string;
  /** Server-chosen catalogue key. Never a sentence assembled here. */
  readonly detailKey?: string;
  /**
   * Free text under exactly the constraint a sanction note carries: written by
   * someone who sees everything, for someone who does not. It may never name a
   * reporter or reference content above the recipient's tier.
   */
  readonly note?: string;
}

export async function notify(
  userId: bigint,
  kind: NotificationKind,
  payload: NotifyPayload = {},
): Promise<void> {
  await db.notification.create({
    data: {
      publicId: publicId('n'),
      userId,
      kind,
      payload: payload as never,
    },
  });
}

export const unreadCount = (userId: bigint): Promise<number> =>
  db.notification.count({ where: { userId, readAt: null } });
