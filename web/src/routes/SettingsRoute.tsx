import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/api/client';
import { auth, me as meApi } from '@/api/endpoints';
import { RecoveryCodes } from '@/components/RecoveryCodes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldHint, Input, Label, Textarea } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { useDisplay } from '@/display/DisplayProvider';
import type { ApiTokenSummary } from '@/domain/admin';
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

/** A radio group, because these are exclusive choices and a native radio already
 *  knows how to be one: arrow keys, a single tab stop, a label per option. */
function Choice<T extends string>({ name, legend, hint, value, options, onChange }: ChoiceProps<T>) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(options) as T[]).map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-accent"
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="accent-primary"
            />
            {options[option]}
          </label>
        ))}
      </div>
      {hint === undefined ? null : <FieldHint>{hint}</FieldHint>}
    </fieldset>
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
        <div className="flex items-center gap-3">
          <Switch
            id="show-nsfw"
            checked={me.showNsfw}
            disabled={!can.seeNsfw(tier)}
            onCheckedChange={changeNsfw}
          />
          <Label htmlFor="show-nsfw">{t('settings.showNsfw')}</Label>
        </div>
        {can.seeNsfw(tier) ? null : <FieldHint>{t('settings.showNsfwUnavailable')}</FieldHint>}
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
          <FieldHint className="mt-1">{t('settings.regenerateHelp')}</FieldHint>
        </div>

        {/* Ten codes, shown once. On an instance with no email these are the
            only self-service way back into an account. */}
        {codes === null ? null : <RecoveryCodes codes={codes} onAcknowledge={() => setCodes(null)} />}
      </section>

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
              <FieldHint>{t('sanction.appealOnce')}</FieldHint>
              <div>
                <Button size="sm" disabled={appealBody.trim() === ''} onClick={() => void sendAppeal()}>
                  {t('sanction.appeal')}
                </Button>
              </div>
              {appealState === 'already' ? (
                <p className="text-sm text-destructive">{t('sanction.appealFiled')}</p>
              ) : null}
            </>
          )}
        </section>
      )}
    </div>
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
        <div className="flex flex-col gap-1">
          <Label htmlFor="current-password" className="text-xs">
            {t('auth.currentPassword')}
          </Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="next-password" className="text-xs">
            {t('auth.newPassword')}
          </Label>
          <Input
            id="next-password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </div>
        <Button
          size="sm"
          disabled={current === '' || next.length < 10}
          onClick={() => void submit()}
        >
          {t('auth.changePassword')}
        </Button>
      </div>

      {/* Changing a password revokes every other session and every token. */}
      {state === 'done' ? <FieldHint>{t('auth.passwordChanged')}</FieldHint> : null}
      {state === 'failed' ? <p className="text-sm text-destructive">{t('auth.failed')}</p> : null}
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
      <FieldHint>{t('settings.tokensHint')}</FieldHint>

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
        <div className="flex flex-col gap-1">
          <Label htmlFor="token-name" className="text-xs">
            {t('settings.tokenName')}
          </Label>
          <Input id="token-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
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
      <FieldHint>{t('settings.deleteHint')}</FieldHint>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="delete-confirm" className="text-xs">
            {t('settings.deleteConfirm')}
          </Label>
          <Input
            id="delete-confirm"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
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
