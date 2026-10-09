import { useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { me as meApi } from '@/api/endpoints';
import { Button } from '@/components/ui/button';
import { NOTIFICATION_POLL_MS } from '@/config';
import { t } from '@/i18n/t';
import { useSession } from '@/session/SessionProvider';

/**
 * An unread count, not a banner. With no email provider this inbox is the only
 * channel that reaches a user at all, so it is a permanent fixture of the shell
 * rather than a transient toast.
 *
 * The count is polled, slowly. There is no realtime channel by design, and
 * polling hard is the one thing that turns a tier change into an observable
 * event (GAPS.md) — so this asks once a minute and never on a tight loop.
 */
export function NotificationBell() {
  const { me, update } = useSession();

  useEffect(() => {
    if (me === null) return;
    const timer = window.setInterval(() => {
      meApi.get().then(update).catch(() => undefined);
    }, NOTIFICATION_POLL_MS);
    return () => window.clearInterval(timer);
  }, [me, update]);

  if (me === null) return null;

  const unread = me.unreadNotifications;

  return (
    <Button variant="ghost" size="icon" asChild className="relative">
      <RouterLink
        to="/notifications"
        aria-label={
          unread > 0
            ? `${t('nav.notifications')} — ${unread} ${t('notifications.unread')}`
            : t('nav.notifications')
        }
      >
        <Bell />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground tabular-nums"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </RouterLink>
    </Button>
  );
}
