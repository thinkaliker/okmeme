import { db } from '../db.js';

/**
 * Append-only, and the only place the real actor behind a moderation action is
 * recorded.
 *
 * In a system where identity is deliberately obscured and admins can rewrite
 * other people's titles, an unlogged admin edit is undetectable by design. The
 * log is readable by admin and owner and is never updated or deleted — the
 * database refuses both (see the trigger in migrations/0001_init.sql).
 */
export type AuditAction =
  | 'user.tier_changed'
  | 'user.suspended'
  | 'user.unsuspended'
  | 'user.reset'
  | 'user.deleted'
  | 'link.removed'
  | 'link.restored'
  | 'link.edited_by_moderator'
  | 'link.retiered'
  | 'tag.created'
  | 'tag.approved'
  | 'tag.rejected'
  | 'category.created'
  | 'invite.issued'
  | 'invite.revoked'
  | 'invite.consumed'
  | 'report.resolved'
  | 'appeal.resolved'
  | 'recovery.resolved'
  | 'settings.updated'
  | 'owner.added'
  | 'owner.removed'
  | 'setup.completed';

export async function audit(input: {
  actorId: bigint | null;
  action: AuditAction;
  subjectType: string;
  subjectId: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      before: (input.before ?? null) as never,
      after: (input.after ?? null) as never,
    },
  });
}
