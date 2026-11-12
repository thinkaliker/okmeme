import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldHint } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Tag } from '@/domain/link';
import { t } from '@/i18n/t';
import { cn } from '@/lib/utils';
import { isValidTagSlug, toTagSlug } from '@/lib/slug';

interface TagPickerProps {
  /** Prefix for element ids, so two pickers on one page do not collide. */
  id: string;
  /** Tags to offer as checkboxes: `GET /tags`, plus anything already on the post. */
  available: readonly Tag[];
  slugs: readonly string[];
  newNames: readonly string[];
  onSlugsChange: (next: readonly string[]) => void;
  onNewNamesChange: (next: readonly string[]) => void;
  /** The viewer's tier holds `createTags`, so a new name is created, not proposed. */
  creates: boolean;
  /** Lets a dialog cap the checkbox list's height; the submit page does not. */
  listClassName?: string;
}

/**
 * Existing tags as checkboxes, plus free text for a new one. Shared by the
 * submit form and the edit dialog so a tag means the same thing in both.
 *
 * A new name is only a request. The server slugifies it and decides what it
 * becomes: an existing tag, a tag created outright for a tier holding
 * `createTags`, or a proposal waiting on staff.
 */
export function TagPicker({
  id,
  available,
  slugs,
  newNames,
  onSlugsChange,
  onNewNamesChange,
  creates,
  listClassName,
}: TagPickerProps) {
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  /**
   * Slugified here so the author sees the tag they will actually get rather than
   * what they typed. The server slugifies again and its answer is the one that
   * counts; this is only so `Two Words` does not look like it survived as-is.
   */
  function add() {
    const slug = toTagSlug(draft);
    if (!isValidTagSlug(slug)) {
      setInvalid(true);
      return;
    }
    setDraft('');
    setInvalid(false);
    // Already offered as a checkbox, or already queued: tick it instead of
    // adding a duplicate that the server would merge anyway.
    if (available.some((tag) => tag.slug === slug)) {
      if (!slugs.includes(slug)) onSlugsChange([...slugs, slug]);
      return;
    }
    if (!newNames.includes(slug)) onNewNamesChange([...newNames, slug]);
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">{t('submit.tags')}</legend>
      <div className={cn('flex flex-wrap gap-2', listClassName)}>
        {available.map((tag) => {
          const checked = slugs.includes(tag.slug);
          return (
            <label
              key={tag.slug}
              title={tag.pending ? t('tag.pendingTitle') : undefined}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs has-checked:border-primary has-checked:bg-accent',
                tag.pending && 'border-dashed',
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onSlugsChange(checked ? slugs.filter((slug) => slug !== tag.slug) : [...slugs, tag.slug])
                }
                className="accent-primary"
              />
              #{tag.name}
              {tag.pending ? <span className="text-muted-foreground">{t('tag.pending')}</span> : null}
            </label>
          );
        })}
      </div>

      {newNames.length === 0 ? null : (
        <ul className="flex flex-wrap gap-2">
          {newNames.map((name) => (
            <li key={name}>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary px-2 py-1 text-xs">
                #{name}
                <span className="text-muted-foreground">{t('submit.newTagBadge')}</span>
                <button
                  type="button"
                  aria-label={`${t('submit.removeTag')} #${name}`}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => onNewNamesChange(newNames.filter((n) => n !== name))}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-new-tag`}>{t('submit.newTag')}</Label>
        <div className="flex gap-2">
          <Input
            id={`${id}-new-tag`}
            value={draft}
            maxLength={32}
            placeholder={t('submit.newTagPlaceholder')}
            onChange={(event) => {
              setDraft(event.target.value);
              setInvalid(false);
            }}
            /* Enter adds a tag rather than submitting the form around it — a
               form with a text field otherwise submits on Enter, which would
               post a half-written draft. */
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              add();
            }}
          />
          <Button type="button" variant="outline" onClick={add} disabled={draft.trim() === ''}>
            {t('submit.addTag')}
          </Button>
        </div>
        <FieldHint>
          {invalid
            ? t('submit.newTagInvalid')
            : creates
              ? t('submit.newTagHelpCreate')
              : t('submit.newTagHelp')}
        </FieldHint>
      </div>
    </fieldset>
  );
}
