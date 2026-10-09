import { useEffect, useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { auth } from '@/api/endpoints';
import { Button } from '@/components/ui/button';
import { FieldHint, Input, Label } from '@/components/ui/field';
import { USE_MOCK_API } from '@/config';
import type { TierOrdinal } from '@/domain/tier';
import { t } from '@/i18n/t';
import { useSession } from '@/session/SessionProvider';

/**
 * Local provider: username and password, no email anywhere in the flow. Recovery
 * is a one-time code issued at signup, and signup itself needs an invite — there
 * is no self-serve path onto an instance.
 */
export default function LoginRoute() {
  const { login, refresh } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError(t('auth.failed'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <h1 className="text-lg font-semibold">{t('auth.login')}</h1>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-username">{t('auth.username')}</Label>
          <Input
            id="login-username"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-password">{t('auth.password')}</Label>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <FieldHint>{t('auth.noEmail')}</FieldHint>
        </div>

        {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={pending}>
          {t('auth.login')}
        </Button>

        <p className="text-xs text-muted-foreground">
          {t('auth.inviteOnly')}{' '}
          <RouterLink to="/signup" className="underline underline-offset-4">
            {t('auth.needAccount')}
          </RouterLink>
        </p>
        <p className="text-xs text-muted-foreground">
          <RouterLink to="/recover" className="underline underline-offset-4">
            {t('auth.recover')}
          </RouterLink>
        </p>
      </form>

      {USE_MOCK_API ? <DevTierSwitcher onSwitched={() => void refresh().then(() => navigate('/'))} /> : null}
    </div>
  );
}

/**
 * Development only, and gone the moment a real API is configured.
 *
 * It exists because the ring model is invisible from a single seat: the same
 * rows have to be looked at from limited, from full, and from staff before you
 * can tell whether the client is honouring what the server sent.
 */
function DevTierSwitcher({ onSwitched }: { onSwitched: () => void }) {
  const [accounts, setAccounts] = useState<readonly { username: string; tier: TierOrdinal }[]>([]);
  const { logout } = useSession();

  useEffect(() => {
    auth
      .devAccounts()
      .then(setAccounts)
      .catch(() => undefined);
  }, []);

  return (
    <section className="rounded-lg border border-dashed border-border p-4">
      <h2 className="text-sm font-medium">{t('auth.devSwitcher')}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t('auth.devSwitcherHelp')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void logout().then(onSwitched)}
        >
          {t('auth.anonymous')}
        </Button>
        {accounts.map((account) => (
          <Button
            key={account.username}
            variant="outline"
            size="sm"
            onClick={() => void auth.login(account.username, '').then(onSwitched)}
          >
            {account.username}
            <span className="text-muted-foreground">{account.tier}</span>
          </Button>
        ))}
      </div>
    </section>
  );
}
