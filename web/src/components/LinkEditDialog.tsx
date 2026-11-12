import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { admin, links as linksApi, taxonomy } from '@/api/endpoints';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { TagPicker } from '@/components/TagPicker';
import { VisibilityChoice } from '@/components/VisibilityChoice';
import type { Category, Link, LinkPatch, Tag } from '@/domain/link';
import { TIER, type AuthorTierLabel } from '@/domain/tier';
import { t, tierLabel, tOptional } from '@/i18n/t';
import type { MessageKey } from '@/i18n/en';
import { cn } from '@/lib/utils';
import { useSession } from '@/session/SessionProvider';

/** Reason keys a moderator may attach to a removal. Rendered from the catalogue, never free text. */
const REMOVAL_REASONS: readonly MessageKey[] = [
  'sanction.reason.spam',
  'sanction.reason.abuse',
  'sanction.reason.nsfw',
  'sanction.reason.other',
];

/** Owner is left out: a post pinned there would leave every participating tier. */
const PIN_TIERS: readonly { tier: number; label: AuthorTierLabel }[] = [
  { tier: TIER.limited, label: 'limited' },
  { tier: TIER.full, label: 'full' },
  { tier: TIER.staff, label: 'staff' },
  { tier: TIER.admin, label: 'admin' },
];

const FOLLOW = 'follow';

interface LinkEditDialogProps {
  link: Link;
  onChange?: ((next: Link) => void) | undefined;
  className?: string;
}

/**
 * The cog on a post. It renders only when the server says this viewer may do
 * something to it — `link.viewerCan` — because the client cannot work that out
 * itself: it never learns the tier an identified author sits at.
 *
 * Three independent parts, each shown only when allowed: editing the post,
 * removing it, and (admins) pinning its tier. Every one is enforced again on the
 * server, and the moderator paths are audited there.
 */
export function LinkEditDialog({ link, onChange, className }: LinkEditDialogProps) {
  const { allows, tier: own } = useSession();
  const can = link.viewerCan;
  /** Where the post lives now, for its author. Only their own posts carry it. */
  const pinnedNow = link.pinnedTier ?? null;

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(link.title);
  const [body, setBody] = useState(link.body ?? '');
  const [categorySlug, setCategorySlug] = useState(link.category.slug);
  const [isNsfw, setIsNsfw] = useState(link.isNsfw);
  const [categories, setCategories] = useState<readonly Category[] | null>(null);
  const [tags, setTags] = useState<readonly Tag[]>([]);
  const [tagSlugs, setTagSlugs] = useState<readonly string[]>(link.tags.map((tag) => tag.slug));
  const [newTagNames, setNewTagNames] = useState<readonly string[]>([]);
  const [tierChoice, setTierChoice] = useState<number | null>(pinnedNow);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [reason, setReason] = useState('');
  const [pinTo, setPinTo] = useState('');
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!open || !can.edit) return;
    const controller = new AbortController();
    taxonomy
      .categories({ signal: controller.signal })
      .then(setCategories)
      .catch(() => setCategories(null));
    taxonomy
      .tags({ signal: controller.signal })
      .then(setTags)
      .catch(() => setTags([]));
    return () => controller.abort();
  }, [open, can.edit]);

  if (!can.edit && !can.remove && !can.retier && !can.setTier) return null;

  function reset() {
    setTitle(link.title);
    setBody(link.body ?? '');
    setCategorySlug(link.category.slug);
    setIsNsfw(link.isNsfw);
    setTagSlugs(link.tags.map((tag) => tag.slug));
    setNewTagNames([]);
    setTierChoice(pinnedNow);
    setFailed(false);
    setConfirmRemove(false);
    setReason('');
    setPinTo('');
    setPinned(false);
  }

  async function run(action: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await action();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  /** Removal and re-tier answer 204, so read the post back the way this viewer now sees it. */
  async function reload() {
    try {
      onChange?.(await linksApi.get(link.publicId));
    } catch {
      /* gone from this viewer's ring; the list will drop it on its next load */
    }
  }

  const currentSlugs = link.tags.map((tag) => tag.slug);
  const tagsChanged =
    newTagNames.length > 0 ||
    tagSlugs.length !== currentSlugs.length ||
    tagSlugs.some((slug) => !currentSlugs.includes(slug));

  const patch: LinkPatch = {
    ...(title.trim() !== link.title ? { title: title.trim() } : {}),
    ...(body !== (link.body ?? '') ? { body } : {}),
    ...(categorySlug !== link.category.slug ? { categorySlug } : {}),
    ...(isNsfw !== link.isNsfw ? { isNsfw } : {}),
    // The whole list or nothing: the server replaces the post's tags with it.
    ...(tagsChanged ? { tagSlugs, newTagNames } : {}),
  };
  const contentChanged = can.edit && Object.keys(patch).length > 0;
  // An unpinned post lives at its author's tier, so null and `own` are the same.
  const tierChanged = can.setTier && (tierChoice ?? own) !== (pinnedNow ?? own);
  const changed = contentChanged || tierChanged;
  const valid = !can.edit || (title.trim() !== '' && (link.kind !== 'text' || body.trim() !== ''));

  const save = () =>
    run(async () => {
      if (contentChanged) onChange?.(await linksApi.edit(link.publicId, patch));
      // Separate, and not an edit: moving a post leaves no "edited" marker.
      if (tierChanged) onChange?.(await linksApi.setTier(link.publicId, tierChoice));
      setOpen(false);
    });

  // Back toward your own tier is always open; any wider needs the permission.
  const livesAt = pinnedNow ?? own;
  const widenLocked = (level: number) => level < livesAt && !allows('postBelow');

  const remove = () =>
    run(async () => {
      // A reason is only recorded on a moderator removal; on your own post it
      // would be a notice signed "moderator" for something you did yourself.
      await linksApi.remove(link.publicId, can.moderate && reason !== '' ? reason : undefined);
      await reload();
      setOpen(false);
    });

  const retier = () =>
    run(async () => {
      await admin.retierLink(link.publicId, pinTo === FOLLOW ? null : Number(pinTo));
      await reload();
      setPinned(true);
    });

  const id = (part: string) => `edit-${link.publicId}-${part}`;
  // The post's own category is always an option, before the list arrives too.
  const listed = categories ?? [];
  const categoryOptions = listed.some((c) => c.slug === link.category.slug)
    ? listed
    : [link.category, ...listed];
  // Everything on the post is offered, including a pending tag this viewer
  // sees here but that `GET /tags` does not list for them.
  const tagOptions = [
    ...link.tags.filter((tag) => !tags.some((known) => known.slug === tag.slug)),
    ...tags,
  ];
  // Turning NSFW on needs the permission; turning it off never does.
  const nsfwLocked = !isNsfw && !allows('postNsfw');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('linkEdit.open')}
          title={t('linkEdit.open')}
          className={cn('text-muted-foreground', className)}
        >
          <Settings />
        </Button>
      </DialogTrigger>

      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('linkEdit.title')}</DialogTitle>
          <DialogDescription>
            {can.moderate ? t('linkEdit.moderating') : t('linkEdit.own')}
          </DialogDescription>
        </DialogHeader>

        {can.edit || can.setTier ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) void save();
            }}
          >
            {can.edit ? (
              <>
                <Field>
                  <FieldLabel htmlFor={id('title')}>{t('linkEdit.postTitle')}</FieldLabel>
                  <Input
                    id={id('title')}
                    value={title}
                    maxLength={300}
                    required
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor={id('body')}>{t('linkEdit.body')}</FieldLabel>
                  <Textarea
                    id={id('body')}
                    value={body}
                    maxLength={20_000}
                    required={link.kind === 'text'}
                    onChange={(event) => setBody(event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor={id('category')}>{t('linkEdit.category')}</FieldLabel>
                  <NativeSelect
                    id={id('category')}
                    value={categorySlug}
                    onChange={(event) => setCategorySlug(event.target.value)}
                  >
                    {categoryOptions.map((category) => (
                      <NativeSelectOption key={category.slug} value={category.slug}>
                        {tOptional(category.nameKey, category.name)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>

                <TagPicker
                  id={id('tags')}
                  available={tagOptions}
                  slugs={tagSlugs}
                  newNames={newTagNames}
                  onSlugsChange={setTagSlugs}
                  onNewNamesChange={setNewTagNames}
                  creates={allows('createTags')}
                  listClassName="max-h-32 overflow-y-auto"
                />

                {allows('postNsfw') || link.isNsfw ? (
                  <Field orientation="horizontal" className="gap-3">
                    <Switch
                      id={id('nsfw')}
                      checked={isNsfw}
                      disabled={nsfwLocked}
                      onCheckedChange={setIsNsfw}
                    />
                    <FieldLabel htmlFor={id('nsfw')}>{t('linkEdit.nsfw')}</FieldLabel>
                  </Field>
                ) : null}
              </>
            ) : null}

            {can.setTier ? (
              <VisibilityChoice
                name={id('visibility')}
                own={own}
                value={tierChoice}
                onChange={setTierChoice}
                isDisabled={widenLocked}
                hint={allows('postBelow') ? t('submit.visibilityHelp') : t('linkEdit.visibilityNarrowOnly')}
              />
            ) : null}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="sm">
                  {t('app.cancel')}
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" disabled={pending || !valid || !changed}>
                {t('app.save')}
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {can.remove || can.retier ? (
          <section
            aria-labelledby={id('moderation')}
            className={cn('flex flex-col gap-4', (can.edit || can.setTier) && 'border-t border-border pt-4')}
          >
            <h3 id={id('moderation')} className="text-sm font-semibold">
              {t('linkEdit.moderation')}
            </h3>

            {can.remove ? (
              <div className="flex flex-col gap-2">
                {can.moderate ? (
                  <Field>
                    <FieldLabel htmlFor={id('reason')}>{t('linkEdit.removeReason')}</FieldLabel>
                    <NativeSelect id={id('reason')} value={reason} onChange={(event) => setReason(event.target.value)}>
                      <NativeSelectOption value="">{t('linkEdit.removeNoReason')}</NativeSelectOption>
                      {REMOVAL_REASONS.map((key) => (
                        <NativeSelectOption key={key} value={key}>
                          {t(key)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldDescription>{t('linkEdit.removeReasonHint')}</FieldDescription>
                  </Field>
                ) : (
                  <FieldDescription>{t('linkEdit.removeOwnHint')}</FieldDescription>
                )}
                <div className="flex flex-wrap gap-2">
                  {confirmRemove ? (
                    <>
                      <Button size="sm" variant="destructive" disabled={pending} onClick={() => void remove()}>
                        {t('linkEdit.removeConfirm')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                        {t('app.cancel')}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setConfirmRemove(true)}>
                      {t('linkEdit.remove')}
                    </Button>
                  )}
                </div>
              </div>
            ) : null}

            {can.retier ? (
              <Field>
                <FieldLabel htmlFor={id('pin')}>{t('linkEdit.retier')}</FieldLabel>
                <div className="flex gap-2">
                  <NativeSelect
                    id={id('pin')}
                    value={pinTo}
                    onChange={(event) => {
                      setPinTo(event.target.value);
                      setPinned(false);
                    }}
                  >
                    <NativeSelectOption value="" disabled>
                      {t('linkEdit.retierChoose')}
                    </NativeSelectOption>
                    {PIN_TIERS.map((option) => (
                      <NativeSelectOption key={option.tier} value={String(option.tier)}>
                        {tierLabel(option.label)}
                      </NativeSelectOption>
                    ))}
                    <NativeSelectOption value={FOLLOW}>{t('linkEdit.retierFollow')}</NativeSelectOption>
                  </NativeSelect>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={pending || pinTo === ''}
                    onClick={() => void retier()}
                  >
                    {t('linkEdit.retierApply')}
                  </Button>
                </div>
                <FieldDescription>{pinned ? t('linkEdit.retierDone') : t('linkEdit.retierHint')}</FieldDescription>
              </Field>
            ) : null}
          </section>
        ) : null}

        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            {t('linkEdit.failed')}
          </p>
        ) : null}

        {can.edit || can.setTier ? null : (
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                {t('app.close')}
              </Button>
            </DialogClose>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
