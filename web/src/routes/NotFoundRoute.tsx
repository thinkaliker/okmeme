import { t } from '@/i18n/t';

/**
 * The same page for "no such route", "removed", and "above your tier". A 404
 * that distinguishes between them is an oracle for the third case.
 */
export default function NotFoundRoute() {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <h1 className="font-medium">{t('app.notFound')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('app.notFoundBody')}</p>
    </div>
  );
}
