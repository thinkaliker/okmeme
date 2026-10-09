import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { auth } from '@/api/endpoints';
import { RecoveryCodes } from '@/components/RecoveryCodes';
import { Button } from '@/components/ui/button';
import { FieldHint, Input, Label } from '@/components/ui/field';
import { t } from '@/i18n/t';
import { useSession } from '@/session/SessionProvider';

/**
 * Invite-only, and the invite is the vouching — so there is nothing to verify
 * and no mail to send. What comes back instead is ten recovery codes, once.
 *
 * The screen refuses to navigate away until they have been acknowledged. On an
 * instance with no email, a user who closes this tab too fast has no way back
 * in except an admin.
 */
export default function SignupRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useSession();

  const [invite, setInvite] = useState(params.get('invite') ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [codes, setCodes] = useState<readonly string[] | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await auth.signup(username, password, invite);
      setCodes(result.recoveryCodes);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('auth.failed'));
    } finally {
      setPending(false);
    }
  }

  if (codes !== null) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-6">
        <RecoveryCodes
          codes={codes}
          onAcknowledge={() => void refresh().then(() => navigate('/'))}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <h1 className="text-lg font-semibold">{t('auth.signupTitle')}</h1>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-invite">{t('auth.inviteCode')}</Label>
          <Input
            id="signup-invite"
            required
            value={invite}
            onChange={(event) => setInvite(event.target.value)}
          />
          <FieldHint>{t('auth.inviteHint')}</FieldHint>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-username">{t('auth.username')}</Label>
          <Input
            id="signup-username"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-password">{t('auth.password')}</Label>
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <FieldHint>{t('auth.passwordHint')}</FieldHint>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-confirm">{t('auth.confirmPassword')}</Label>
          <Input
            id="signup-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>

        {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={pending}>
          {t('auth.signup')}
        </Button>

        <p className="text-xs text-muted-foreground">
          {t('auth.haveAccount')}{' '}
          <RouterLink to="/login" className="underline underline-offset-4">
            {t('auth.login')}
          </RouterLink>
        </p>
      </form>
    </div>
  );
}
