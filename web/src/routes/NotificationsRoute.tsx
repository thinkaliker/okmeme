import { useCallback, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { me as meApi } from '@/api/endpoints';
import { Button } from '@/components/ui/button';
import { FeedSkeleton } from '@/components/ui/skeleton';
import type { Notification, NotificationKind } from '@/domain/notification';
import { useCursorList } from '@/hooks/useCursorList';
import { t, tOptional } from '@/i18n/t';
import { absoluteTime, relativeTime } from '@/lib/utils';
import { useSession } from '@/session/SessionProvider';

const KIND_TEXT: Readonly<Record<NotificationKind, string>> = {
  sanction: t('notifications.kind.sanction'),
  content_removed: t('notifications.kind.content_removed'),
  content_retiered: t('notifications.kind.content_retiered'),
  tier_changed: t('notifications.kind.tier_changed'),
  appeal_resolved: t('notifications.kind.appeal_resolved'),
  recovery_approved: t('notifications.kind.recovery_approved'),
};

/**
 * The inbox is the whole notification system: no email exists, so anything the
 * instance has to tell a user lands here. Nothing is ever pruned, which makes
 * this a permanent account history — on a site where moderation is otherwise
 * opaque, being able to scroll back through everything is the point.
 */
export default function NotificationsRoute() {
  const { me, refresh } = useSession();
  const [marking, setMarking] = useState(false);

  const fetchPage = useCallback(
    (cursor: string | null, signal: AbortSignal) => meApi.notifications(cursor, { signal }),
    [],
  );

  const { items, loading, hasMore, loadMore, reload } = useCursorList<Notification>(fetchPage, []);

  if (me === null) {
    return <p className="text-sm text-muted-foreground">{t('app.notFoundBody')}</p>;
  }

  async function markAll() {
    setMarking(true);
    try {
      await meApi.markNotificationsRead();
      await refresh();
      reload();
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t('notifications.title')}</h1>
        <Button variant="outline" size="sm" disabled={marking} onClick={() => void markAll()}>
          {t('notifications.markAllRead')}
        </Button>
      </div>

      {loading ? (
        <FeedSkeleton />
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="font-medium">{t('notifications.empty')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('notifications.emptyBody')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((notification) => (
            <li
              key={notification.id}
              className={`rounded-lg border border-border p-3 ${
                notification.readAt === null ? 'bg-accent/40' : ''
              }`}
            >
              <p className="text-sm">{KIND_TEXT[notification.kind]}</p>

              {notification.detailKey === null ? null : (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('link.removedReason')}: {tOptional(notification.detailKey, '')}
                </p>
              )}

              {/* Same rules as everywhere else: a removal notice says
                  "moderator" here exactly as it does on the post. */}
              {notification.note === null ? null : (
                <p className="mt-2 border-l-2 border-border pl-3 text-sm">{notification.note}</p>
              )}

              {notification.subject === null ? null : (
                <RouterLink
                  to={`/l/${notification.subject.publicId}`}
                  className="mt-2 inline-block text-sm underline"
                >
                  {notification.subject.title}
                </RouterLink>
              )}

              <p className="mt-2 text-xs text-muted-foreground">
                <time dateTime={notification.createdAt} title={absoluteTime(notification.createdAt)}>
                  {relativeTime(notification.createdAt)}
                </time>
              </p>
            </li>
          ))}
        </ul>
      )}

      {hasMore ? (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={loadMore}>
            {t('feed.loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
