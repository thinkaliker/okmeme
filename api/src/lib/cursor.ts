import { invalid } from '../errors.js';

/**
 * Keyset pagination, and only keyset pagination.
 *
 * An offset counts rows the caller may not see; a page number is the same
 * number wearing a hat. The cursor carries a rank and a tiebreaker id, and the
 * SQL filters before it slices, so a short page means the true end of the list
 * rather than "some rows were removed after the fact".
 *
 * Encoding matches web/src/api/mock/transport.ts, so the fake and the server
 * hand out interchangeable cursors.
 */
export interface Cursor {
  readonly rank: number;
  readonly id: number;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.rank}:${cursor.id}`, 'utf8').toString('base64');
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (raw === null || raw === undefined || raw === '') return null;
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    throw invalid('malformed cursor', 'bad_cursor');
  }
  const [rank, id] = decoded.split(':');
  if (rank === undefined || id === undefined) throw invalid('malformed cursor', 'bad_cursor');
  const parsed = { rank: Number(rank), id: Number(id) };
  if (!Number.isFinite(parsed.rank) || !Number.isFinite(parsed.id)) {
    throw invalid('malformed cursor', 'bad_cursor');
  }
  return parsed;
}

export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = 20;

export function parseLimit(raw: string | undefined): number {
  const value = Number(raw ?? DEFAULT_LIMIT);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(value), MAX_LIMIT);
}

/**
 * Never a total, never a count, never a page number. This is the only list
 * envelope the API has.
 */
export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/**
 * Rows are fetched `limit + 1` at a time: the extra row is what tells us there
 * is a next page, without counting anything.
 */
export function toPage<Row, Item>(
  rows: readonly Row[],
  limit: number,
  toItem: (row: Row) => Item,
  toCursor: (row: Row) => Cursor,
): Page<Item> {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(toItem),
    nextCursor: hasMore && last !== undefined ? encodeCursor(toCursor(last)) : null,
  };
}
