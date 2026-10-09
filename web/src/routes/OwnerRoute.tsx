import { useEffect, useState } from 'react';
import { ApiError } from '@/api/client';
import { owner } from '@/api/endpoints';
import { Button } from '@/components/ui/button';
import { FieldHint, Input, Label, Select } from '@/components/ui/field';
import type { InstanceSetting, Owner } from '@/domain/admin';
import { TIER, can } from '@/domain/tier';
import { t } from '@/i18n/t';
import { absoluteTime } from '@/lib/utils';
import { useSession } from '@/session/SessionProvider';

/**
 * Owner: recovery and system settings only. It cannot post, comment, or vote.
 *
 * Two things live here rather than in the admin panel. The owner **set**, which
 * any owner may add to or remove from except for the last remaining one; and
 * `invite_min_tier`, which is not an ordinary setting.
 */
export default function OwnerRoute() {
  const { tier } = useSession();
  const [owners, setOwners] = useState<readonly Owner[] | null>(null);
  const [settings, setSettings] = useState<readonly InstanceSetting[]>([]);
  const [publicId, setPublicId] = useState('');
  const [minTier, setMinTier] = useState<number>(TIER.admin);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!can.ownerSettings(tier)) return;
    owner
      .owners()
      .then((page) => setOwners(page.items))
      .catch(() => setOwners([]));
    owner
      .patchSettings({})
      .then((response) => {
        setSettings(response.items);
        const found = response.items.find((item) => item.key === 'invite_min_tier');
        if (found !== undefined) setMinTier(Number(found.value));
      })
      .catch(() => undefined);
  }, [tier]);

  if (!can.ownerSettings(tier)) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <p className="font-medium">{t('app.notFound')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('app.notFoundBody')}</p>
      </div>
    );
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      setOwners((await owner.owners()).items);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('app.error'));
    }
  }

  async function saveMinTier() {
    setError(null);
    try {
      const response = await owner.patchSettings({
        invite_min_tier: minTier,
        // Below admin this is a change to the security model, and the server
        // refuses it without the flag. The checkbox is not politeness.
        ...(minTier < TIER.admin ? { confirm } : {}),
      });
      setSettings(response.items);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('app.error'));
    }
  }

  const dangerous = minTier < TIER.admin;

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <h1 className="text-lg font-semibold">{t('owner.title')}</h1>

      {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

      <section aria-labelledby="owners-heading" className="flex flex-col gap-3">
        <h2 id="owners-heading" className="text-sm font-semibold">
          {t('owner.owners')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('owner.ownersHint')}</p>

        <ul className="flex flex-col gap-2">
          {(owners ?? []).map((entry) => (
            <li
              key={entry.publicId}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm"
            >
              <span className="font-medium">{entry.username ?? '—'}</span>
              <code className="font-mono text-xs text-muted-foreground">{entry.publicId}</code>
              <time className="ml-auto text-xs text-muted-foreground" dateTime={entry.createdAt}>
                {absoluteTime(entry.createdAt)}
              </time>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void run(() => owner.remove(entry.publicId))}
              >
                {t('owner.remove')}
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <Label htmlFor="owner-add" className="text-xs">
              {t('owner.add')}
            </Label>
            <Input
              id="owner-add"
              value={publicId}
              placeholder="u_…"
              onChange={(event) => setPublicId(event.target.value)}
            />
            <FieldHint>{t('owner.addHint')}</FieldHint>
          </div>
          <Button size="sm" onClick={() => void run(() => owner.add(publicId))}>
            {t('owner.add')}
          </Button>
        </div>
      </section>

      <section aria-labelledby="owner-settings-heading" className="flex flex-col gap-3">
        <h2 id="owner-settings-heading" className="text-sm font-semibold">
          {t('owner.settings')}
        </h2>

        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-min-tier">{t('owner.inviteMinTier')}</Label>
          <Select
            id="invite-min-tier"
            value={String(minTier)}
            onChange={(event) => setMinTier(Number(event.target.value))}
            className="max-w-40"
          >
            {[TIER.full, TIER.staff, TIER.admin, TIER.owner].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>

          {/* Stated plainly, because the interface is the only place it can be:
              the change is audited, and raising the value back does not unbuild
              the graph it created while it was low. */}
          {dangerous ? (
            <div className="flex flex-col gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3">
              <p className="text-sm">{t('owner.inviteMinTierWarning')}</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={confirm}
                  onChange={(event) => setConfirm(event.target.checked)}
                />
                {t('owner.confirm')}
              </label>
            </div>
          ) : null}

          <div>
            <Button size="sm" disabled={dangerous && !confirm} onClick={() => void saveMinTier()}>
              {t('admin.save')}
            </Button>
          </div>
        </div>

        {settings.length === 0 ? null : (
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {settings.map((setting) => (
              <li key={setting.key} className="flex gap-2">
                <code className="font-mono">{setting.key}</code>
                <code className="font-mono">{JSON.stringify(setting.value)}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
