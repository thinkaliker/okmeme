import { useEffect, useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { links as linksApi, taxonomy } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { TagPicker } from '@/components/TagPicker';
import { VisibilityChoice } from '@/components/VisibilityChoice';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { Category, LinkKind, PreviewResult, Tag } from '@/domain/link';
import { TIER } from '@/domain/tier';
import { t } from '@/i18n/t';
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

      <FieldSet>
        <FieldLegend variant="label">{t('submit.kind')}</FieldLegend>
        <RadioGroup
          name="kind"
          value={kind}
          onValueChange={(next) => setKind(next as LinkKind)}
          className="flex gap-2"
        >
          {KINDS.map((value) => (
            <FieldLabel key={value} className="cursor-pointer items-center rounded-md border border-border px-3 py-1.5 text-sm leading-5 font-normal">
              <RadioGroupItem value={value} />
              {KIND_LABEL[value]}
            </FieldLabel>
          ))}
        </RadioGroup>
      </FieldSet>

      {kind === 'text' ? null : (
        <Field>
          <FieldLabel htmlFor="submit-url">{t('submit.url')}</FieldLabel>
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
          <FieldDescription>{t('submit.noUpload')}</FieldDescription>
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
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="submit-title">{t('submit.titleField')}</FieldLabel>
        <Input
          id="submit-title"
          required
          maxLength={300}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="submit-body">
          {kind === 'text' ? t('submit.body') : t('submit.bodyOptional')}
        </FieldLabel>
        <Textarea
          id="submit-body"
          required={kind === 'text'}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="submit-category">{t('submit.category')}</FieldLabel>
        <NativeSelect
          id="submit-category"
          value={categorySlug}
          onChange={(event) => setCategorySlug(event.target.value)}
        >
          {categories.map((category) => (
            <NativeSelectOption key={category.slug} value={category.slug}>
              {category.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>

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
        <VisibilityChoice
          name="submit-visibility"
          own={tier}
          value={pinnedTier}
          onChange={setPinnedTier}
          hint={t('submit.visibilityHelp')}
        />
      ) : null}

      {allows('postNsfw') ? (
        <Field>
          <Field orientation="horizontal" className="gap-3">
            <Switch id="submit-nsfw" checked={isNsfw} onCheckedChange={setIsNsfw} />
            <FieldLabel htmlFor="submit-nsfw">{t('submit.nsfw')}</FieldLabel>
          </Field>
          <FieldDescription>{t('submit.nsfwHelp')}</FieldDescription>
        </Field>
      ) : null}

      <FieldError>{error}</FieldError>

      <div>
        <Button type="submit" disabled={pending}>
          {t('submit.action')}
        </Button>
      </div>
    </form>
  );
}
