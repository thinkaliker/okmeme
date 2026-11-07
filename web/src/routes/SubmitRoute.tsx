import { useEffect, useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { links as linksApi, taxonomy } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { TagPicker } from '@/components/TagPicker';
import { Button } from '@/components/ui/button';
import { FieldHint, Input, Label, Select, Textarea } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import type { Category, LinkKind, PreviewResult, Tag } from '@/domain/link';
import { AUTHOR_TIER_LABELS, TIER } from '@/domain/tier';
import { t, tierLabel } from '@/i18n/t';
import { useSession } from '@/session/SessionProvider';

const KINDS: readonly LinkKind[] = ['link', 'text', 'media'];

const KIND_LABEL: Readonly<Record<LinkKind, string>> = {
  link: t('submit.kindLink'),
  text: t('submit.kindText'),
  media: t('submit.kindMedia'),
};

export default function SubmitRoute() {
  const { tier, me, allows } = useSession();
  const navigate = useNavigate();

  const [kind, setKind] = useState<LinkKind>('link');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [tagSlugs, setTagSlugs] = useState<readonly string[]>([]);
  const [newTagNames, setNewTagNames] = useState<readonly string[]>([]);
  const [isNsfw, setIsNsfw] = useState(false);
  /** null follows the author's own tier, which is what every post did before. */
  const [pinnedTier, setPinnedTier] = useState<number | null>(null);

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

  if (!allows('submit')) {
    return (
      <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm">
        {tier >= TIER.owner ? t('submit.ownerCannotPost') : t('submit.tierCannotPost')}
      </p>
    );
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
        pinnedTier,
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

      <TagPicker
        id="submit"
        available={tags}
        slugs={tagSlugs}
        newNames={newTagNames}
        onSlugsChange={setTagSlugs}
        onNewNamesChange={setNewTagNames}
        creates={allows('createTags')}
      />

      {allows('postBelow') && tier > TIER.limited ? (
        <VisibilityChoice own={tier} value={pinnedTier} onChange={setPinnedTier} />
      ) : null}

      {allows('postNsfw') ? (
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

/**
 * Where the post lives: the author's own tier, or one below it for a wider
 * audience. Never above — the server refuses that, since it would put the post
 * under a higher tier's label.
 *
 * Each option is described by the lowest tier that can see the post, which is
 * one below where it lives. Every label offered is at or below the author's own
 * tier, so the choice teaches them nothing about the ring.
 */
function VisibilityChoice({
  own,
  value,
  onChange,
}: {
  own: number;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const levels: number[] = [];
  for (let level = own; level >= TIER.limited; level -= 1) levels.push(level);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{t('submit.visibility')}</legend>
      <div className="flex flex-wrap gap-2">
        {levels.map((level) => {
          const lowest = AUTHOR_TIER_LABELS[level - 2];
          const isDefault = level === own;
          return (
            <label
              key={level}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-accent"
            >
              <input
                type="radio"
                name="submit-visibility"
                checked={isDefault ? value === null : value === level}
                onChange={() => onChange(isDefault ? null : level)}
                className="accent-primary"
              />
              {lowest === undefined ? (
                t('submit.visibilityEveryone')
              ) : (
                <>
                  <Badge variant="tier">{tierLabel(lowest)}</Badge>
                  <span>{t('submit.visibilityAndUp')}</span>
                </>
              )}
              {isDefault ? (
                <span className="text-xs text-muted-foreground">{t('submit.visibilityDefault')}</span>
              ) : null}
            </label>
          );
        })}
      </div>
      <FieldHint>{t('submit.visibilityHelp')}</FieldHint>
    </fieldset>
  );
}
