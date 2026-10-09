import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { links as linksApi } from '@/api/endpoints';
import { LinkCard } from '@/components/LinkCard';
import { FeedSkeleton } from '@/components/ui/skeleton';
import type { Link } from '@/domain/link';
import { t } from '@/i18n/t';

export default function LinkRoute() {
  const { publicId } = useParams();
  const [link, setLink] = useState<Link | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (publicId === undefined) return;
    const controller = new AbortController();
    setLink(null);
    setMissing(false);
    linksApi
      .get(publicId, { signal: controller.signal })
      .then(setLink)
      // Outside the ring there is no difference between hidden and absent, and
      // this screen must not invent one.
      .catch(() => setMissing(true));
    return () => controller.abort();
  }, [publicId]);

  if (missing) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <p className="font-medium">{t('app.notFound')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('app.notFoundBody')}</p>
      </div>
    );
  }

  if (link === null) return <FeedSkeleton />;

  return (
    <div className="flex flex-col gap-4">
      <LinkCard link={link} headingLevel={1} expanded onChange={setLink} />

      <section aria-labelledby="comments-heading" className="rounded-lg border border-dashed border-border p-6">
        <h2 id="comments-heading" className="text-sm font-medium">
          {t('link.comments')}
        </h2>
        {/* Provisioned, not built: the schema and the invisible-parent rule are
            settled, there is no API and no UI. See GAPS.md. */}
        <p className="mt-1 text-sm text-muted-foreground">{t('link.commentsUnavailable')}</p>
      </section>
    </div>
  );
}
