import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { admin, taxonomy } from '@/api/endpoints';
import { AuthorLabel } from '@/components/AuthorLabel';
import { RecoveryCodes } from '@/components/RecoveryCodes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldHint, Input, Label, Select, Textarea } from '@/components/ui/field';
import type {
  AdminAppeal,
  AdminInvite,
  AdminRecoveryRequest,
  AdminReport,
  AdminUser,
  AppealOutcome,
  AuditEntry,
  InstanceSetting,
} from '@/domain/admin';
import type { TagProposal } from '@/domain/link';
import type { ReasonCategory, SuspensionType } from '@/domain/user';
import { TIER, can } from '@/domain/tier';
import { useCursorList } from '@/hooks/useCursorList';
import type { MessageKey } from '@/i18n/en';
import { t } from '@/i18n/t';
import { absoluteTime, relativeTime } from '@/lib/utils';
import { useSession } from '@/session/SessionProvider';

/**
 * The admin panel.
 *
 * Two audiences: staff reach the tag queue and nothing else, admins reach all
 * of it. Both are gated on the server — every tab here calls a route that
 * checks the tier again, and this file hiding a tab authorizes nothing.
 *
 * One rule shows up repeatedly below and is worth stating once: **an admin sees
 * everything, so real usernames are correct on this screen and only on this
 * screen.** None of these components may be reused anywhere a lower tier can
 * reach, because their payloads are wider than the ring model allows elsewhere.
 */

type TabKey =
  | 'tags'
  | 'reports'
  | 'appeals'
  | 'recovery'
  | 'users'
  | 'invites'
  | 'audit'
  | 'settings';

/** `[key, label, adminOnly]`. Staff see only the rows that are not admin-only. */
const TABS: readonly (readonly [TabKey, MessageKey, boolean])[] = [
  ['tags', 'admin.tab.tags', false],
  ['reports', 'admin.tab.reports', true],
  ['appeals', 'admin.tab.appeals', true],
  ['recovery', 'admin.tab.recovery', true],
  ['users', 'admin.tab.users', true],
  ['invites', 'admin.tab.invites', true],
  ['audit', 'admin.tab.audit', true],
  ['settings', 'admin.tab.settings', true],
];

function Empty() {
  return (
    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {t('admin.empty')}
    </p>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <li className="flex flex-col gap-2 rounded-lg border border-border p-3">{children}</li>;
}

/**
 * Every queue on this page is the same shape, including the part that matters:
 * cursor pagination with no total and no page number. An admin can see
 * everything, but the envelope does not change per audience — one list
 * contract, so there is no second one to get wrong.
 */
function Queue<T>({
  state,
  render,
  keyOf,
}: {
  state: ReturnType<typeof useCursorList<T>>;
  render: (item: T) => ReactNode;
  keyOf: (item: T) => string;
}) {
  if (state.loading) return <p className="text-sm text-muted-foreground">{t('app.loading')}</p>;
  if (state.error !== null) return <p className="text-sm text-destructive">{t('app.error')}</p>;
  if (state.items.length === 0) return <Empty />;

  return (
    <>
      <ul className="flex flex-col gap-2">
        {state.items.map((item) => (
          <Row key={keyOf(item)}>{render(item)}</Row>
        ))}
      </ul>
      {state.hasMore ? (
        <div>
          <Button size="sm" variant="outline" onClick={state.loadMore} disabled={state.loadingMore}>
            {t('feed.loadMore')}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------- tags */

/**
 * Tags proposed by authors below staff. Approving makes the word visible to
 * everyone; rejecting drops it, and the posts that carried it keep their other
 * tags and simply stop showing that one.
 */
function TagProposals() {
  const [proposals, setProposals] = useState<readonly TagProposal[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    taxonomy
      .pendingTags()
      .then(setProposals)
      .catch(() => setProposals([]));
  }, []);

  useEffect(load, [load]);

  async function resolve(slug: string, approve: boolean) {
    setBusy(slug);
    try {
      await (approve ? taxonomy.approveTag(slug) : taxonomy.rejectTag(slug));
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('moderation.tagProposalsHelp')}</p>

      {proposals === null ? null : proposals.length === 0 ? (
        <Empty />
      ) : (
        <ul className="flex flex-col gap-2">
          {proposals.map((proposal) => (
            <li
              key={proposal.slug}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border p-3"
            >
              <span className="rounded-full border border-dashed border-primary px-2 py-0.5 text-xs font-semibold">
                #{proposal.name}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {t('moderation.proposedBy')}
                {/* Resolved by the server like every other author reference,
                    even though a proposer is always below their reviewer. */}
                <AuthorLabel author={proposal.proposedBy} />
                <time dateTime={proposal.proposedAt}>{relativeTime(proposal.proposedAt)}</time>
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  disabled={busy === proposal.slug}
                  onClick={() => void resolve(proposal.slug, true)}
                >
                  {t('moderation.approve')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === proposal.slug}
                  onClick={() => void resolve(proposal.slug, false)}
                >
                  {t('moderation.reject')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- reports */

function Reports() {
  const state = useCursorList<AdminReport>(
    (cursor, signal) => admin.reports(cursor, { signal }),
    [],
  );
  const [note, setNote] = useState<Record<string, string>>({});

  async function resolve(report: AdminReport) {
    await admin.resolveReport(report.id, note[report.id] ?? '');
    state.reload();
  }

  return (
    <section className="flex flex-col gap-3">
      {/* The reporter is not in the payload at all. There is nothing to hide in
          this component because nothing was sent to it. */}
      <p className="text-sm text-muted-foreground">{t('admin.reporterHidden')}</p>

      <Queue
        state={state}
        keyOf={(report) => report.id}
        render={(report) => (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge>{report.reason}</Badge>
              {report.subject.type === 'link' ? (
                <span>
                  {t('admin.reportSubjectLink')}:{' '}
                  {report.subject.publicId === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <RouterLink
                      className="underline underline-offset-4"
                      to={`/l/${report.subject.publicId}`}
                    >
                      {report.subject.title ?? report.subject.publicId}
                    </RouterLink>
                  )}
                </span>
              ) : (
                <span>
                  {t('admin.reportSubjectUser')}: {report.subject.username ?? '—'}
                </span>
              )}
              <time className="ml-auto text-xs text-muted-foreground" dateTime={report.createdAt}>
                {relativeTime(report.createdAt)}
              </time>
            </div>

            {report.note === null || report.note === '' ? null : (
              <p className="text-sm text-muted-foreground">{report.note}</p>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-48 flex-1 flex-col gap-1">
                <Label htmlFor={`resolution-${report.id}`} className="text-xs">
                  {t('admin.resolution')}
                </Label>
                <Input
                  id={`resolution-${report.id}`}
                  value={note[report.id] ?? ''}
                  onChange={(event) =>
                    setNote((current) => ({ ...current, [report.id]: event.target.value }))
                  }
                />
              </div>
              <Button size="sm" onClick={() => void resolve(report)}>
                {t('admin.resolve')}
              </Button>
            </div>
          </>
        )}
      />
    </section>
  );
}

/* ---------------------------------------------------------------- appeals */

const OUTCOMES: readonly (readonly [AppealOutcome, MessageKey])[] = [
  ['upheld', 'admin.outcome.upheld'],
  ['reduced', 'admin.outcome.reduced'],
  ['overturned', 'admin.outcome.overturned'],
];

function Appeals() {
  const state = useCursorList<AdminAppeal>(
    (cursor, signal) => admin.appeals(cursor, { signal }),
    [],
  );
  const [draft, setDraft] = useState<Record<string, { outcome: AppealOutcome; note: string }>>({});

  async function resolve(appeal: AdminAppeal) {
    const current = draft[appeal.id] ?? { outcome: 'upheld' as const, note: '' };
    await admin.resolveAppeal(appeal.id, current.outcome, current.note);
    state.reload();
  }

  return (
    <Queue
      state={state}
      keyOf={(appeal) => appeal.id}
      render={(appeal) => {
        const current = draft[appeal.id] ?? { outcome: 'upheld' as const, note: '' };
        return (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{appeal.user.username ?? '—'}</span>
              <Badge>{appeal.sanction.reasonCategory}</Badge>
              {appeal.sanction.types.map((type) => (
                <Badge key={type} variant="outline">
                  {type}
                </Badge>
              ))}
              <time className="ml-auto text-xs text-muted-foreground" dateTime={appeal.createdAt}>
                {relativeTime(appeal.createdAt)}
              </time>
            </div>

            <p className="whitespace-pre-wrap text-sm">{appeal.body}</p>

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`outcome-${appeal.id}`} className="text-xs">
                  {t('admin.appealOutcome')}
                </Label>
                <Select
                  id={`outcome-${appeal.id}`}
                  value={current.outcome}
                  onChange={(event) =>
                    setDraft((all) => ({
                      ...all,
                      [appeal.id]: { ...current, outcome: event.target.value as AppealOutcome },
                    }))
                  }
                >
                  {OUTCOMES.map(([value, key]) => (
                    <option key={value} value={value}>
                      {t(key)}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex min-w-48 flex-1 flex-col gap-1">
                <Label htmlFor={`outcome-note-${appeal.id}`} className="text-xs">
                  {t('admin.outcomeNote')}
                </Label>
                <Input
                  id={`outcome-note-${appeal.id}`}
                  value={current.note}
                  onChange={(event) =>
                    setDraft((all) => ({
                      ...all,
                      [appeal.id]: { ...current, note: event.target.value },
                    }))
                  }
                />
              </div>

              <Button size="sm" onClick={() => void resolve(appeal)}>
                {t('admin.resolve')}
              </Button>
            </div>

            {/* Written by someone who sees everything, for someone who does not. */}
            <FieldHint>{t('admin.outcomeNoteHint')}</FieldHint>
          </>
        );
      }}
    />
  );
}

/* ---------------------------------------------------------------- recovery */

function RecoveryQueue() {
  const state = useCursorList<AdminRecoveryRequest>(
    (cursor, signal) => admin.recoveryRequests(cursor, { signal }),
    [],
  );
  const [issued, setIssued] = useState<readonly string[] | null>(null);

  async function resolve(request: AdminRecoveryRequest, approve: boolean) {
    const result = await admin.resolveRecoveryRequest(request.id, approve);
    if (approve) setIssued(result.recoveryCodes);
    state.reload();
  }

  return (
    <section className="flex flex-col gap-3">
      {/* Nothing in this queue proves anything about who filed it. That is the
          whole reason the verification step is out of band. */}
      <p className="text-sm text-muted-foreground">{t('admin.recoveryHint')}</p>

      {issued === null ? null : (
        <RecoveryCodes codes={issued} onAcknowledge={() => setIssued(null)} />
      )}

      <Queue
        state={state}
        keyOf={(request) => request.id}
        render={(request) => (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{request.user.username ?? '—'}</span>
              <time className="ml-auto text-xs text-muted-foreground" dateTime={request.createdAt}>
                {relativeTime(request.createdAt)}
              </time>
            </div>
            {request.note === '' ? null : (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{request.note}</p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void resolve(request, true)}>
                {t('admin.approveRecovery')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void resolve(request, false)}>
                {t('admin.declineRecovery')}
              </Button>
            </div>
          </>
        )}
      />
    </section>
  );
}

/* ---------------------------------------------------------------- users */

const SUSPENSION_TYPES: readonly SuspensionType[] = [
  'mute',
  'submission_ban',
  'lockout',
  'content_hold',
];

const REASONS: readonly ReasonCategory[] = ['spam', 'abuse', 'nsfw', 'other'];

function SuspendForm({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const [types, setTypes] = useState<SuspensionType[]>(['mute']);
  const [expiresAt, setExpiresAt] = useState('');
  const [reasonCategory, setReasonCategory] = useState<ReasonCategory>('other');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await admin.suspend(user.publicId, {
        types,
        expiresAt: expiresAt === '' ? null : new Date(expiresAt).toISOString(),
        reasonCategory,
        note,
      });
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('app.error'));
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium">{t('admin.suspendTypes')}</legend>
        <div className="flex flex-col gap-1">
          {SUSPENSION_TYPES.map((type) => (
            <label key={type} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-primary"
                checked={types.includes(type)}
                onChange={(event) =>
                  setTypes((current) =>
                    event.target.checked
                      ? [...current, type]
                      : current.filter((value) => value !== type),
                  )
                }
              />
              <span>
                <code className="font-mono text-xs">{type}</code>{' '}
                <span className="text-muted-foreground">
                  {t(`sanction.type.${type}` as MessageKey)}
                </span>
              </span>
            </label>
          ))}
        </div>
        {/* Three of the four leave content in place and are invisible from
            outside. This one empties a feed on a timer, which is observable. */}
        {types.includes('content_hold') ? (
          <FieldHint className="text-destructive">{t('admin.contentHoldWarning')}</FieldHint>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`expires-${user.publicId}`} className="text-xs">
            {t('admin.suspendExpires')}
          </Label>
          <Input
            id={`expires-${user.publicId}`}
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`reason-${user.publicId}`} className="text-xs">
            {t('admin.suspendReason')}
          </Label>
          <Select
            id={`reason-${user.publicId}`}
            value={reasonCategory}
            onChange={(event) => setReasonCategory(event.target.value as ReasonCategory)}
          >
            {REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {t(`sanction.reason.${reason}` as MessageKey)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`note-${user.publicId}`} className="text-xs">
          {t('admin.suspendNote')}
        </Label>
        <Textarea
          id={`note-${user.publicId}`}
          value={note}
          maxLength={2000}
          onChange={(event) => setNote(event.target.value)}
        />
        <FieldHint>{t('admin.suspendNoteHint')}</FieldHint>
      </div>

      {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

      <div>
        <Button size="sm" variant="destructive" onClick={() => void submit()}>
          {t('admin.suspend')}
        </Button>
      </div>
    </div>
  );
}

function Users() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const state = useCursorList<AdminUser>(
    (cursor, signal) => admin.users(cursor, search, { signal }),
    [search],
  );
  const [suspending, setSuspending] = useState<string | null>(null);
  const [issued, setIssued] = useState<readonly string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(run: () => Promise<unknown>) {
    setError(null);
    try {
      await run();
      state.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('app.error'));
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(query);
        }}
      >
        <Input
          aria-label={t('admin.userSearch')}
          placeholder={t('admin.userSearch')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button size="sm" type="submit" variant="outline">
          {t('nav.search')}
        </Button>
      </form>

      {error === null ? null : <p className="text-sm text-destructive">{error}</p>}
      {issued === null ? null : (
        <RecoveryCodes codes={issued} onAcknowledge={() => setIssued(null)} />
      )}

      <Queue
        state={state}
        keyOf={(user) => user.publicId}
        render={(user) => (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{user.username ?? <em>deleted</em>}</span>
              <Badge variant="tier">{user.tier}</Badge>
              {user.sanction === null ? null : (
                <Badge variant="outline">{user.sanction.types.join(', ')}</Badge>
              )}
              {user.invitedBy === null ? null : (
                <span className="text-xs text-muted-foreground">
                  invited by {user.invitedBy.username ?? '—'}
                </span>
              )}
              <time className="ml-auto text-xs text-muted-foreground" dateTime={user.createdAt}>
                {relativeTime(user.createdAt)}
              </time>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`tier-${user.publicId}`} className="text-xs">
                  {t('admin.setTier')}
                </Label>
                {/* Owner is absent on purpose: the owner set is managed under
                    /owner, and the server refuses tier 5 from this route. */}
                <Select
                  id={`tier-${user.publicId}`}
                  defaultValue={String(user.tier)}
                  onChange={(event) =>
                    void act(() => admin.setTier(user.publicId, Number(event.target.value)))
                  }
                >
                  {[TIER.limited, TIER.full, TIER.staff, TIER.admin].map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </Select>
              </div>

              {user.sanction === null ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSuspending((current) => (current === user.publicId ? null : user.publicId))
                  }
                >
                  {t('admin.suspend')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void act(() => admin.unsuspend(user.publicId))}
                >
                  {t('admin.unsuspend')}
                </Button>
              )}

              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void act(async () => {
                    const result = await admin.resetRecovery(user.publicId);
                    setIssued(result.recoveryCodes);
                  })
                }
              >
                {t('admin.reset')}
              </Button>
            </div>

            {suspending === user.publicId ? (
              <SuspendForm
                user={user}
                onDone={() => {
                  setSuspending(null);
                  state.reload();
                }}
              />
            ) : null}
          </>
        )}
      />
    </section>
  );
}

/* ---------------------------------------------------------------- invites */

function Invites() {
  const state = useCursorList<AdminInvite>(
    (cursor, signal) => admin.invites(cursor, { signal }),
    [],
  );
  const [note, setNote] = useState('');
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    setError(null);
    try {
      const invite = await admin.createInvite(note);
      setIssued({ code: invite.code, expiresAt: invite.expiresAt });
      setNote('');
      state.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('app.error'));
    }
  }

  function statusOf(invite: AdminInvite): string | null {
    if (invite.consumedAt !== null) return t('admin.inviteConsumed');
    if (invite.revokedAt !== null) return t('admin.inviteRevoked');
    if (new Date(invite.expiresAt).getTime() < Date.now()) return t('admin.inviteExpired');
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <Label htmlFor="invite-note" className="text-xs">
            {t('admin.inviteNote')}
          </Label>
          <Input id="invite-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        <Button size="sm" onClick={() => void issue()}>
          {t('admin.newInvite')}
        </Button>
      </div>

      {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

      {/* Hashed at rest and single-use. Once this box is dismissed the code
          exists nowhere but wherever the admin put it. */}
      {issued === null ? null : (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-accent/40 p-3">
          <p className="text-sm">{t('admin.inviteIssued')}</p>
          <code className="select-all rounded bg-background px-2 py-1 font-mono text-sm">
            {issued.code}
          </code>
          <p className="text-xs text-muted-foreground">
            {t('sanction.expires')}: {absoluteTime(issued.expiresAt)}
          </p>
          <div>
            <Button size="sm" variant="outline" onClick={() => setIssued(null)}>
              {t('app.close')}
            </Button>
          </div>
        </div>
      )}

      <Queue
        state={state}
        keyOf={(invite) => invite.id}
        render={(invite) => {
          const status = statusOf(invite);
          return (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">#{invite.id}</span>
              {invite.note === null ? null : <span>{invite.note}</span>}
              {status === null ? null : <Badge variant="outline">{status}</Badge>}
              {invite.consumedBy === null ? null : (
                <span className="text-xs text-muted-foreground">→ {invite.consumedBy}</span>
              )}
              <time className="ml-auto text-xs text-muted-foreground" dateTime={invite.issuedAt}>
                {relativeTime(invite.issuedAt)}
              </time>
              {status === null ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void admin.revokeInvite(invite.id).then(state.reload)}
                >
                  {t('admin.revoke')}
                </Button>
              ) : null}
            </div>
          );
        }}
      />
    </section>
  );
}

/* ---------------------------------------------------------------- audit */

function Audit() {
  const state = useCursorList<AuditEntry>((cursor, signal) => admin.audit(cursor, { signal }), []);

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('admin.auditHint')}</p>
      <Queue
        state={state}
        keyOf={(entry) => entry.id}
        render={(entry) => (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <code className="font-mono text-xs">{entry.action}</code>
              <span className="text-muted-foreground">
                {entry.subjectType}
                {entry.subjectId === null ? '' : ` ${entry.subjectId}`}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {entry.actor?.username ?? '—'} · {relativeTime(entry.createdAt)}
              </span>
            </div>
            {entry.before === null && entry.after === null ? null : (
              <pre className="overflow-x-auto rounded bg-muted/40 p-2 text-xs">
                {JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}
              </pre>
            )}
          </>
        )}
      />
    </section>
  );
}

/* ---------------------------------------------------------------- settings */

function Settings({ viewerTier }: { viewerTier: number }) {
  const [items, setItems] = useState<readonly InstanceSetting[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    admin
      .settings()
      .then((response) => setItems(response.items))
      .catch(() => setItems([]));
  }, []);

  async function save(key: string, fallback: unknown) {
    setError(null);
    const raw = draft[key];
    let value: unknown = fallback;
    if (raw !== undefined) {
      try {
        value = JSON.parse(raw);
      } catch {
        setError(t('admin.invalidJson'));
        return;
      }
    }
    try {
      const response = await admin.patchSettings({ [key]: value });
      setItems(response.items);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('app.error'));
    }
  }

  if (items === null) return <p className="text-sm text-muted-foreground">{t('app.loading')}</p>;

  return (
    <section className="flex flex-col gap-3">
      {/* min_writer_tier is why this is a list and not a form: some keys need
          more than admin, and invite_min_tier is the reason that exists. */}
      <p className="text-sm text-muted-foreground">{t('admin.settingsHint')}</p>
      {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

      <ul className="flex flex-col gap-2">
        {items.map((setting) => {
          const writable = viewerTier >= setting.minWriterTier;
          return (
            <li
              key={setting.key}
              className="flex flex-col gap-2 rounded-lg border border-border p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-sm">{setting.key}</code>
                {writable ? null : <Badge variant="outline">{t('admin.ownerOnly')}</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={setting.key}
                  className="font-mono"
                  disabled={!writable}
                  value={draft[setting.key] ?? JSON.stringify(setting.value)}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [setting.key]: event.target.value }))
                  }
                />
                <Button
                  size="sm"
                  disabled={!writable}
                  onClick={() => void save(setting.key, setting.value)}
                >
                  {t('admin.save')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- route */

export default function AdminRoute() {
  const { tier } = useSession();
  const [params, setParams] = useSearchParams();

  const adminTier = can.reviewReports(tier) || tier >= TIER.owner;
  const requested = params.get('tab') as TabKey | null;

  if (!can.createTags(tier) && !adminTier) {
    // Presentation, not authorization: every tab calls a route that checks the
    // tier again on the server.
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <p className="font-medium">{t('app.notFound')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('app.notFoundBody')}</p>
      </div>
    );
  }

  const visible = TABS.filter(([, , adminOnly]) => !adminOnly || adminTier);
  const current: TabKey =
    requested !== null && visible.some(([key]) => key === requested) ? requested : 'tags';

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">
        {adminTier ? t('admin.title') : t('moderation.title')}
      </h1>

      <nav aria-label={t('admin.title')} className="flex flex-wrap gap-1 border-b border-border">
        {visible.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={current === key ? 'page' : undefined}
            onClick={() => setParams(key === 'tags' ? {} : { tab: key })}
            className={
              current === key
                ? 'border-b-2 border-primary px-3 py-2 text-sm font-medium'
                : 'border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground'
            }
          >
            {t(label)}
          </button>
        ))}
      </nav>

      {current === 'tags' ? <TagProposals /> : null}
      {current === 'reports' ? <Reports /> : null}
      {current === 'appeals' ? <Appeals /> : null}
      {current === 'recovery' ? <RecoveryQueue /> : null}
      {current === 'users' ? <Users /> : null}
      {current === 'invites' ? <Invites /> : null}
      {current === 'audit' ? <Audit /> : null}
      {current === 'settings' ? <Settings viewerTier={tier} /> : null}

      {can.ownerSettings(tier) ? (
        <p className="text-sm">
          <RouterLink to="/owner" className="underline underline-offset-4">
            {t('owner.title')}
          </RouterLink>
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">{t('admin.gated')}</p>
    </div>
  );
}
