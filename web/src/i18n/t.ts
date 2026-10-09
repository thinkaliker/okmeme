import { en, type Catalogue, type MessageKey } from '@/i18n/en';
import type { AuthorTierLabel } from '@/domain/tier';

const catalogue: Catalogue = en;

export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * Every user-visible string resolves from a key. Interpolation is `{name}` and
 * is deliberately dumb — it does not evaluate anything and never touches keys.
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const template = catalogue[key];
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/** Keys the server may send that are not in the catalogue must still render. */
export function tOptional(key: string | null | undefined, fallback = ''): string {
  if (!key) return fallback;
  return isMessageKey(key) ? catalogue[key] : fallback || key;
}

export function isMessageKey(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(catalogue, key);
}

/**
 * Tier label resolution. One fixed entry per label, no template, no fallthrough
 * to string building.
 *
 * `[full]` is a security boundary rendered as a word. If it could be assembled
 * from a tier ordinal, an off-by-one anywhere in the client would render the
 * wrong boundary and look completely normal doing it. So the server picks the
 * label and this table is the only thing that turns it into text.
 */
const TIER_LABEL_KEYS: Readonly<Record<AuthorTierLabel, MessageKey>> = Object.freeze({
  limited: 'tier.limited',
  full: 'tier.full',
  staff: 'tier.staff',
  admin: 'tier.admin',
  owner: 'tier.owner',
});

export function tierLabel(label: AuthorTierLabel): string {
  const key = TIER_LABEL_KEYS[label];
  return key === undefined ? t('tier.unknown') : catalogue[key];
}
