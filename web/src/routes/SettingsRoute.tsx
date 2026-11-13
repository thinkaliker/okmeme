import { useCallback, useEffect, useState } from 'react';
import { Check, Lock, Minus } from 'lucide-react';
import { ApiError } from '@/api/client';
import { admin, auth, me as meApi } from '@/api/endpoints';
import { RecoveryCodes } from '@/components/RecoveryCodes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useDisplay } from '@/display/DisplayProvider';
import type { ApiTokenSummary } from '@/domain/admin';
import type { Capability, PermissionMatrix } from '@/domain/permissions';
import { can, isAuthorTierLabel } from '@/domain/tier';
import type { Density, FeedView, ThemePreference, Width } from '@/domain/user';
import { t, tierLabel } from '@/i18n/t';
import { absoluteTime, relativeTime } from '@/lib/utils';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';

const THEME_LABEL: Readonly<Record<ThemePreference, string>> = {
  system: t('settings.themeSystem'),
  light: t('settings.themeLight'),
  dark: t('settings.themeDark'),
};

const DENSITY_LABEL: Readonly<Record<Density, string>> = {
  comfortable: t('settings.densityComfortable'),
  compact: t('settings.densityCompact'),
};

const WIDTH_LABEL: Readonly<Record<Width, string>> = {
  normal: t('settings.widthNormal'),
  wide: t('settings.widthWide'),
};

const VIEW_LABEL: Readonly<Record<FeedView, string>> = {
  list: t('feed.viewList'),
  gallery: t('feed.viewGallery'),
};

const TIER_NAMES = ['anonymous', 'limited', 'full', 'staff', 'admin', 'owner'] as const;

interface ChoiceProps<T extends string> {
  name: string;
  legend: string;
  hint?: string;
  value: T;
  options: Readonly<Record<T, string>>;
  onChange: (value: T) => void;
}

/** A radio group, because these are exclusive choices and a radio group already
 *  knows how to be one: arrow keys, a single tab stop, a label per option. */
function Choice<T extends string>({ name, legend, hint, value, options, onChange }: ChoiceProps<T>) {
  return (
    <FieldSet>
      <FieldLegend variant="label" className="font-normal">
        {legend}
      </FieldLegend>
      <RadioGroup
        name={name}
        value={value}
        onValueChange={(next) => onChange(next as T)}
        className="flex flex-wrap gap-2"
      >
        {(Object.keys(options) as T[]).map((option) => (
          <FieldLabel key={option} className="cursor-pointer items-center rounded-md border border-border px-3 py-1.5 text-sm leading-5 font-normal">
            <RadioGroupItem value={option} />
            {options[option]}
          </FieldLabel>
        ))}
      </RadioGroup>
      {hint === undefined ? null : <FieldDescription>{hint}</FieldDescription>}
    </FieldSet>
  );
}

export default function SettingsRoute() {
  const { me, tier, update, refresh } = useSession();
  const { preference, setPreference } = useTheme();
  const { set: setDisplay, ...display } = useDisplay();
  const [appealBody, setAppealBody] = useState('');
  const [appealState, setAppealState] = useState<'idle' | 'sent' | 'already'>('idle');
  const [codes, setCodes] = useState<readonly string[] | null>(null);

  if (me === null) {
    return <p className="text-sm text-muted-foreground">{t('app.notFoundBody')}</p>;
  }

  function changeTheme(next: ThemePreference) {
    setPreference(next);
    meApi.patch({ theme: next }).then(update).catch(() => undefined);
  }

  function changeDisplay(patch: Partial<typeof display>) {
    setDisplay(patch);
    meApi.patch({ display: patch }).then(update).catch(() => undefined);
  }

  function changeNsfw(next: boolean) {
    meApi.patch({ showNsfw: next }).then(update).catch(() => undefined);
  }

  async function regenerate() {
    // Invalidates all ten prior codes, used or not, before the new set exists
    // anywhere but on this screen.
    const result = await meApi.regenerateRecoveryCodes();
    setCodes(result.recoveryCodes);
  }

  async function sendAppeal() {
    try {
      await meApi.appeal(appealBody);
      setAppealState('sent');
      await refresh();
    } catch (cause) {
      setAppealState(cause instanceof ApiError && cause.status === 409 ? 'already' : 'idle');
    }
  }

  const tierName = TIER_NAMES[me.tier];

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <h1 className="text-lg font-semibold">{t('settings.title')}</h1>

      <section aria-labelledby="appearance-heading" className="flex flex-col gap-3">
        <h2 id="appearance-heading" className="text-sm font-semibold">
          {t('settings.appearance')}
        </h2>

        {/* System is the default; an explicit choice is stored on the account
            so it follows the user rather than the browser. The same is true of
            the three below: they are preferences, not view state. */}
        <Choice
          name="theme"
          legend={t('settings.theme')}
          value={preference}
          options={THEME_LABEL}
          onChange={changeTheme}
        />

        <Choice
          name="density"
          legend={t('settings.density')}
          hint={t('settings.densityHelp')}
          value={display.density}
          options={DENSITY_LABEL}
          onChange={(density) => changeDisplay({ density })}
        />

        <Choice
          name="width"
          legend={t('settings.width')}
          hint={t('settings.widthHelp')}
          value={display.width}
          options={WIDTH_LABEL}
          onChange={(width) => changeDisplay({ width })}
        />

        <Choice
          name="feedView"
          legend={t('settings.feedView')}
          hint={t('settings.feedViewHelp')}
          value={display.feedView}
          options={VIEW_LABEL}
          onChange={(feedView) => changeDisplay({ feedView })}
        />
      </section>

      <section aria-labelledby="content-heading" className="flex flex-col gap-3">
        <h2 id="content-heading" className="text-sm font-semibold">
          {t('settings.content')}
        </h2>
        <Field orientation="horizontal" className="gap-3">
          <Switch
            id="show-nsfw"
            checked={me.showNsfw}
            disabled={!can.seeNsfw(tier)}
            onCheckedChange={changeNsfw}
          />
          <FieldLabel htmlFor="show-nsfw">{t('settings.showNsfw')}</FieldLabel>
        </Field>
        {can.seeNsfw(tier) ? null : <FieldDescription>{t('settings.showNsfwUnavailable')}</FieldDescription>}
      </section>

      <section aria-labelledby="account-heading" className="flex flex-col gap-3">
        <h2 id="account-heading" className="text-sm font-semibold">
          {t('settings.account')}
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t('auth.username')}</dt>
          <dd>{me.username}</dd>
          <dt className="text-muted-foreground">{t('settings.tier')}</dt>
          <dd>
            {tierName !== undefined && isAuthorTierLabel(tierName) ? (
              <Badge variant="tier">{tierLabel(tierName)}</Badge>
            ) : null}
          </dd>
          <dt className="text-muted-foreground">{t('settings.memberSince')}</dt>
          <dd>{absoluteTime(me.createdAt)}</dd>
        </dl>
        <div>
          <Button variant="outline" size="sm" onClick={() => void regenerate()}>
            {t('settings.regenerate')}
          </Button>
          <FieldDescription className="mt-1">{t('settings.regenerateHelp')}</FieldDescription>
        </div>

        {/* Ten codes, shown once. On an instance with no email these are the
            only self-service way back into an account. */}
        {codes === null ? null : <RecoveryCodes codes={codes} onAcknowledge={() => setCodes(null)} />}
      </section>

      <PermissionsSection />

      <SecuritySection />

      <TokensSection />

      <DangerZone username={me.username} />

      {me.sanction === null ? null : (
        <section id="appeal" aria-labelledby="appeal-heading" className="flex flex-col gap-3">
          <h2 id="appeal-heading" className="text-sm font-semibold">
            {t('sanction.appeal')}
          </h2>

          {/* One appeal per sanction, and the form closes afterwards regardless
              of outcome. One shot is what stops an appeal channel from being a
              mute with extra steps. */}
          {me.sanction.appealFiled || appealState === 'sent' ? (
            <p className="text-sm text-muted-foreground">
              {appealState === 'sent' ? t('sanction.appealSent') : t('sanction.appealFiled')}
            </p>
          ) : (
            <>
              <Textarea
                aria-label={t('sanction.appeal')}
                value={appealBody}
                maxLength={2000}
                onChange={(event) => setAppealBody(event.target.value)}
              />
              <FieldDescription>{t('sanction.appealOnce')}</FieldDescription>
              <div>
                <Button size="sm" disabled={appealBody.trim() === ''} onClick={() => void sendAppeal()}>
                  {t('sanction.appeal')}
                </Button>
              </div>
              {appealState === 'already' ? (
                <FieldError>{t('sanction.appealFiled')}</FieldError>
              ) : null}
            </>
          )}
        </section>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- permissions */

const PERMISSION_LABEL: Readonly<Record<Capability, string>> = {
  submit: t('permission.submit'),
  vote: t('permission.vote'),
  bookmark: t('permission.bookmark'),
  editOwn: t('permission.editOwn'),
  postBelow: t('permission.postBelow'),
  postNsfw: t('permission.postNsfw'),
  createTags: t('permission.createTags'),
  moderate: t('permission.moderate'),
  seeNsfw: t('permission.seeNsfw'),
  reviewTags: t('permission.reviewTags'),
  retier: t('permission.retier'),
  issueInvites: t('permission.issueInvites'),
  reviewReports: t('permission.reviewReports'),
  manageCategories: t('permission.manageCategories'),
  readAuditLog: t('permission.readAuditLog'),
  ownerSettings: t('permission.ownerSettings'),
};

/**
 * What each tier may do, as a table. The server decides the shape: columns stop
 * at the viewer's own tier, rows appear only when they apply to someone the
 * viewer can see, and a cell is a checkbox only where this viewer may change it
 * — below their own tier, and for an admin, a permission they hold themselves.
 */
function PermissionsSection() {
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    meApi
      .permissions({ signal: controller.signal })
      .then(setMatrix)
      .catch(() => setMatrix(null));
    return () => controller.abort();
  }, []);

  if (matrix === null || matrix.rows.length === 0) return null;

  const editor = matrix.rows.some((row) => row.cells.some((cell) => cell.editable));

  async function toggle(tier: number, capability: Capability, granted: boolean) {
    setSaving(true);
    setFailed(false);
    try {
      setMatrix(await admin.setPermission(tier, capability, granted));
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="permissions-heading" className="flex flex-col gap-3">
      <h2 id="permissions-heading" className="text-sm font-semibold">
        {t('permission.title')}
      </h2>
      <FieldDescription>{t('permission.intro')}</FieldDescription>
      {editor ? <FieldDescription>{t('permission.editHint')}</FieldDescription> : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {/* Pinned, so a phone scrolling an owner's five columns keeps
                  the names in view. */}
              <th scope="col" className="sticky left-0 bg-background px-3 py-2 text-left font-medium">
                {t('permission.name')}
              </th>
              {matrix.tiers.map((column) => (
                <th
                  key={column.tier}
                  scope="col"
                  id={`perm-col-${column.tier}`}
                  className="px-2 py-2 text-center font-medium"
                >
                  {/* A fixed server-chosen key, rendered through the one table
                      that turns tier labels into words. */}
                  <Badge variant="tier">{tierLabel(column.label)}</Badge>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.capability} className="border-b border-border last:border-0">
                <th
                  scope="row"
                  id={`perm-row-${row.capability}`}
                  className="sticky left-0 bg-background px-3 py-2 text-left font-normal"
                >
                  <span className="flex items-center gap-1.5">
                    {PERMISSION_LABEL[row.capability]}
                    {row.locked ? (
                      <span title={t('permission.locked')} className="text-muted-foreground">
                        <Lock aria-hidden="true" className="size-3.5" />
                        <span className="sr-only">{t('permission.locked')}</span>
                      </span>
                    ) : null}
                  </span>
                </th>
                {row.cells.map((cell) => (
                  <td key={cell.tier} className="px-2 py-2 text-center">
                    {cell.editable ? (
                      <Checkbox
                        checked={cell.granted}
                        disabled={saving}
                        aria-labelledby={`perm-row-${row.capability} perm-col-${cell.tier}`}
                        onCheckedChange={(next) => void toggle(cell.tier, row.capability, next === true)}
                        className="cursor-pointer align-middle"
                      />
                    ) : (
                      <span title={cell.granted ? t('permission.granted') : t('permission.denied')}>
                        {cell.granted ? (
                          <Check aria-hidden="true" className="mx-auto size-4 text-primary" />
                        ) : (
                          <Minus aria-hidden="true" className="mx-auto size-4 text-muted-foreground/50" />
                        )}
                        <span className="sr-only">
                          {cell.granted ? t('permission.granted') : t('permission.denied')}
                        </span>
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {failed ? <FieldError>{t('permission.failed')}</FieldError> : null}
    </section>
  );
}

/* ---------------------------------------------------------------- security */

function SecuritySection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');

  async function submit() {
    try {
      await auth.changePassword(current, next);
      setCurrent('');
      setNext('');
      setState('done');
    } catch {
      setState('failed');
    }
  }

  return (
    <section aria-labelledby="security-heading" className="flex flex-col gap-3">
      <h2 id="security-heading" className="text-sm font-semibold">
        {t('settings.security')}
      </h2>

      <div className="flex flex-wrap items-end gap-2">
        <Field className="gap-1">
          <FieldLabel htmlFor="current-password" className="text-xs">
            {t('auth.currentPassword')}
          </FieldLabel>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </Field>
        <Field className="gap-1">
          <FieldLabel htmlFor="next-password" className="text-xs">
            {t('auth.newPassword')}
          </FieldLabel>
          <Input
            id="next-password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </Field>
        <Button
          size="sm"
          disabled={current === '' || next.length < 10}
          onClick={() => void submit()}
        >
          {t('auth.changePassword')}
        </Button>
      </div>

      {/* Changing a password revokes every other session and every token. */}
      {state === 'done' ? <FieldDescription>{t('auth.passwordChanged')}</FieldDescription> : null}
      {state === 'failed' ? <FieldError>{t('auth.failed')}</FieldError> : null}
    </section>
  );
}

/* ---------------------------------------------------------------- tokens */

function TokensSection() {
  const [tokens, setTokens] = useState<readonly ApiTokenSummary[]>([]);
  const [name, setName] = useState('');
  const [issued, setIssued] = useState<string | null>(null);

  const load = useCallback(() => {
    meApi
      .tokens()
      .then((page) => setTokens(page.items))
      .catch(() => setTokens([]));
  }, []);

  useEffect(load, [load]);

  async function create() {
    const token = await meApi.createToken(name);
    setIssued(token.token);
    setName('');
    load();
  }

  return (
    <section aria-labelledby="tokens-heading" className="flex flex-col gap-3">
      <h2 id="tokens-heading" className="text-sm font-semibold">
        {t('settings.tokens')}
      </h2>
      {/* A token carries exactly its issuer's tier. There is no narrower scope,
          because a token with fewer rights than its owner is a promise the ring
          model cannot keep. */}
      <FieldDescription>{t('settings.tokensHint')}</FieldDescription>

      {issued === null ? null : (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-accent/40 p-3">
          <p className="text-sm">{t('settings.tokenOnce')}</p>
          <code className="select-all rounded bg-background px-2 py-1 font-mono text-xs break-all">
            {issued}
          </code>
          <div>
            <Button size="sm" variant="outline" onClick={() => setIssued(null)}>
              {t('app.close')}
            </Button>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {tokens.map((token) => (
          <li
            key={token.publicId}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm"
          >
            <span className="font-medium">{token.name}</span>
            <span className="text-xs text-muted-foreground">
              {token.lastUsedAt === null
                ? t('settings.tokenNever')
                : `${t('settings.tokenLastUsed')} ${relativeTime(token.lastUsedAt)}`}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => void meApi.revokeToken(token.publicId).then(load)}
            >
              {t('settings.revoke')}
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-end gap-2">
        <Field className="gap-1">
          <FieldLabel htmlFor="token-name" className="text-xs">
            {t('settings.tokenName')}
          </FieldLabel>
          <Input id="token-name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Button size="sm" disabled={name.trim() === ''} onClick={() => void create()}>
          {t('settings.newToken')}
        </Button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- deletion */

function DangerZone({ username }: { username: string }) {
  const { logout } = useSession();
  const [typed, setTyped] = useState('');

  async function remove() {
    await meApi.deleteAccount();
    await logout();
    window.location.assign('/');
  }

  return (
    <section aria-labelledby="danger-heading" className="flex flex-col gap-3">
      <h2 id="danger-heading" className="text-sm font-semibold text-destructive">
        {t('settings.dangerZone')}
      </h2>
      {/* A tombstone, not a delete: the posts stay, pinned at their current
          tier, so the visibility join still has something to resolve against. */}
      <FieldDescription>{t('settings.deleteHint')}</FieldDescription>
      <div className="flex flex-wrap items-end gap-2">
        <Field className="gap-1">
          <FieldLabel htmlFor="delete-confirm" className="text-xs">
            {t('settings.deleteConfirm')}
          </FieldLabel>
          <Input
            id="delete-confirm"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </Field>
        <Button
          size="sm"
          variant="destructive"
          disabled={typed !== username}
          onClick={() => void remove()}
        >
          {t('settings.delete')}
        </Button>
      </div>
    </section>
  );
}
