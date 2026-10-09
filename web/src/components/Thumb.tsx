import { useState } from 'react';
import { thumbUrl } from '@/api/media';
import { t } from '@/i18n/t';
import { cn } from '@/lib/utils';

interface ThumbProps {
  thumbKey: string | null;
  isNsfw: boolean;
  className?: string;
  /**
   * Gallery tiles are themselves links, so they cannot carry a nested reveal
   * button. There the blur stays on and revealing happens on the link's own
   * page, which keeps the deliberate second action without nesting one
   * interactive element inside another.
   */
  allowReveal?: boolean;
}

/**
 * Always okmeme's own origin, always at display size. NSFW thumbnails start
 * blurred and take a deliberate click — the row itself only reaches a viewer who
 * is allowed to see it at all, which is decided in SQL, not here.
 */
export function Thumb({ thumbKey, isNsfw, className, allowReveal = true }: ThumbProps) {
  const [revealed, setRevealed] = useState(!isNsfw);
  const src = thumbUrl(thumbKey);
  if (src === null) return null;

  return (
    <div className={cn('relative overflow-hidden rounded-md border border-border', className)}>
      <img
        src={src}
        alt=""
        width={160}
        height={90}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={cn('size-full object-cover', revealed ? '' : 'blur-lg')}
      />
      {revealed || !allowReveal ? null : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="absolute inset-0 flex items-center justify-center bg-background/40 text-xs font-medium"
        >
          {t('link.nsfwHidden')}
        </button>
      )}
    </div>
  );
}
