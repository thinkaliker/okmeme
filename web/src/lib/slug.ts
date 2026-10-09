const MAX_TAG_LENGTH = 24;

/**
 * Normalises a typed tag into a slug. The client runs this to show the author
 * what they will actually get; the server runs it again and its answer is the
 * one that counts. Two spellings of the same word must not become two tags.
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

export function isValidTagSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= MAX_TAG_LENGTH;
}
