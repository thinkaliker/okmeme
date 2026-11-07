import type { Viewer } from '../context.js';
import { toPage, type Page } from '../lib/cursor.js';
import { groupTags, linkPayload } from '../serialize.js';
import { queryLinks, tagsForLinks, type LinkQuery, type LinkRow } from '../visibility.js';

/**
 * The one path from a list query to a wire page.
 *
 * Rows are filtered in SQL and only then sliced, so a short page means the true
 * end of the list. Tags are fetched for the page that survived, through the same
 * viewer, so a pending tag cannot ride along on a row it was filtered off.
 */
export async function linksPage(query: LinkQuery): Promise<Page<Record<string, unknown>>> {
  const rows = await queryLinks(query);
  const visible = rows.slice(0, query.limit);
  const tags = await tagsForLinks(query.viewer, visible.map((row) => row.id));
  const byLink = groupTags(tags);

  return toPage(
    rows,
    query.limit,
    (row: LinkRow) => linkPayload(query.viewer, row, byLink.get(String(row.id)) ?? []),
    (row: LinkRow) => ({ rank: Number(row.rank), id: Number(row.id) }),
  );
}

export async function singleLink(
  viewer: Viewer,
  row: LinkRow,
): Promise<Record<string, unknown>> {
  const tags = await tagsForLinks(viewer, [row.id]);
  return linkPayload(viewer, row, tags);
}
