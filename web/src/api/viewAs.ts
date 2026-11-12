/**
 * The tier content reads are answered for while previewing, or null.
 *
 * "View as" is the server's to answer: it is the only side that holds the rows
 * a lower tier cannot see, so the browser cannot fake a preview by hiding
 * things — it asks for one with `view_as` and renders what comes back. Only the
 * content reads in endpoints.ts send it (feed, search, a link). Writes never
 * do, and the server would answer them for the real caller regardless.
 *
 * Module state rather than React state, on purpose. The session sets it in the
 * same call that changes its own state, before the routes remount and fire
 * their first request. Setting it from an effect would be too late: a parent's
 * effect runs after its children's, so the first page would come back for the
 * tier being left rather than the one being entered.
 */
let current: number | null = null;

export function setViewAsTier(tier: number | null): void {
  current = tier;
}

export function viewAsTier(): number | null {
  return current;
}
