const MAX_TAG_LENGTH = 24;
const MAX_CATEGORY_LENGTH = 32;

/** The mirror of api/src/lib/slug.ts. The server's answer is the one that counts. */
function slugify(input: string, max: number): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

/**
 * Normalises a typed tag into a slug. The client runs this to show the author
 * what they will actually get; the server runs it again and its answer is the
 * one that counts. Two spellings of the same word must not become two tags.
 */
export function toTagSlug(input: string): string {
  return slugify(input, MAX_TAG_LENGTH);
}

export function isValidTagSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= MAX_TAG_LENGTH;
}

/** What a new category's `/c/:slug` address will be. Fixed once created. */
export function toCategorySlug(input: string): string {
  return slugify(input, MAX_CATEGORY_LENGTH);
}
