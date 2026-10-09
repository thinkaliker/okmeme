import { Link as RouterLink } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { Sanction, SuspensionType } from '@/domain/user';
import { t } from '@/i18n/t';
import { absoluteTime } from '@/lib/utils';
import { useSession } from '@/session/SessionProvider';

const TYPE_TEXT: Readonly<Record<SuspensionType, string>> = {
  mute: t('sanction.type.mute'),
  submission_ban: t('sanction.type.submission_ban'),
  lockout: t('sanction.type.lockout'),
  content_hold: t('sanction.type.content_hold'),
};

const REASON_TEXT = {
  spam: t('sanction.reason.spam'),
  abuse: t('sanction.reason.abuse'),
  nsfw: t('sanction.reason.nsfw'),
  other: t('sanction.reason.other'),
} as const;

/**
 * A sanctioned user is told the type, the expiry, and a reason — plus whatever
 * note the admin wrote, rendered verbatim. The note is written by someone who
 * can see everything for someone who cannot, and this component adds nothing to
 * it: no actor, no tier, no reporter.
 */
export function SanctionBanner({ sanction }: { sanction: Sanction }) {
  return (
    <aside
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-4"
      aria-labelledby="sanction-title"
    >
      <h2 id="sanction-title" className="text-sm font-semibold">
        {t('sanction.title')}
      </h2>

      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {sanction.types.map((type) => (
          <li key={type}>{TYPE_TEXT[type]}</li>
        ))}
      </ul>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t('sanction.expires')}</dt>
        <dd>{sanction.expiresAt === null ? t('sanction.indefinite') : absoluteTime(sanction.expiresAt)}</dd>
        <dt className="text-muted-foreground">{t('sanction.reason')}</dt>
        <dd>{REASON_TEXT[sanction.reasonCategory]}</dd>
      </dl>

      {sanction.note === null ? null : (
        <p className="mt-3 border-l-2 border-destructive/40 pl-3 text-sm">{sanction.note}</p>
      )}

      <div className="mt-4">
        {sanction.appealFiled ? (
          <p className="text-xs text-muted-foreground">{t('sanction.appealFiled')}</p>
        ) : (
          <Button size="sm" variant="outline" asChild>
            <RouterLink to="/settings#appeal">{t('sanction.appeal')}</RouterLink>
          </Button>
        )}
      </div>
    </aside>
  );
}

/** Rendered by the shell so it is reachable from every route, not just settings. */
export function SanctionBannerSlot() {
  const { me } = useSession();
  if (me?.sanction == null) return null;
  return (
    <div className="mb-4">
      <SanctionBanner sanction={me.sanction} />
    </div>
  );
}
