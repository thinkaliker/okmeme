import { Link as RouterLink } from 'react-router-dom';
import { AuthorLabel } from '@/components/AuthorLabel';
import { LinkEditDialog } from '@/components/LinkEditDialog';
import { Thumb } from '@/components/Thumb';
import { Badge } from '@/components/ui/badge';
import type { Link } from '@/domain/link';
import { t } from '@/i18n/t';
import { tintEdge } from '@/lib/tint';
import { formatScore } from '@/lib/utils';

/**
 * One cell of the gallery: a thumbnail and as little else as possible.
 *
 * The whole tile is a single link to the post, which is the one case where a
 * clickable surface is honest — there is nothing else inside it to click. The
 * title is always in the accessible name and is shown on hover and on focus, so
 * a keyboard user gets the same caption a mouse user does.
 *
 * NSFW tiles stay blurred here. Revealing is a deliberate act and it belongs on
 * the post's own page; a reveal button inside this link would be an interactive
 * element nested in another one.
 */
export function GalleryTile({ link, onChange }: { link: Link; onChange?: (next: Link) => void }) {
  const thumbKey = link.kind === 'text' ? null : link.thumbKey;

  // The cog sits beside the link, not inside it: an interactive element nested
  // in another one is the thing this tile is built to avoid.
  return (
    <div className="relative">
      <Tile link={link} thumbKey={thumbKey} />
      {/* Renders nothing unless the server says this viewer may act on it. */}
      <LinkEditDialog
        link={link}
        onChange={onChange}
        className="absolute right-1 top-1.5 size-7 bg-background/80 text-foreground hover:bg-background"
      />
    </div>
  );
}

function Tile({ link, thumbKey }: { link: Link; thumbKey: string | null }) {
  return (
    <RouterLink
      to={`/l/${link.publicId}`}
      style={tintEdge(link.category.slug, 'top')}
      /* Same category tint as the row layout, on the top edge instead of the
         left one — so a colour means the same thing in both views. */
      className="group relative block aspect-square overflow-hidden rounded-md border border-border border-t-[3px] bg-muted"
    >
      {thumbKey === null ? (
        <span className="flex size-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
          {link.kind === 'text' ? t('link.textPost') : t('feed.galleryNoThumb')}
        </span>
      ) : (
        <Thumb
          thumbKey={thumbKey}
          isNsfw={link.isNsfw}
          allowReveal={false}
          className="size-full rounded-none border-0"
        />
      )}

      {link.isNsfw ? (
        <Badge variant="nsfw" className="absolute left-1.5 top-1.5">
          {t('link.nsfw')}
        </Badge>
      ) : null}

      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="line-clamp-2 text-xs font-medium text-white">{link.title}</span>
        <span className="flex items-center gap-1.5 text-[10px] text-white/80">
          <span className="tabular-nums">{formatScore(link.score)}</span>
          <AuthorLabel author={link.author} />
        </span>
      </span>
    </RouterLink>
  );
}
