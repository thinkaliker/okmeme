/**
 * With no email provider, the in-app inbox is the only channel that reaches a
 * user at all — sanctions, moderation, tier changes, appeal outcomes, approved
 * recovery. That makes it infrastructure, not polish.
 *
 * Nothing is ever pruned: the inbox doubles as a permanent account history,
 * which is worth the storage on a site where moderation is otherwise opaque.
 */
export type NotificationKind =
  | 'sanction'
  | 'content_removed'
  | 'content_retiered'
  | 'tier_changed'
  | 'appeal_resolved'
  | 'recovery_approved';

/**
 * Payloads obey every visibility rule the rest of the API does. A removal
 * notification says "moderator" exactly as the post does, and never names an
 * actor or a tier — so there is no actor field here to render.
 */
export interface Notification {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly createdAt: string;
  readonly readAt: string | null;
  /** Optional deep link to something the viewer can still see. */
  readonly subject: { readonly type: 'link'; readonly publicId: string; readonly title: string } | null;
  /** Server-chosen reason/outcome key, resolved against the catalogue. */
  readonly detailKey: string | null;
  /** Free text written under the same constraint as a sanction note. */
  readonly note: string | null;
}
