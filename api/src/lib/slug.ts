const MAX_TAG_LENGTH = 24;

/**
 * The server's copy of web/src/lib/slug.ts. The client runs it to show an author
 * what they will get; this one is the answer that counts. Two spellings of the
 * same word must not become two tags, and the only way to guarantee that is for
 * the decision to be made once, here.
 */
export function toTagSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TAG_LENGTH)
    .replace(/-+$/g, '');
}

export const isValidTagSlug = (slug: string): boolean =>
  slug.length >= 2 && slug.length <= MAX_TAG_LENGTH;

export function toCategorySlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
}

const USERNAME = /^[a-z0-9](?:[a-z0-9_-]{1,30})$/;

/** Usernames are the one identifier a human types, so keep the character set dull. */
export const isValidUsername = (value: string): boolean => USERNAME.test(value.toLowerCase());
