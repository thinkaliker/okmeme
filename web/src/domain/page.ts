/**
 * Cursor pagination, and only cursor pagination.
 *
 * There is no `total`, no `count`, and no page number — anywhere, in any list.
 * A total is a count of rows including the ones the viewer is not allowed to
 * know exist. The server fetches until the page is filled, so a short page
 * means the true end of the list rather than "some rows were filtered out".
 */
export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export const emptyPage = <T>(): Page<T> => ({ items: [], nextCursor: null });
