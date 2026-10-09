import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n/t';

/**
 * Ten codes, displayed once, never recoverable afterwards.
 *
 * They replace email entirely on this instance: there is no verification mail
 * and no reset link, so this component is the only moment these strings exist
 * anywhere a person can read them. It is deliberately hard to dismiss by
 * accident — no auto-close, no navigation until the button is pressed.
 */
export function RecoveryCodes({
  codes,
  onAcknowledge,
  title,
}: {
  codes: readonly string[];
  onAcknowledge?: () => void;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      // Clipboard access can be refused. The codes are on screen either way,
      // which is the part that matters.
      setCopied(false);
    }
  }

  return (
    <section
      aria-labelledby="recovery-codes-heading"
      className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-accent/40 p-4"
    >
      <h2 id="recovery-codes-heading" className="text-sm font-semibold">
        {title ?? t('codes.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('codes.body')}</p>

      <ul className="grid grid-cols-2 gap-1 font-mono text-sm sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code} className="rounded bg-background px-2 py-1 select-all">
            {code}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? t('codes.copied') : t('codes.copy')}
        </Button>
        {onAcknowledge === undefined ? null : (
          <Button size="sm" onClick={onAcknowledge}>
            {t('codes.acknowledge')}
          </Button>
        )}
      </div>
    </section>
  );
}
