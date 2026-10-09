import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { auth } from '@/api/endpoints';
import { Button } from '@/components/ui/button';
import { FieldHint, Input, Label, Textarea } from '@/components/ui/field';
import { t } from '@/i18n/t';
import { useSession } from '@/session/SessionProvider';

/**
 * Two paths, because there are two states to be in.
 *
 * With a code: spend one of the ten and set a new password. Without one: file a
 * request that lands in the admin queue for out-of-band verification. The
 * second form's response is identical whether or not the account exists, so
 * this screen renders the same confirmation either way and has nothing to
 * branch on — deliberately, since branching is what would make it an oracle.
 */
export default function RecoverRoute() {
  const navigate = useNavigate();
  const { refresh } = useSession();

  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [requestUsername, setRequestUsername] = useState('');
  const [note, setNote] = useState('');
  const [requestSent, setRequestSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await auth.recover(username, code, password);
      await refresh();
      navigate('/');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('auth.failed'));
    } finally {
      setPending(false);
    }
  }

  async function requestHelp(event: FormEvent) {
    event.preventDefault();
    try {
      await auth.recoveryRequest(requestUsername, note);
    } catch {
      // Even a failure gets the same confirmation. There is nothing here worth
      // telling apart.
    }
    setRequestSent(true);
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-8">
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <h1 className="text-lg font-semibold">{t('auth.recoverTitle')}</h1>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recover-username">{t('auth.username')}</Label>
          <Input
            id="recover-username"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recover-code">{t('auth.recoveryCode')}</Label>
          <Input
            id="recover-code"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <FieldHint>{t('auth.recoverHint')}</FieldHint>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recover-password">{t('auth.newPassword')}</Label>
          <Input
            id="recover-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={pending}>
          {t('auth.recover')}
        </Button>
      </form>

      <section
        aria-labelledby="no-codes-heading"
        className="flex flex-col gap-3 border-t border-border pt-6"
      >
        <h2 id="no-codes-heading" className="text-sm font-semibold">
          {t('auth.noCodesLeft')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('auth.requestRecoveryHint')}</p>

        {requestSent ? (
          <p className="text-sm">{t('auth.recoverySent')}</p>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={(event) => void requestHelp(event)}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="request-username">{t('auth.username')}</Label>
              <Input
                id="request-username"
                required
                value={requestUsername}
                onChange={(event) => setRequestUsername(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="request-note">{t('auth.recoveryNote')}</Label>
              <Textarea
                id="request-note"
                maxLength={2000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <div>
              <Button type="submit" size="sm" variant="outline">
                {t('auth.requestRecovery')}
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
