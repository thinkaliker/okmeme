import type { RequestOptions } from '@/api/client';
import { transport } from '@/api/transport';
import type {
  Category,
  FeedQuery,
  Link,
  PreviewResult,
  SearchQuery,
  SubmitDraft,
  Tag,
  TagProposal,
} from '@/domain/link';
import type {
  AdminAppeal,
  AdminInvite,
  AdminRecoveryRequest,
  AdminReport,
  AdminUser,
  AdminUserRef,
  ApiTokenSummary,
  AppealOutcome,
  AuditEntry,
  InstanceSetting,
  IssuedApiToken,
  IssuedInvite,
  Owner,
  SuspendInput,
} from '@/domain/admin';
import type { Notification } from '@/domain/notification';
import type { Page } from '@/domain/page';
import type { TierOrdinal } from '@/domain/tier';
import type { Me, MePatch } from '@/domain/user';

type Signal = { signal?: AbortSignal };

function options(query: RequestOptions['query'], extra?: Signal): RequestOptions {
  return { ...(query ? { query } : {}), ...(extra?.signal ? { signal: extra.signal } : {}) };
}

export const feed = {
  list(query: FeedQuery, extra?: Signal): Promise<Page<Link>> {
    return transport.request<Page<Link>>(
      'GET',
      '/feed',
      options(
        {
          cursor: query.cursor ?? undefined,
          limit: query.limit ?? undefined,
          category: query.category ?? undefined,
          tag: query.tag ?? undefined,
          sort: query.sort ?? undefined,
        },
        extra,
      ),
    );
  },

  search(query: SearchQuery, extra?: Signal): Promise<Page<Link>> {
    return transport.request<Page<Link>>(
      'GET',
      '/search',
      options(
        {
          q: query.q,
          cursor: query.cursor ?? undefined,
          limit: query.limit ?? undefined,
          category: query.category ?? undefined,
          tag: query.tag ?? undefined,
          bookmarked: query.bookmarked ?? undefined,
        },
        extra,
      ),
    );
  },
};

export const links = {
  get(publicId: string, extra?: Signal): Promise<Link> {
    return transport.request<Link>('GET', `/links/${publicId}`, options(undefined, extra));
  },

  submit(draft: SubmitDraft): Promise<Link> {
    return transport.request<Link>('POST', '/links', { body: draft });
  },

  preview(url: string): Promise<PreviewResult> {
    return transport.request<PreviewResult>('POST', '/links/preview', { body: { url } });
  },

  vote(publicId: string, on: boolean): Promise<Link> {
    return transport.request<Link>(on ? 'POST' : 'DELETE', `/links/${publicId}/vote`);
  },

  bookmark(publicId: string, on: boolean): Promise<Link> {
    return transport.request<Link>(on ? 'POST' : 'DELETE', `/links/${publicId}/bookmark`);
  },
};

export const taxonomy = {
  categories(extra?: Signal): Promise<readonly Category[]> {
    return transport.request<readonly Category[]>('GET', '/categories', options(undefined, extra));
  },

  /**
   * Approved tags, plus the caller's own pending proposals so their submit form
   * can show them. Other people's pending tags are staff-only.
   */
  tags(extra?: Signal): Promise<readonly Tag[]> {
    return transport.request<readonly Tag[]>('GET', '/tags', options(undefined, extra));
  },

  /** The review queue. Staff and above. */
  pendingTags(extra?: Signal): Promise<readonly TagProposal[]> {
    return transport.request<readonly TagProposal[]>(
      'GET',
      '/tags/pending',
      options(undefined, extra),
    );
  },

  approveTag(slug: string): Promise<void> {
    return transport.request<void>('POST', `/tags/${slug}/approve`);
  },

  rejectTag(slug: string): Promise<void> {
    return transport.request<void>('DELETE', `/tags/${slug}`);
  },
};

export const me = {
  get(extra?: Signal): Promise<Me> {
    return transport.request<Me>('GET', '/me', options(undefined, extra));
  },
  patch(patch: MePatch): Promise<Me> {
    return transport.request<Me>('PATCH', '/me', { body: patch });
  },
  bookmarks(cursor: string | null, extra?: Signal): Promise<Page<Link>> {
    return transport.request<Page<Link>>(
      'GET',
      '/me/bookmarks',
      options({ cursor: cursor ?? undefined }, extra),
    );
  },
  notifications(cursor: string | null, extra?: Signal): Promise<Page<Notification>> {
    return transport.request<Page<Notification>>(
      'GET',
      '/me/notifications',
      options({ cursor: cursor ?? undefined }, extra),
    );
  },
  markNotificationsRead(ids?: readonly string[]): Promise<{ unread: number }> {
    return transport.request<{ unread: number }>('POST', '/me/notifications/read', {
      body: ids ? { ids } : {},
    });
  },
  appeal(body: string): Promise<void> {
    return transport.request<void>('POST', '/me/suspension/appeal', { body: { body } });
  },

  tokens(extra?: Signal): Promise<Page<ApiTokenSummary>> {
    return transport.request<Page<ApiTokenSummary>>(
      'GET',
      '/me/tokens',
      options(undefined, extra),
    );
  },

  /** The plaintext token comes back once, here, and is never retrievable again. */
  createToken(name: string): Promise<IssuedApiToken> {
    return transport.request<IssuedApiToken>('POST', '/me/tokens', { body: { name } });
  },

  revokeToken(publicId: string): Promise<void> {
    return transport.request<void>('DELETE', `/me/tokens/${publicId}`);
  },

  /** Regenerating invalidates all ten prior codes, used or not. */
  regenerateRecoveryCodes(): Promise<{ recoveryCodes: readonly string[] }> {
    return transport.request<{ recoveryCodes: readonly string[] }>('POST', '/me/recovery-codes');
  },

  deleteAccount(): Promise<void> {
    return transport.request<void>('DELETE', '/me');
  },
};

/** `Me` plus the ten codes, which exist in exactly one response, ever. */
export interface SignupResult extends Me {
  readonly recoveryCodes: readonly string[];
}

export const auth = {
  login(username: string, password: string): Promise<Me> {
    return transport.request<Me>('POST', '/auth/login', { body: { username, password } });
  },
  logout(): Promise<void> {
    return transport.request<void>('POST', '/auth/logout');
  },

  /** Invite-only. There is no self-serve path onto an instance. */
  signup(username: string, password: string, invite: string): Promise<SignupResult> {
    return transport.request<SignupResult>('POST', '/auth/signup', {
      body: { username, password, invite },
    });
  },

  /** Spends one of the ten codes and sets a new password. */
  recover(username: string, code: string, password: string): Promise<Me> {
    return transport.request<Me>('POST', '/auth/recover', { body: { username, code, password } });
  },

  /**
   * For someone with no codes left. The response is identical whether or not
   * the account exists, so the client has nothing to branch on and must not try.
   */
  recoveryRequest(username: string, note: string): Promise<{ ok: boolean; message: string }> {
    return transport.request<{ ok: boolean; message: string }>('POST', '/auth/recovery-request', {
      body: { username, note },
    });
  },

  changePassword(current: string, next: string): Promise<void> {
    return transport.request<void>('POST', '/auth/password', { body: { current, next } });
  },
  /** Mock-only affordance; see src/api/mock/transport.ts. */
  devAccounts(): Promise<readonly { username: string; tier: TierOrdinal }[]> {
    return transport.request<readonly { username: string; tier: TierOrdinal }[]>(
      'GET',
      '/auth/accounts',
    );
  },
};

export const reports = {
  create(subject: { type: 'link' | 'user'; publicId: string }, reason: string, note: string): Promise<void> {
    return transport.request<void>('POST', '/reports', { body: { subject, reason, note } });
  },
};

/**
 * Admin. Every route here is gated on the server — the panel refusing to render
 * is a convenience, not a control.
 */
export const admin = {
  reports(cursor: string | null, extra?: Signal): Promise<Page<AdminReport>> {
    return transport.request<Page<AdminReport>>(
      'GET',
      '/admin/reports',
      options({ cursor: cursor ?? undefined }, extra),
    );
  },
  resolveReport(id: string, resolution: string): Promise<void> {
    return transport.request<void>('POST', `/admin/reports/${id}/resolve`, {
      body: { resolution },
    });
  },

  appeals(cursor: string | null, extra?: Signal): Promise<Page<AdminAppeal>> {
    return transport.request<Page<AdminAppeal>>(
      'GET',
      '/admin/appeals',
      options({ cursor: cursor ?? undefined }, extra),
    );
  },
  resolveAppeal(id: string, outcome: AppealOutcome, note: string): Promise<void> {
    return transport.request<void>('POST', `/admin/appeals/${id}/resolve`, {
      body: { outcome, note },
    });
  },

  recoveryRequests(cursor: string | null, extra?: Signal): Promise<Page<AdminRecoveryRequest>> {
    return transport.request<Page<AdminRecoveryRequest>>(
      'GET',
      '/admin/recovery-requests',
      options({ cursor: cursor ?? undefined }, extra),
    );
  },
  resolveRecoveryRequest(id: string, approve: boolean): Promise<{ recoveryCodes: readonly string[] }> {
    return transport.request<{ recoveryCodes: readonly string[] }>(
      'POST',
      `/admin/recovery-requests/${id}/resolve`,
      { body: { approve } },
    );
  },

  users(cursor: string | null, q: string, extra?: Signal): Promise<Page<AdminUser>> {
    return transport.request<Page<AdminUser>>(
      'GET',
      '/admin/users',
      options({ cursor: cursor ?? undefined, q: q === '' ? undefined : q }, extra),
    );
  },
  setTier(publicId: string, tier: number): Promise<void> {
    return transport.request<void>('POST', `/admin/users/${publicId}/tier`, { body: { tier } });
  },
  suspend(publicId: string, input: SuspendInput): Promise<{ id: string }> {
    return transport.request<{ id: string }>('POST', `/admin/users/${publicId}/suspend`, {
      body: input,
    });
  },
  unsuspend(publicId: string): Promise<void> {
    return transport.request<void>('POST', `/admin/users/${publicId}/unsuspend`);
  },
  resetRecovery(publicId: string): Promise<{ recoveryCodes: readonly string[] }> {
    return transport.request<{ recoveryCodes: readonly string[] }>(
      'POST',
      `/admin/users/${publicId}/reset`,
    );
  },

  /** Open-ended sanctions, oldest first, so they cannot accumulate unseen. */
  indefiniteSuspensions(cursor: string | null, extra?: Signal): Promise<Page<AdminAppeal['sanction'] & { user: AdminUserRef; createdAt: string }>> {
    return transport.request('GET', '/admin/suspensions/indefinite', options({ cursor: cursor ?? undefined }, extra));
  },

  retierLink(publicId: string, tier: number | null): Promise<void> {
    return transport.request<void>('POST', `/admin/links/${publicId}/tier`, { body: { tier } });
  },

  invites(cursor: string | null, extra?: Signal): Promise<Page<AdminInvite>> {
    return transport.request<Page<AdminInvite>>(
      'GET',
      '/admin/invites',
      options({ cursor: cursor ?? undefined }, extra),
    );
  },
  createInvite(note: string): Promise<IssuedInvite> {
    return transport.request<IssuedInvite>('POST', '/admin/invites', { body: { note } });
  },
  revokeInvite(id: string): Promise<void> {
    return transport.request<void>('DELETE', `/admin/invites/${id}`);
  },

  audit(cursor: string | null, extra?: Signal): Promise<Page<AuditEntry>> {
    return transport.request<Page<AuditEntry>>(
      'GET',
      '/admin/audit',
      options({ cursor: cursor ?? undefined }, extra),
    );
  },

  settings(extra?: Signal): Promise<{ items: readonly InstanceSetting[] }> {
    return transport.request<{ items: readonly InstanceSetting[] }>(
      'GET',
      '/admin/settings',
      options(undefined, extra),
    );
  },
  patchSettings(patch: Record<string, unknown>): Promise<{ items: readonly InstanceSetting[] }> {
    return transport.request<{ items: readonly InstanceSetting[] }>('PATCH', '/admin/settings', {
      body: patch,
    });
  },
};

/**
 * Owner. A set, not an account: any owner may add or remove another, and the
 * last one cannot be removed.
 */
export const owner = {
  owners(extra?: Signal): Promise<Page<Owner>> {
    return transport.request<Page<Owner>>('GET', '/owner/owners', options(undefined, extra));
  },
  add(publicId: string): Promise<void> {
    return transport.request<void>('POST', '/owner/owners', { body: { publicId } });
  },
  remove(publicId: string): Promise<void> {
    return transport.request<void>('DELETE', `/owner/owners/${publicId}`);
  },
  /**
   * `invite_min_tier` below admin requires `confirm: true`. That is not a
   * double-check on a preference — it is a change to the security model, and it
   * is effectively irreversible. See VISIBILITY.md.
   */
  patchSettings(patch: Record<string, unknown>): Promise<{ items: readonly InstanceSetting[] }> {
    return transport.request<{ items: readonly InstanceSetting[] }>('PATCH', '/owner/settings', {
      body: patch,
    });
  },
};

export interface SetupAvailability {
  readonly available: boolean;
  readonly creates: readonly string[];
  readonly note: string;
  /** Whether a blob store is configured. False means thumbnails cannot run. */
  readonly blobStore: boolean;
}

export interface SetupResult {
  readonly owner: { username: string; publicId: string; recoveryCodes: readonly string[] };
  readonly admin: { username: string; publicId: string; recoveryCodes: readonly string[] };
}

/**
 * One time, ever. Available only while the instance is unconfigured and a
 * SETUP_TOKEN is set; 404s permanently afterwards, so a leaked token on a live
 * instance is inert.
 */
export const setup = {
  check(token: string): Promise<SetupAvailability> {
    return transport.request<SetupAvailability>('GET', '/setup', { query: { token } });
  },
  create(input: {
    token: string;
    ownerUsername: string;
    ownerPassword: string;
    adminUsername: string;
    adminPassword: string;
    thumbnails: boolean;
  }): Promise<SetupResult> {
    return transport.request<SetupResult>('POST', '/setup', { body: input });
  },
};
