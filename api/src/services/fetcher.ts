import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { env } from '../env.js';
import { invalid } from '../errors.js';

/**
 * Every outbound fetch okmeme makes goes through here.
 *
 * The server fetching a URL on a user's behalf is a request the *instance*
 * makes from inside its own network, so an unguarded fetcher is a
 * server-side request forgery primitive: `http://169.254.169.254/`,
 * `http://localhost:5432`, or an internal admin panel. Guarding it is not
 * optional on a service whose whole job is to fetch strangers' links.
 *
 * Residual risk, stated rather than hidden: DNS rebinding between the check and
 * the connection is not closed here. Closing it needs a custom agent that pins
 * the resolved address, which is worth doing if this instance ever runs
 * somewhere with an interesting private network. `ALLOW_PRIVATE_FETCH=true`
 * exists for local development and should never be set in production.
 */

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // carrier-grade NAT
  /^198\.(1[89])\./,
  /^22[4-9]\./,
  /^2[3-5]\d\./,
];

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return PRIVATE_V4.some((pattern) => pattern.test(address));
  if (family === 6) {
    const value = address.toLowerCase();
    if (value === '::1' || value === '::') return true;
    if (value.startsWith('fc') || value.startsWith('fd')) return true; // unique local
    if (value.startsWith('fe80')) return true; // link local
    if (value.startsWith('::ffff:')) return isPrivateAddress(value.slice(7));
    return false;
  }
  return true;
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (env().allowPrivateFetch) return;

  const literal = isIP(hostname);
  if (literal !== 0) {
    if (isPrivateAddress(hostname)) throw invalid('that host is not reachable', 'blocked_host');
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw invalid('that host does not resolve', 'blocked_host');
  }
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw invalid('that host is not reachable', 'blocked_host');
  }
}

export interface FetchedResource {
  readonly url: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

const MAX_REDIRECTS = 5;

/**
 * Redirects are followed by hand so every hop is checked, not just the first
 * one. A public URL that 302s to `127.0.0.1` is the standard bypass.
 */
export async function safeFetch(
  rawUrl: string,
  options: { maxBytes?: number; accept?: string } = {},
): Promise<FetchedResource> {
  const config = env();
  const maxBytes = options.maxBytes ?? config.maxFetchBytes;

  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = new URL(current);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw invalid('only http and https URLs are accepted', 'bad_url');
    }
    await assertPublicHost(url.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.fetchTimeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          // Honest about who is asking. Sites that dislike it can block it.
          'User-Agent': 'okmeme/0.1 (+link preview; server-side)',
          Accept: options.accept ?? '*/*',
        },
      });
    } catch {
      clearTimeout(timer);
      throw invalid('could not reach that URL', 'fetch_failed');
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location === null) throw invalid('redirect without a target', 'fetch_failed');
      current = new URL(location, url).toString();
      continue;
    }

    if (!response.ok) throw invalid(`that URL returned ${response.status}`, 'fetch_failed');

    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > maxBytes) throw invalid('that resource is too large', 'too_large');

    const bytes = await readCapped(response, maxBytes);

    return {
      url: url.toString(),
      contentType: (response.headers.get('content-type') ?? 'application/octet-stream')
        .split(';')[0]!
        .trim(),
      bytes,
    };
  }

  throw invalid('too many redirects', 'fetch_failed');
}

/** Content-Length is a claim. The cap is enforced against what actually arrives. */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (reader === undefined) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw invalid('that resource is too large', 'too_large');
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
