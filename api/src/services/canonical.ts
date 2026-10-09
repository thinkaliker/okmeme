import { invalid } from '../errors.js';

/**
 * URL canonicalization, ahead of a dedup check that runs **only against what
 * the submitter can see**.
 *
 * The steps are the ones DESIGN.md fixes: lowercase host, drop `www.`, strip
 * tracking parameters, sort what remains, drop the fragment. Redirect-following
 * happens in the fetcher, not here, because it needs the network.
 */

const TRACKING = /^(utm_|fbclid$|gclid$|mc_eid$|mc_cid$|igshid$|ref_src$|ref_url$|_hsenc$|_hsmi$|vero_id$|yclid$|msclkid$)/i;

export function canonicalize(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw invalid('that is not a URL', 'bad_url');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw invalid('only http and https URLs are accepted', 'bad_url');
  }

  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.hash = '';

  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING.test(key))
    .sort(([a], [b]) => a.localeCompare(b));

  url.search = '';
  for (const [key, value] of params) url.searchParams.append(key, value);

  // A trailing slash on a bare origin and its absence are the same page.
  if (url.pathname === '/' && url.search === '') return `${url.origin}/`;

  return url.toString();
}

export function hostOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}
