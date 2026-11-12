import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { admin, taxonomy } from '@/api/endpoints';
import { AuthorLabel } from '@/components/AuthorLabel';
import { notifyCategoriesChanged } from '@/components/CategoryNav';
import { RecoveryCodes } from '@/components/RecoveryCodes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldHint } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type {
  AdminAppeal,
  AdminCategory,
  AdminInvite,
  AdminRecoveryRequest,
  AdminReport,
  AdminUser,
  AppealOutcome,
  AuditEntry,
  InstanceSetting,
  InvitePatch,
  IssuedInvite,
} from '@/domain/admin';
import type { TagProposal } from '@/domain/link';
import type { ReasonCategory, SuspensionType } from '@/domain/user';
import {
  TIER,
  assignableTiers,
  can,
  type AuthorTierLabel,
  type TierOrdinal,
  type ViewerTier,
} from '@/domain/tier';
import { useCursorList } from '@/hooks/useCursorList';
import type { MessageKey } from '@/i18n/en';
import { t, tierLabel } from '@/i18n/t';
import { toCategorySlug } from '@/lib/slug';
import { tintDot } from '@/lib/tint';
import { absoluteTime, relativeTime, toDateTimeLocal } from '@/lib/utils';
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
  | 'categories'
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
  ['categories', 'admin.tab.categories', true],
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
                <NativeSelect
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
                    <NativeSelectOption key={value} value={value}>
                      {t(key)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
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
          <NativeSelect
            id={`reason-${user.publicId}`}
            value={reasonCategory}
            onChange={(event) => setReasonCategory(event.target.value as ReasonCategory)}
          >
            {REASONS.map((reason) => (
              <NativeSelectOption key={reason} value={reason}>
                {t(`sanction.reason.${reason}` as MessageKey)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
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

/**
 * Ordinal, label and what the tier can do — one fixed table for the legend, the
 * badge and the picker.
 *
 * Elsewhere a tier name is chosen by the server and never derived from an
 * ordinal in the browser, because there it is a visibility boundary. Not here:
 * this screen is admin-only and an admin already sees every tier, so naming the
 * ordinal crosses nothing.
 */
const TIER_ROWS: readonly (readonly [TierOrdinal, AuthorTierLabel, MessageKey])[] = [
  [TIER.limited, 'limited', 'admin.tierLegend.limited'],
  [TIER.full, 'full', 'admin.tierLegend.full'],
  [TIER.staff, 'staff', 'admin.tierLegend.staff'],
  [TIER.admin, 'admin', 'admin.tierLegend.admin'],
  [TIER.owner, 'owner', 'admin.tierLegend.owner'],
];

function tierText(ordinal: number): string {
  const row = TIER_ROWS.find(([value]) => value === ordinal);
  return row === undefined ? `${ordinal}` : `${ordinal} · ${tierLabel(row[1])}`;
}

function TierLegend({ viewer }: { viewer: ViewerTier }) {
  return (
    <details open className="rounded-lg border border-border p-3 text-sm">
      <summary className="cursor-pointer font-medium">{t('admin.tierLegendTitle')}</summary>
      <p className="mt-2 text-muted-foreground">{t('admin.tierLegendBody')}</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5">
        {TIER_ROWS.map(([ordinal, , description]) => (
          <Fragment key={ordinal}>
            <dt>
              <Badge variant="tier">{tierText(ordinal)}</Badge>
            </dt>
            <dd className="text-muted-foreground">{t(description)}</dd>
          </Fragment>
        ))}
      </dl>
      <p className="mt-3 text-muted-foreground">
        {viewer >= TIER.owner ? t('admin.tierRuleOwner') : t('admin.tierRuleAdmin')}
      </p>
    </details>
  );
}

/**
 * Pick, then apply. A select that fires on change turns an arrow key on a
 * focused control into a promotion, and promotion is a full retroactive reveal
 * that demotion cannot take back.
 *
 * Offers only what the server would accept. Owner is never on the list: the
 * owner set is changed under /owner, which is where "the last owner cannot be
 * removed" is enforced.
 */
function TierControl({
  user,
  viewer,
  self,
  onApply,
}: {
  user: AdminUser;
  viewer: ViewerTier;
  self: boolean;
  onApply: (tier: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<number>(user.tier);
  const [busy, setBusy] = useState(false);

  // The list reloads after a change; follow it rather than a stale pick.
  useEffect(() => setDraft(user.tier), [user.tier]);

  if (user.state !== 'active') return null;

  const choices = self ? [] : assignableTiers(viewer, user.tier);

  if (choices.length === 0) {
    if (user.tier >= TIER.owner) {
      return can.ownerSettings(viewer) ? (
        <RouterLink to="/owner" className="text-xs underline underline-offset-4">
          {t('admin.tierLockedOwner')}
        </RouterLink>
      ) : (
        <p className="text-xs text-muted-foreground">{t('admin.tierLockedOwner')}</p>
      );
    }
    return (
      <p className="text-xs text-muted-foreground">
        {self ? t('admin.tierLockedSelf') : t('admin.tierLockedAdmin')}
      </p>
    );
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`tier-${user.publicId}`} className="text-xs">
          {t('admin.setTier')}
        </Label>
        <NativeSelect
          id={`tier-${user.publicId}`}
          value={String(draft)}
          onChange={(event) => setDraft(Number(event.target.value))}
        >
          {choices.map((tier) => (
            <NativeSelectOption key={tier} value={tier}>
              {tierText(tier)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || draft === user.tier}
        onClick={() => {
          setBusy(true);
          void onApply(draft).finally(() => setBusy(false));
        }}
      >
        {t('admin.tierApply')}
      </Button>
    </div>
  );
}

function Users({ viewer, selfId }: { viewer: ViewerTier; selfId: string | null }) {
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
      <TierLegend viewer={viewer} />

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
              <Badge variant="tier" title={t('admin.tierLegendTitle')}>
                {tierText(user.tier)}
              </Badge>
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
              <TierControl
                user={user}
                viewer={viewer}
                self={user.publicId === selfId}
                onApply={(tier) => act(() => admin.setTier(user.publicId, tier))}
              />

              {user.sanction === null ? (
                // The server refuses a suspension of anyone at or above the
                // actor's own tier, which includes the actor themselves.
                user.tier < viewer ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSuspending((current) => (current === user.publicId ? null : user.publicId))
                    }
                  >
                    {t('admin.suspend')}
                  </Button>
                ) : null
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

/* ---------------------------------------------------------------- categories */

/**
 * Add, rename, delete.
 *
 * The slug is fixed at creation: it is the `/c/:slug` address and the seed of
 * the category's colour, so a rename changes the name and nothing else. A link
 * has exactly one category, so deleting one that still holds links means
 * choosing where they go — the server refuses otherwise.
 */
function Categories() {
  const [items, setItems] = useState<readonly AdminCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ slug: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ slug: string; moveTo: string } | null>(null);

  const load = useCallback(() => {
    admin
      .categories()
      .then((page) => setItems(page.items))
      .catch(() => {
        setItems([]);
        setError(t('app.error'));
      });
  }, []);

  useEffect(load, [load]);

  async function run(work: () => Promise<unknown>, done: () => void) {
    setBusy(true);
    setError(null);
    try {
      await work();
      done();
      notifyCategoriesChanged();
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('app.error'));
      // Someone posted into it since this list loaded. Reloading flips its
      // in-use flag, which is what brings up the move-to picker.
      if (cause instanceof ApiError && cause.code === 'category_in_use') load();
    } finally {
      setBusy(false);
    }
  }

  const newSlug = toCategorySlug(name);

  if (items === null) return <p className="text-sm text-muted-foreground">{t('app.loading')}</p>;

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('admin.categoriesHint')}</p>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (newSlug === '') return;
          void run(() => taxonomy.createCategory(name.trim()), () => setName(''));
        }}
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <Label htmlFor="category-new" className="text-xs">
            {t('admin.categoryName')}
          </Label>
          <Input
            id="category-new"
            value={name}
            maxLength={48}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button size="sm" type="submit" disabled={busy || newSlug === ''}>
          {t('admin.newCategory')}
        </Button>
        {name.trim() === '' ? null : (
          <FieldHint className={newSlug === '' ? 'w-full text-destructive' : 'w-full'}>
            {newSlug === ''
              ? t('admin.categoryNoSlug')
              : t('admin.categoryAddress', { slug: newSlug })}
          </FieldHint>
        )}
      </form>

      {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('admin.noCategories')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((category) => {
            const others = items.filter((other) => other.slug !== category.slug);
            const isRenaming = renaming?.slug === category.slug;
            const isDeleting = deleting?.slug === category.slug;

            return (
              <Row key={category.slug}>
                {isRenaming ? (
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (renaming.name.trim() === '') return;
                      void run(
                        () => taxonomy.renameCategory(category.slug, renaming.name.trim()),
                        () => setRenaming(null),
                      );
                    }}
                  >
                    <div className="flex min-w-48 flex-1 flex-col gap-1">
                      <Label htmlFor={`category-name-${category.slug}`} className="text-xs">
                        {t('admin.categoryName')}
                      </Label>
                      <Input
                        id={`category-name-${category.slug}`}
                        autoFocus
                        value={renaming.name}
                        maxLength={48}
                        onChange={(event) =>
                          setRenaming({ slug: category.slug, name: event.target.value })
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setRenaming(null);
                        }}
                      />
                    </div>
                    <Button
                      size="sm"
                      type="submit"
                      disabled={
                        busy ||
                        renaming.name.trim() === '' ||
                        renaming.name.trim() === category.name
                      }
                    >
                      {t('admin.save')}
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => setRenaming(null)}
                    >
                      {t('admin.cancel')}
                    </Button>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={tintDot(category.slug)}
                    />
                    <span className="font-medium">{category.name}</span>
                    <code className="font-mono text-xs text-muted-foreground">
                      /c/{category.slug}
                    </code>
                    <Badge variant="outline">
                      {category.inUse ? t('admin.categoryInUse') : t('admin.categoryEmpty')}
                    </Badge>
                    <div className="ml-auto flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setDeleting(null);
                          setRenaming({ slug: category.slug, name: category.name });
                        }}
                      >
                        {t('admin.rename')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setRenaming(null);
                          setDeleting(
                            isDeleting
                              ? null
                              : { slug: category.slug, moveTo: others[0]?.slug ?? '' },
                          );
                        }}
                      >
                        {t('admin.delete')}
                      </Button>
                    </div>
                  </div>
                )}

                {isDeleting ? (
                  <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3">
                    {!category.inUse ? (
                      <p className="text-sm">
                        {t('admin.categoryDeleteEmpty', { name: category.name })}
                      </p>
                    ) : others.length === 0 ? (
                      <p className="text-sm">{t('admin.categoryOnlyOne')}</p>
                    ) : (
                      <>
                        <p className="text-sm">
                          {t('admin.categoryDeleteMove', { name: category.name })}
                        </p>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`category-move-${category.slug}`} className="text-xs">
                            {t('admin.categoryMoveTo')}
                          </Label>
                          <NativeSelect
                            id={`category-move-${category.slug}`}
                            value={deleting.moveTo}
                            onChange={(event) =>
                              setDeleting({ slug: category.slug, moveTo: event.target.value })
                            }
                          >
                            {others.map((other) => (
                              <NativeSelectOption key={other.slug} value={other.slug}>
                                {other.name}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </div>
                      </>
                    )}

                    <div className="flex gap-2">
                      {category.inUse && others.length === 0 ? null : (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                taxonomy.deleteCategory(
                                  category.slug,
                                  category.inUse ? deleting.moveTo : undefined,
                                ),
                              () => setDeleting(null),
                            )
                          }
                        >
                          {t('admin.categoryDeleteConfirm')}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setDeleting(null)}>
                        {t('admin.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Row>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- invites */

/** `''` is unlimited. Anything else must be a whole number of at least one. */
function parseUses(raw: string): number | null | undefined {
  const text = raw.trim();
  if (text === '') return null;
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 && value <= 10_000 ? value : undefined;
}

function limitLabel(maxUses: number | null): string {
  if (maxUses === null) return t('admin.inviteUnlimited');
  if (maxUses === 1) return t('admin.inviteOneTime');
  return t('admin.inviteUpTo', { count: maxUses });
}

/** Counted from the list itself. The server never sends a number of uses. */
function usageLabel(invite: AdminInvite): string {
  const used = invite.redeemedBy.length;
  if (invite.maxUses === null) return t('admin.inviteUsageUnlimited', { used });
  if (invite.maxUses === 1) return t('admin.inviteOneTime');
  return t('admin.inviteUsage', { used, max: invite.maxUses });
}

function expiryLabel(expiresAt: string | null): string {
  if (expiresAt === null) return t('admin.inviteNoExpiry');
  const when = relativeTime(expiresAt);
  return new Date(expiresAt).getTime() < Date.now()
    ? t('admin.inviteExpiredWhen', { when })
    : t('admin.inviteExpiresIn', { when });
}

/** Revoked is final, so it wins; used up outranks expired because it is the reason to edit. */
function inviteStatus(invite: AdminInvite): string | null {
  if (invite.revokedAt !== null) return t('admin.inviteRevoked');
  if (invite.exhausted) return t('admin.inviteConsumed');
  if (invite.expiresAt !== null && new Date(invite.expiresAt).getTime() < Date.now()) {
    return t('admin.inviteExpired');
  }
  return null;
}

function InviteEditor({
  invite,
  busy,
  onSave,
  onCancel,
}: {
  invite: AdminInvite;
  busy: boolean;
  onSave: (patch: InvitePatch) => void;
  onCancel: () => void;
}) {
  const initialExpiry = invite.expiresAt === null ? '' : toDateTimeLocal(invite.expiresAt);
  const [note, setNote] = useState(invite.note ?? '');
  const [maxUses, setMaxUses] = useState(invite.maxUses === null ? '' : String(invite.maxUses));
  const [expires, setExpires] = useState(initialExpiry);
  const [never, setNever] = useState(invite.expiresAt === null);

  const used = invite.redeemedBy.length;
  const parsedUses = parseUses(maxUses);
  const usesValid = parsedUses !== undefined && (parsedUses === null || parsedUses >= used);
  const expiryValid = never || expires !== '';

  function save() {
    // Only what changed. Round-tripping the expiry through a minute-precision
    // input would otherwise move it by a few seconds and audit a non-change.
    const patch: { note?: string; maxUses?: number | null; expiresAt?: string | null } = {};
    if (note.trim() !== (invite.note ?? '')) patch.note = note.trim();
    if (parsedUses !== undefined && parsedUses !== invite.maxUses) patch.maxUses = parsedUses;
    if (never) {
      if (invite.expiresAt !== null) patch.expiresAt = null;
    } else if (invite.expiresAt === null || expires !== initialExpiry) {
      patch.expiresAt = new Date(expires).toISOString();
    }
    if (Object.keys(patch).length === 0) onCancel();
    else onSave(patch);
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (usesValid && expiryValid) save();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`invite-edit-note-${invite.id}`} className="text-xs">
          {t('admin.inviteNote')}
        </Label>
        <Input
          id={`invite-edit-note-${invite.id}`}
          autoFocus
          value={note}
          maxLength={200}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="flex w-40 flex-col gap-1">
          <Label htmlFor={`invite-edit-uses-${invite.id}`} className="text-xs">
            {t('admin.inviteMaxUses')}
          </Label>
          <Input
            id={`invite-edit-uses-${invite.id}`}
            type="number"
            min={Math.max(1, used)}
            step={1}
            placeholder={t('admin.inviteUnlimited')}
            value={maxUses}
            onChange={(event) => setMaxUses(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`invite-edit-expires-${invite.id}`} className="text-xs">
            {t('admin.inviteExpiresAt')}
          </Label>
          <Input
            id={`invite-edit-expires-${invite.id}`}
            type="datetime-local"
            value={expires}
            disabled={never}
            onChange={(event) => setExpires(event.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary"
            checked={never}
            onChange={(event) => setNever(event.target.checked)}
          />
          {t('admin.inviteNeverExpires')}
        </label>
      </div>
      <FieldHint className={usesValid ? undefined : 'text-destructive'}>
        {used > 1 ? t('admin.inviteMaxUsesFloor', { count: used }) : t('admin.inviteMaxUsesHint')}
      </FieldHint>
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={busy || !usesValid || !expiryValid}>
          {t('admin.save')}
        </Button>
        <Button size="sm" type="button" variant="outline" onClick={onCancel}>
          {t('admin.cancel')}
        </Button>
      </div>
    </form>
  );
}

function Invites() {
  const state = useCursorList<AdminInvite>(
    (cursor, signal) => admin.invites(cursor, { signal }),
    [],
  );
  const [note, setNote] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [ttlDays, setTtlDays] = useState('');
  const [never, setNever] = useState(false);
  const [issued, setIssued] = useState<IssuedInvite | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedUses = parseUses(maxUses);
  const parsedTtl = ttlDays.trim() === '' ? undefined : Number(ttlDays);
  const ttlValid =
    never || parsedTtl === undefined || (Number.isInteger(parsedTtl) && parsedTtl >= 1 && parsedTtl <= 365);
  const canIssue = parsedUses !== undefined && ttlValid;
  // One-time and expiring is the only shape where a leaked code costs one account.
  const wide = parsedUses !== 1 || never;

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      state.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('app.error'));
    } finally {
      setBusy(false);
    }
  }

  function issue() {
    if (parsedUses === undefined) return;
    void run(async () => {
      const invite = await admin.createInvite({
        note,
        maxUses: parsedUses,
        ...(never ? { ttlDays: null } : parsedTtl === undefined ? {} : { ttlDays: parsedTtl }),
      });
      setIssued(invite);
      setNote('');
      setMaxUses('1');
      setTtlDays('');
      setNever(false);
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (canIssue) issue();
        }}
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <Label htmlFor="invite-note" className="text-xs">
              {t('admin.inviteNote')}
            </Label>
            <Input
              id="invite-note"
              value={note}
              maxLength={200}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className="flex w-28 flex-col gap-1">
            <Label htmlFor="invite-max-uses" className="text-xs">
              {t('admin.inviteMaxUses')}
            </Label>
            <Input
              id="invite-max-uses"
              type="number"
              min={1}
              step={1}
              placeholder={t('admin.inviteUnlimited')}
              value={maxUses}
              onChange={(event) => setMaxUses(event.target.value)}
            />
          </div>
          <div className="flex w-36 flex-col gap-1">
            <Label htmlFor="invite-ttl" className="text-xs">
              {t('admin.inviteTtlDays')}
            </Label>
            <Input
              id="invite-ttl"
              type="number"
              min={1}
              max={365}
              step={1}
              value={ttlDays}
              disabled={never}
              onChange={(event) => setTtlDays(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary"
              checked={never}
              onChange={(event) => setNever(event.target.checked)}
            />
            {t('admin.inviteNeverExpires')}
          </label>
          <Button size="sm" type="submit" disabled={busy || !canIssue}>
            {t('admin.newInvite')}
          </Button>
        </div>
        <FieldHint className={parsedUses === undefined ? 'text-destructive' : undefined}>
          {t('admin.inviteMaxUsesHint')} {never ? null : t('admin.inviteTtlHint')}
        </FieldHint>
        {/* The defaults are the only shape where a leaked code costs at most
            one account. Anything wider is allowed, but said out loud. */}
        {wide ? <FieldHint className="text-destructive">{t('admin.inviteWideWarning')}</FieldHint> : null}
      </form>

      {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

      {/* Hashed at rest. Once this box is dismissed the code exists nowhere but
          wherever the admin put it. */}
      {issued === null ? null : (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-accent/40 p-3">
          <p className="text-sm">{t('admin.inviteIssued')}</p>
          <code className="select-all rounded bg-background px-2 py-1 font-mono text-sm">
            {issued.code}
          </code>
          <p className="text-xs text-muted-foreground">
            {limitLabel(issued.maxUses)} ·{' '}
            {issued.expiresAt === null
              ? t('admin.inviteNoExpiry')
              : `${t('sanction.expires')}: ${absoluteTime(issued.expiresAt)}`}
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
          const status = inviteStatus(invite);
          const revoked = invite.revokedAt !== null;
          return (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">#{invite.id}</span>
                {invite.note === null ? null : <span>{invite.note}</span>}
                {status === null ? null : <Badge variant="outline">{status}</Badge>}
                <span className="text-xs text-muted-foreground">{usageLabel(invite)}</span>
                {revoked ? null : (
                  <span className="text-xs text-muted-foreground">{expiryLabel(invite.expiresAt)}</span>
                )}
                <time className="ml-auto text-xs text-muted-foreground" dateTime={invite.issuedAt}>
                  {relativeTime(invite.issuedAt)}
                </time>
                {revoked ? null : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setEditing(editing === invite.id ? null : invite.id)}
                    >
                      {t('admin.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await admin.revokeInvite(invite.id);
                          if (editing === invite.id) setEditing(null);
                        })
                      }
                    >
                      {t('admin.revoke')}
                    </Button>
                  </>
                )}
              </div>

              {invite.redeemedBy.length === 0 ? null : (
                <p className="text-xs text-muted-foreground">
                  {t('admin.inviteUsedBy')}:{' '}
                  {invite.redeemedBy.map((user, index) => (
                    <Fragment key={user.publicId}>
                      {index === 0 ? null : ', '}
                      <span className="text-foreground">
                        {user.username ?? t('admin.inviteDeletedAccount')}
                      </span>{' '}
                      <time dateTime={user.joinedAt}>({relativeTime(user.joinedAt)})</time>
                    </Fragment>
                  ))}
                </p>
              )}

              {editing === invite.id && !revoked ? (
                <InviteEditor
                  invite={invite}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSave={(patch) =>
                    void run(async () => {
                      await admin.updateInvite(invite.id, patch);
                      setEditing(null);
                    })
                  }
                />
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

/**
 * Settings are stored as JSON, so the input is chosen from the type of the
 * value already there: a boolean gets true/false and nothing else, a number a
 * number field, and anything else the raw JSON. The type of a setting is fixed
 * by whoever created it, so a flag cannot be saved as the string "true".
 */
type SettingKind = 'boolean' | 'integer' | 'number' | 'json';

function settingKind(value: unknown): SettingKind {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return 'json';
}

function settingDraft(value: unknown): string {
  return settingKind(value) === 'json' ? JSON.stringify(value) : String(value);
}

function parseSetting(
  raw: string,
  kind: SettingKind,
): { ok: true; value: unknown } | { ok: false; error: MessageKey } {
  switch (kind) {
    case 'boolean':
      return raw === 'true' || raw === 'false'
        ? { ok: true, value: raw === 'true' }
        : { ok: false, error: 'admin.invalidJson' };
    case 'integer':
    case 'number': {
      const value = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(value)) return { ok: false, error: 'admin.invalidNumber' };
      if (kind === 'integer' && !Number.isInteger(value)) return { ok: false, error: 'admin.invalidInteger' };
      return { ok: true, value };
    }
    case 'json':
      try {
        return { ok: true, value: JSON.parse(raw) as unknown };
      } catch {
        return { ok: false, error: 'admin.invalidJson' };
      }
  }
}

function SettingInput({
  setting,
  value,
  disabled,
  onChange,
}: {
  setting: InstanceSetting;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const kind = settingKind(setting.value);

  if (kind === 'boolean') {
    return (
      <NativeSelect
        aria-label={setting.key}
        className="w-fit font-mono"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <NativeSelectOption value="true">true</NativeSelectOption>
        <NativeSelectOption value="false">false</NativeSelectOption>
      </NativeSelect>
    );
  }

  if (kind === 'integer' || kind === 'number') {
    return (
      <Input
        type="number"
        inputMode={kind === 'integer' ? 'numeric' : 'decimal'}
        step={kind === 'integer' ? 1 : 'any'}
        aria-label={setting.key}
        className="w-32 font-mono"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <Input
      aria-label={setting.key}
      className="font-mono"
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

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

  async function save(key: string, current: unknown) {
    setError(null);
    const raw = draft[key];
    let value: unknown = current;
    if (raw !== undefined) {
      const parsed = parseSetting(raw, settingKind(current));
      if (!parsed.ok) {
        setError(t(parsed.error));
        return;
      }
      value = parsed.value;
    }
    try {
      const response = await admin.patchSettings({ [key]: value });
      setItems(response.items);
      setDraft((drafts) => {
        const { [key]: _saved, ...rest } = drafts;
        return rest;
      });
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
                <SettingInput
                  setting={setting}
                  disabled={!writable}
                  value={draft[setting.key] ?? settingDraft(setting.value)}
                  onChange={(next) => setDraft((current) => ({ ...current, [setting.key]: next }))}
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
  const { tier, me } = useSession();
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
      {current === 'users' ? <Users viewer={tier} selfId={me?.publicId ?? null} /> : null}
      {current === 'categories' ? <Categories /> : null}
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
