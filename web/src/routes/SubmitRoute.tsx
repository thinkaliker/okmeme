import { useEffect, useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { links as linksApi, taxonomy } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { FieldHint, Input, Label, Select, Textarea } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import type { Category, LinkKind, PreviewResult, Tag } from '@/domain/link';
import { can } from '@/domain/tier';
import { t } from '@/i18n/t';
import { isValidTagSlug, toTagSlug } from '@/lib/slug';
import { useSession } from '@/session/SessionProvider';

const KINDS: readonly LinkKind[] = ['link', 'text', 'media'];

const KIND_LABEL: Readonly<Record<LinkKind, string>> = {
  link: t('submit.kindLink'),
  text: t('submit.kindText'),
  media: t('submit.kindMedia'),
};

export default function SubmitRoute() {
  const { tier, me } = useSession();
  const navigate = useNavigate();

  const [kind, setKind] = useState<LinkKind>('link');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [tagSlugs, setTagSlugs] = useState<readonly string[]>([]);
  const [newTagNames, setNewTagNames] = useState<readonly string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [tagError, setTagError] = useState(false);
  const [isNsfw, setIsNsfw] = useState(false);

  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [tags, setTags] = useState<readonly Tag[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      taxonomy.categories({ signal: controller.signal }),
      taxonomy.tags({ signal: controller.signal }),
    ])
      .then(([nextCategories, nextTags]) => {
        setCategories(nextCategories);
        setTags(nextTags);
        setCategorySlug((current) => current || (nextCategories[0]?.slug ?? ''));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (me === null) {
    return (
      <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm">
        {t('submit.needAccount')} <RouterLink to="/login" className="underline">{t('nav.login')}</RouterLink>
      </p>
    );
  }

  if (!can.submit(tier)) {
    return (
      <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm">
        {t('submit.ownerCannotPost')}
      </p>
    );
  }

  /**
   * Slugified here so the author sees the tag they will actually get rather than
   * what they typed. The server slugifies again and its answer is the one that
   * counts; this is only so `Two Words` does not look like it survived as-is.
   */
  function addTag() {
    const slug = toTagSlug(tagDraft);
    if (!isValidTagSlug(slug)) {
      setTagError(true);
      return;
    }
    setTagDraft('');
    setTagError(false);
    // Already offered as a checkbox, or already queued: tick it instead of
    // adding a duplicate that the server would merge anyway.
    if (tags.some((tag) => tag.slug === slug)) {
      setTagSlugs((current) => (current.includes(slug) ? current : [...current, slug]));
      return;
    }
    setNewTagNames((current) => (current.includes(slug) ? current : [...current, slug]));
  }

  async function check() {
    setChecking(true);
    try {
      setPreview(await linksApi.preview(url));
    } catch {
      setPreview(null);
    } finally {
      setChecking(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await linksApi.submit({
        kind,
        title,
        url,
        body,
        categorySlug,
        tagSlugs,
        newTagNames,
        isNsfw,
      });
      navigate(`/l/${created.publicId}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('app.error'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex max-w-2xl flex-col gap-5" onSubmit={(event) => void submit(event)}>
      <h1 className="text-lg font-semibold">{t('submit.title')}</h1>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t('submit.kind')}</legend>
        <div className="flex gap-2">
          {KINDS.map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-accent"
            >
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="accent-primary"
              />
              {KIND_LABEL[value]}
            </label>
          ))}
        </div>
      </fieldset>

      {kind === 'text' ? null : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="submit-url">{t('submit.url')}</Label>
          <div className="flex gap-2">
            <Input
              id="submit-url"
              type="url"
              inputMode="url"
              required
              placeholder={t('submit.urlPlaceholder')}
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setPreview(null);
              }}
            />
            <Button type="button" variant="outline" onClick={() => void check()} disabled={!url || checking}>
              {checking ? t('submit.checking') : t('submit.check')}
            </Button>
          </div>
          <FieldHint>{t('submit.noUpload')}</FieldHint>
          {/* Dedup is scoped to what this submitter can already see. A global
              check would confirm the existence of content they are not allowed
              to know about. */}
          {preview?.duplicate ? (
            <p className="text-sm">
              {t('submit.duplicate')}{' '}
              <RouterLink to={`/l/${preview.duplicate.publicId}`} className="underline">
                {preview.duplicate.title}
              </RouterLink>
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="submit-title">{t('submit.titleField')}</Label>
        <Input
          id="submit-title"
          required
          maxLength={300}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="submit-body">
          {kind === 'text' ? t('submit.body') : t('submit.bodyOptional')}
        </Label>
        <Textarea
          id="submit-body"
          required={kind === 'text'}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="submit-category">{t('submit.category')}</Label>
        <Select
          id="submit-category"
          value={categorySlug}
          onChange={(event) => setCategorySlug(event.target.value)}
        >
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{t('submit.tags')}</legend>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const checked = tagSlugs.includes(tag.slug);
            return (
              <label
                key={tag.slug}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs has-checked:border-primary has-checked:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setTagSlugs((current) =>
                      checked ? current.filter((slug) => slug !== tag.slug) : [...current, tag.slug],
                    )
                  }
                  className="accent-primary"
                />
                #{tag.name}
              </label>
            );
          })}
        </div>

        {newTagNames.length === 0 ? null : (
          <ul className="flex flex-wrap gap-2">
            {newTagNames.map((name) => (
              <li key={name}>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary px-2 py-1 text-xs">
                  #{name}
                  <span className="text-muted-foreground">{t('tag.pending')}</span>
                  <button
                    type="button"
                    aria-label={`${t('submit.removeTag')} #${name}`}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setNewTagNames((current) => current.filter((n) => n !== name))}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="submit-new-tag">{t('submit.newTag')}</Label>
          <div className="flex gap-2">
            <Input
              id="submit-new-tag"
              value={tagDraft}
              maxLength={32}
              placeholder={t('submit.newTagPlaceholder')}
              onChange={(event) => {
                setTagDraft(event.target.value);
                setTagError(false);
              }}
              /* Enter adds a tag rather than submitting the post — a form with a
                 single text field otherwise submits on Enter, which would post
                 a half-written draft. */
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                addTag();
              }}
            />
            <Button type="button" variant="outline" onClick={addTag} disabled={tagDraft.trim() === ''}>
              {t('submit.addTag')}
            </Button>
          </div>
          <FieldHint>{tagError ? t('submit.newTagInvalid') : t('submit.newTagHelp')}</FieldHint>
        </div>
      </fieldset>

      {can.postNsfw(tier) ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <Switch id="submit-nsfw" checked={isNsfw} onCheckedChange={setIsNsfw} />
            <Label htmlFor="submit-nsfw">{t('submit.nsfw')}</Label>
          </div>
          <FieldHint>{t('submit.nsfwHelp')}</FieldHint>
        </div>
      ) : null}

      {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

      <div>
        <Button type="submit" disabled={pending}>
          {t('submit.action')}
        </Button>
      </div>
    </form>
  );
}
