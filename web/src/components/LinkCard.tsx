import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  FileText,
  Image,
  MessageSquare,
  Music,
  Video,
} from 'lucide-react';
import { links as linksApi } from '@/api/endpoints';
import { faviconUrl } from '@/api/media';
import { AuthorLabel } from '@/components/AuthorLabel';
import { Expando, useDisclosure } from '@/components/Expando';
import { ReportDialog } from '@/components/ReportDialog';
import { Thumb } from '@/components/Thumb';
import { VoteControl } from '@/components/VoteControl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Link, MediaType } from '@/domain/link';
import { can } from '@/domain/tier';
import { t, tOptional } from '@/i18n/t';
import { hostInitial, tintChip, tintEdge } from '@/lib/tint';
import { absoluteTime, cn, relativeTime } from '@/lib/utils';
import { useSession } from '@/session/SessionProvider';

interface LinkCardProps {
  link: Link;
  onChange?: (next: Link) => void;
  /** The detail route renders the title as the page heading. */
  headingLevel?: 1 | 2;
  expanded?: boolean;
}

const MEDIA_ICON: Readonly<Record<MediaType, typeof Image>> = {
  image: Image,
  video: Video,
  audio: Music,
};

function KindIcon({ link }: { link: Link }) {
  if (link.kind === 'text') return <FileText aria-hidden="true" className="size-4 shrink-0" />;
  if (link.kind === 'media') {
    const Icon = MEDIA_ICON[link.mediaType];
    return <Icon aria-hidden="true" className="size-4 shrink-0" />;
  }
  return <ExternalLink aria-hidden="true" className="size-4 shrink-0" />;
}

/**
 * The site's icon when it has one, a tinted letter square when it does not.
 *
 * Decorative either way — the host is spelled out next to the title — so it is
 * hidden from assistive tech rather than given an alt text that repeats it.
 *
 * The image is `faviconUrl(key)`, which resolves to okmeme's own origin. It is
 * never `https://<host>/favicon.ico`: that would make every feed render a
 * request to the target site, and a site that can count its referrers can count
 * the readers of a tier it cannot see.
 */
function HostChip({ host, faviconKey }: { host: string; faviconKey: string | null }) {
  const src = faviconUrl(faviconKey);

  if (src !== null) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        width={16}
        height={16}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="size-4 shrink-0 rounded-[3px] object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex size-4 shrink-0 items-center justify-center rounded-[3px] font-mono text-[9px] font-bold"
      style={tintChip(host)}
    >
      {hostInitial(host)}
    </span>
  );
}

function preview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
}

const tagPill =
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors border-border bg-secondary/40 text-muted-foreground hover:border-primary hover:text-foreground';

/**
 * One row, three kinds, no clickable card surface.
 *
 * The left edge is tinted by the post's category, which is the one piece of
 * chrome that says what a row is before you read it. It is seeded from the
 * category slug and never from the author — a stable colour per author would be
 * a correlation handle across the tier wall, which is the whole thing the ring
 * model exists to prevent.
 *
 * The title is a link and the only link in its line; the disclosure is a button;
 * voting is a button. Nothing interactive is nested inside anything else that is
 * also interactive, which is what the old card got wrong.
 */
export function LinkCard({ link, onChange, headingLevel = 2, expanded = false }: LinkCardProps) {
  const { tier, me } = useSession();
  const [pending, setPending] = useState(false);
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  const external = link.kind !== 'text';
  const removed = link.removed !== null;
  const body = link.body;
  const thumbKey = link.kind === 'text' ? null : link.thumbKey;
  const host = link.kind === 'text' ? null : link.host;
  const faviconKey = link.kind === 'text' ? null : link.faviconKey;

  // A media post has something to open, so its kind icon is the thing that
  // opens it rather than a second control sitting next to a decorative one.
  const hasMedia = link.kind === 'media' && link.thumbKey !== null && !removed;
  const media = useDisclosure(expanded && hasMedia && !link.isNsfw);
  const mediaLabel = media.open ? t('link.hideMedia') : t('link.showMedia');

  async function mutate(action: () => Promise<Link>) {
    if (pending) return;
    setPending(true);
    try {
      onChange?.(await action());
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      style={tintEdge(link.category.slug, 'left')}
      className="flex items-start gap-3 border-l-[3px] p-3 compact:gap-2 compact:p-2"
    >
      {thumbKey === null ? null : (
        <Thumb
          thumbKey={thumbKey}
          isNsfw={link.isNsfw}
          className="hidden h-14 w-22 shrink-0 sm:block compact:h-10 compact:w-16"
        />
      )}

      <VoteControl
        link={link}
        orientation="column"
        pending={pending}
        onVote={(on) => void mutate(() => linksApi.vote(link.publicId, on))}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 compact:gap-1">
        {/* The icons are their own column rather than inline in the heading, so
            a title that runs to a second line starts under its first line and
            not under the icons. */}
        <div className="flex items-start gap-2">
          <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
            {hasMedia ? (
              <Button
                {...media.triggerProps}
                variant="ghost"
                size="icon"
                aria-label={mediaLabel}
                title={mediaLabel}
                onClick={media.toggle}
                className={cn('size-8', media.open && 'bg-accent text-accent-foreground')}
              >
                <KindIcon link={link} />
              </Button>
            ) : (
              <span className="flex size-8 items-center justify-center" aria-hidden="true">
                <KindIcon link={link} />
              </span>
            )}
            {host === null ? null : <HostChip host={host} faviconKey={faviconKey} />}
          </span>

          <Heading className="min-w-0 flex-1 self-center text-[0.9375rem] font-bold leading-snug break-words compact:text-sm">
          {external ? (
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="hover:text-primary hover:underline"
            >
              {link.title}
              <span className="sr-only"> — {t('link.openExternal')}</span>
            </a>
          ) : (
            <RouterLink to={`/l/${link.publicId}`} className="hover:text-primary hover:underline">
              {link.title}
            </RouterLink>
          )}
          {host === null ? null : (
            <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{host}</span>
          )}
            {link.isNsfw ? (
              <Badge variant="nsfw" className="ml-2 align-middle">
                {t('link.nsfw')}
              </Badge>
            ) : null}
          </Heading>
        </div>

        {removed ? (
          <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {/* Always "moderator". Never a tier, never an account, at any tier. */}
            {t('link.removed')}
            {link.removed?.reasonKey ? (
              <>
                {' '}
                {t('link.removedReason')}: {tOptional(link.removed.reasonKey, '')}
              </>
            ) : null}
          </p>
        ) : (
          <>
            {body ? (
              <Expando
                labelExpand={t('link.expand')}
                labelCollapse={t('link.collapse')}
                defaultOpen={expanded}
                /* The teaser is one line, the way the row layout wants it, and
                   compact drops it entirely — it is most of a collapsed row. */
                preview={
                  <span className="hidden line-clamp-1 sm:block compact:hidden">{preview(body)}</span>
                }
              >
                <div className="text-sm whitespace-pre-wrap break-words">{body}</div>
              </Expando>
            ) : null}

            {/* Opened by the kind icon above, which is why only the region is
                here. The trigger still precedes it in DOM order. */}
            {hasMedia && link.kind === 'media' && link.thumbKey !== null ? (
              <div {...media.regionProps}>
                {media.open ? (
                  <Thumb thumbKey={link.thumbKey} isNsfw={link.isNsfw} className="max-w-2xl" />
                ) : null}
              </div>
            ) : null}
          </>
        )}

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          <AuthorLabel author={link.author} />
          <time dateTime={link.createdAt} title={absoluteTime(link.createdAt)}>
            {relativeTime(link.createdAt)}
          </time>
          {link.editedAt === null ? null : (
            <span title={t('link.editedTitle')}>{t('link.edited')}</span>
          )}
          <RouterLink to={`/c/${link.category.slug}`} className="hover:text-foreground hover:underline">
            {tOptional(link.category.nameKey, link.category.name)}
          </RouterLink>

          {link.tags.length === 0 ? null : (
            <ul className="flex flex-wrap items-center gap-1.5 compact:hidden">
              {link.tags.map((tag) => (
                <li key={tag.slug}>
                  {/* A pending tag reached this viewer only because they
                      proposed it or moderate — it is marked so nobody mistakes
                      it for a word the instance has agreed on. */}
                  <RouterLink
                    to={`/t/${tag.slug}`}
                    title={tag.pending ? t('tag.pendingTitle') : undefined}
                    className={cn(tagPill, tag.pending && 'border-dashed border-primary')}
                  >
                    #{tag.name}
                    {tag.pending ? <span className="ml-1 opacity-70">{t('tag.pending')}</span> : null}
                  </RouterLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon" asChild className="text-muted-foreground">
          <RouterLink to={`/l/${link.publicId}`} aria-label={t('link.comments')}>
            <MessageSquare />
          </RouterLink>
        </Button>

        {can.bookmark(tier) ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-pressed={link.bookmarked}
            aria-label={link.bookmarked ? t('link.unbookmark') : t('link.bookmark')}
            disabled={pending}
            className="text-muted-foreground"
            onClick={() => void mutate(() => linksApi.bookmark(link.publicId, !link.bookmarked))}
          >
            {link.bookmarked ? <BookmarkCheck /> : <Bookmark />}
          </Button>
        ) : null}

        {me === null ? null : <ReportDialog subject={{ type: 'link', publicId: link.publicId }} />}
      </div>
    </Card>
  );
}
