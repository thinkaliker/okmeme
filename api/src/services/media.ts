import { db } from '../db.js';
import { blobStore } from '../ports/blob/index.js';
import type { Blob } from '../ports/blob/index.js';
import { safeFetch } from './fetcher.js';
import { thumbnailsEnabled } from './settings.js';
import { unfurl } from './unfurl.js';

/**
 * **No user uploads.** On submission the server fetches the target's preview
 * image once, resizes it, stores it in the blob store, and serves it from
 * okmeme's own origin.
 *
 * Hotlinking a third-party image hands every viewer's IP to whoever hosts it.
 * In a tiered system that is not a privacy nitpick, it is an active attack:
 * post an image on a box you control, read your own access log, and count the
 * readers below you. So a browser never resolves a foreign host, for a
 * thumbnail or for a 16px favicon.
 *
 * Keys are derived, never random, because the blob store is a **cache**: a
 * database-only restore has to be able to regenerate every derivative from the
 * source URL recorded on the link.
 */

export const THUMB_WIDTH = 640;
export const FAVICON_WIDTH = 64;

/**
 * Keys carry no slash. The client percent-encodes them into `/thumb/:key`, and
 * an encoded slash is the one character proxies and routers disagree about.
 */
export const thumbKeyFor = (linkPublicId: string): string => `th_${linkPublicId}`;
export const faviconKeyFor = (host: string): string => `fav_${host.toLowerCase()}`;

/** sharp is optional. Without it the derivative is the original, byte for byte. */
async function resize(bytes: Uint8Array, width: number): Promise<Blob> {
  try {
    const sharp = (await import('sharp')).default;
    const out = await sharp(bytes)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return { bytes: new Uint8Array(out), contentType: 'image/webp' };
  } catch {
    return { bytes, contentType: 'image/*' };
  }
}

const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp|avif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/i;

async function storeFromUrl(key: string, sourceUrl: string, width: number): Promise<Blob | null> {
  let fetched;
  try {
    fetched = await safeFetch(sourceUrl, { accept: 'image/*' });
  } catch {
    return null;
  }
  if (!IMAGE_TYPES.test(fetched.contentType)) return null;

  // SVG is not rasterised and not re-served: it is a script container, and
  // serving one from okmeme's own origin would be same-origin script execution.
  if (fetched.contentType.includes('svg')) return null;

  const derivative = await resize(fetched.bytes, width);
  await blobStore().put(key, derivative);
  return derivative;
}

/**
 * Called at submission. Failure is not an error: a link with no preview image
 * is an ordinary link, and blocking a submission on a stranger's server being
 * slow would be the wrong trade.
 */
export async function deriveAtSubmit(
  linkPublicId: string,
  imageUrl: string | null,
  faviconUrl: string | null,
  host: string,
): Promise<{ thumbKey: string | null; faviconKey: string | null }> {
  let thumbKey: string | null = null;
  let faviconKey: string | null = null;

  // The gate lives here as well as at the call site. The call site skips the
  // unfurl to save the outbound request; this one is what makes "off" true of
  // every path into the store rather than of the one that was remembered.
  if (!(await thumbnailsEnabled())) return { thumbKey, faviconKey };

  if (imageUrl !== null) {
    const key = thumbKeyFor(linkPublicId);
    if ((await storeFromUrl(key, imageUrl, THUMB_WIDTH)) !== null) thumbKey = key;
  }

  if (faviconUrl !== null && host !== '') {
    const key = faviconKeyFor(host);
    const existing = await blobStore().get(key);
    if (existing !== null) faviconKey = key;
    else if ((await storeFromUrl(key, faviconUrl, FAVICON_WIDTH)) !== null) faviconKey = key;
  }

  return { thumbKey, faviconKey };
}

/**
 * `GET /thumb/:key` on a cache miss.
 *
 * The key resolves back to a link, the link back to its URL, and the URL back
 * to the image — which is what makes `pg_dump` a complete backup and the blob
 * store optional to sync.
 */
export async function regenerate(key: string): Promise<Blob | null> {
  if (key.startsWith('th_')) {
    const linkPublicId = key.slice(3);
    const link = await db.link.findUnique({
      where: { publicId: linkPublicId },
      select: { url: true, removedAt: true },
    });
    if (link === null || link.url === null || link.removedAt !== null) return null;
    const meta = await unfurl(link.url);
    if (meta.imageUrl === null) return null;
    return storeFromUrl(key, meta.imageUrl, THUMB_WIDTH);
  }

  if (key.startsWith('fav_')) {
    const host = key.slice(4);
    const link = await db.link.findFirst({
      where: { host, removedAt: null, url: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { url: true },
    });
    if (link === null || link.url === null) return null;
    const meta = await unfurl(link.url);
    if (meta.faviconUrl === null) return null;
    return storeFromUrl(key, meta.faviconUrl, FAVICON_WIDTH);
  }

  return null;
}

/**
 * With thumbnails off this returns null for every key, and `/thumb/:key` 404s
 * exactly as it does for a key that never existed. That the instance is not
 * serving images is a property of the instance, not of the viewer's tier, so
 * one response for both cases costs nothing and keeps the route down to a
 * single observable behaviour.
 */
export async function readOrRegenerate(key: string): Promise<Blob | null> {
  if (!(await thumbnailsEnabled())) return null;
  const hit = await blobStore().get(key);
  if (hit !== null) return hit;
  return regenerate(key);
}
