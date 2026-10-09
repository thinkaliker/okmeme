import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { setup, type SetupResult } from '@/api/endpoints';
import { RecoveryCodes } from '@/components/RecoveryCodes';
import { Button } from '@/components/ui/button';
import { FieldHint, Input, Label } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { t } from '@/i18n/t';

/**
 * The one-time bootstrap page, and the only option on a platform that gives you
 * no shell. `okmeme init` is the equivalent everywhere else.
 *
 * It creates **two** accounts. An owner cannot post and an admin is the only
 * tier that issues invites, so an instance with just an owner can never gain a
 * single user.
 *
 * The route 404s permanently once the instance is configured, and it answers a
 * missing token exactly the same way — so a leaked token on a live instance
 * tells whoever has it nothing at all.
 */
export default function SetupRoute() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get('token') ?? '');
  const [available, setAvailable] = useState<boolean | null>(null);

  const [ownerUsername, setOwnerUsername] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [thumbnails, setThumbnails] = useState(true);
  /** Whether a blob store was configured. Null until the token checks out. */
  const [blobStore, setBlobStore] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);

  useEffect(() => {
    if (token === '') {
      setAvailable(null);
      return;
    }
    setup
      .check(token)
      .then((response) => {
        setAvailable(response.available);
        setBlobStore(response.blobStore);
      })
      .catch(() => setAvailable(false));
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      setResult(
        await setup.create({
          token,
          ownerUsername,
          ownerPassword,
          adminUsername,
          adminPassword,
          thumbnails,
        }),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('app.error'));
    } finally {
      setPending(false);
    }
  }

  if (result !== null) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <h1 className="text-lg font-semibold">{t('setup.done')}</h1>
        <RecoveryCodes
          title={`${t('codes.title')} — ${result.owner.username}`}
          codes={result.owner.recoveryCodes}
        />
        <RecoveryCodes
          title={`${t('codes.title')} — ${result.admin.username}`}
          codes={result.admin.recoveryCodes}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">{t('setup.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('setup.body')}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="setup-token">{t('setup.token')}</Label>
        <Input
          id="setup-token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <FieldHint>{t('setup.tokenHint')}</FieldHint>
      </div>

      {available === false ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="font-medium">{t('setup.unavailable')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('setup.unavailableBody')}</p>
        </div>
      ) : available === null ? null : (
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="setup-owner-username">{t('setup.ownerUsername')}</Label>
            <Input
              id="setup-owner-username"
              required
              value={ownerUsername}
              onChange={(event) => setOwnerUsername(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="setup-owner-password">{t('setup.ownerPassword')}</Label>
            <Input
              id="setup-owner-password"
              type="password"
              required
              minLength={10}
              value={ownerPassword}
              onChange={(event) => setOwnerPassword(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="setup-admin-username">{t('setup.adminUsername')}</Label>
            <Input
              id="setup-admin-username"
              required
              value={adminUsername}
              onChange={(event) => setAdminUsername(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="setup-admin-password">{t('setup.adminPassword')}</Label>
            <Input
              id="setup-admin-password"
              type="password"
              required
              minLength={10}
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
            />
            <FieldHint>{t('auth.passwordHint')}</FieldHint>
          </div>

          {/* The one instance setting worth asking about here, because the
              answer depends on whether a blob store was configured — which is
              known now and nowhere else. Everything else waits for the admin
              panel, and so does changing this. */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <Switch
                id="setup-thumbnails"
                checked={thumbnails && blobStore !== false}
                disabled={blobStore === false}
                onCheckedChange={setThumbnails}
              />
              <Label htmlFor="setup-thumbnails">{t('setup.thumbnails')}</Label>
            </div>
            <FieldHint>
              {blobStore === false ? t('setup.thumbnailsNoStore') : t('setup.thumbnailsHint')}
            </FieldHint>
          </div>

          {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={pending}>
            {t('setup.create')}
          </Button>
        </form>
      )}
    </div>
  );
}
