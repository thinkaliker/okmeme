import type { ReasonCategory, SuspensionType } from '@/domain/user';

/**
 * The admin surface.
 *
 * Every shape here is what the server sends to someone who can already see
 * everything — this is the one audience where real usernames are not a leak.
 * That is exactly why none of it may be reused on a screen a lower tier can
 * reach: the payloads are wider than the ring model allows anywhere else.
 */

/** A user reference in an admin list. Real names, because admins see all tiers. */
export interface AdminUserRef {
  readonly publicId: string;
  readonly username: string | null;
  readonly tier: number;
}

export interface AdminReport {
  readonly id: string;
  readonly reason: ReasonCategory | string;
  readonly note: string | null;
  readonly createdAt: string;
  readonly status: 'open' | 'resolved';
  readonly resolution: string | null;
  /** The reporter is never in this payload. It is never shown to anyone. */
  readonly subject:
    | { readonly type: 'link'; readonly publicId: string | null; readonly title: string | null }
    | {
        readonly type: 'user';
        readonly publicId: string | null;
        readonly username: string | null;
        readonly tier: number | null;
      };
}

export interface AdminSanctionRef {
  readonly id: string;
  readonly types: readonly SuspensionType[];
  readonly expiresAt: string | null;
  readonly reasonCategory: ReasonCategory;
  readonly note: string | null;
  readonly liftedAt?: string | null;
}

export interface AdminAppeal {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
  readonly user: AdminUserRef;
  readonly sanction: AdminSanctionRef;
}

export type AppealOutcome = 'upheld' | 'reduced' | 'overturned';

export interface AdminRecoveryRequest {
  readonly id: string;
  readonly note: string;
  readonly createdAt: string;
  readonly user: AdminUserRef;
}

export interface AdminUser extends AdminUserRef {
  readonly state: 'active' | 'deleted';
  readonly createdAt: string;
  readonly invitedBy: { readonly publicId: string; readonly username: string | null } | null;
  readonly sanction: Omit<AdminSanctionRef, 'note'> | null;
}

export interface AdminInvite {
  readonly id: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly note: string | null;
  readonly issuedBy: string | null;
  readonly consumedBy: string | null;
  readonly consumedAt: string | null;
  readonly revokedAt: string | null;
}

/** Returned once, at issuance. The code is hashed at rest and never readable again. */
export interface IssuedInvite {
  readonly id: string;
  readonly code: string;
  readonly expiresAt: string;
}

export interface AuditEntry {
  readonly id: string;
  readonly action: string;
  readonly subjectType: string;
  readonly subjectId: string | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly createdAt: string;
  /**
   * The audit log is the only place the real actor behind a moderation action
   * is recorded. Everywhere else, at every tier, it is "moderator".
   */
  readonly actor: AdminUserRef | null;
}

export interface InstanceSetting {
  readonly key: string;
  readonly value: unknown;
  /** Some settings need more than admin. `invite_min_tier` needs owner. */
  readonly minWriterTier: number;
  readonly updatedAt: string;
}

export interface Owner {
  readonly publicId: string;
  readonly username: string | null;
  readonly createdAt: string;
}

export interface ApiTokenSummary {
  readonly publicId: string;
  readonly name: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
}

/** The plaintext token exists in exactly one response and is never stored. */
export interface IssuedApiToken extends ApiTokenSummary {
  readonly token: string;
}

export interface SuspendInput {
  readonly types: readonly SuspensionType[];
  readonly expiresAt: string | null;
  readonly reasonCategory: ReasonCategory;
  readonly note: string;
}
