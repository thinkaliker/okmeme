import { safeFetch } from './fetcher.js';
import { hostOf } from './canonical.js';

/**
 * What a submitted URL looks like, fetched once, server-side.
 *
 * Parsed with regular expressions rather than a DOM library on purpose: the
 * four fields wanted here are meta tags in the head, and pulling a full HTML
 * parser onto a path that eats untrusted input from arbitrary hosts buys more
 * attack surface than it saves code.
 */

export interface Unfurled {
  readonly title: string | null;
  readonly imageUrl: string | null;
  readonly faviconUrl: string | null;
  readonly canonicalUrl: string;
}

const HEAD_LIMIT = 512 * 1024;

function meta(html: string, property: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${property}["'][^>]*>`,
    'i',
  );
  const tag = pattern.exec(html)?.[0];
  if (tag === undefined) return null;
  const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
  return content === undefined || content === '' ? null : decodeEntities(content);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function absolute(candidate: string | null, base: string): string | null {
  if (candidate === null) return null;
  try {
    return new URL(candidate, base).toString();
  } catch {
    return null;
  }
}

export async function unfurl(url: string): Promise<Unfurled> {
  let html = '';
  let finalUrl = url;

  try {
    const resource = await safeFetch(url, {
      maxBytes: HEAD_LIMIT,
      accept: 'text/html,application/xhtml+xml',
    });
    finalUrl = resource.url;
    if (resource.contentType.startsWith('text/html')) {
      html = new TextDecoder('utf-8', { fatal: false }).decode(resource.bytes);
    }
  } catch {
    // A site that refuses the fetch still gets submitted. The preview degrades
    // to a host and a title the author types; it never blocks a submission.
    return { title: null, imageUrl: null, faviconUrl: null, canonicalUrl: url };
  }

  const title =
    meta(html, 'og:title') ??
    meta(html, 'twitter:title') ??
    decodeEntities(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html)?.[1]?.trim() ?? '') ??
    null;

  const image = absolute(meta(html, 'og:image') ?? meta(html, 'twitter:image'), finalUrl);

  const iconHref = /<link[^>]+rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*>/i.exec(html)?.[0];
  const icon = iconHref === undefined
    ? null
    : /href\s*=\s*["']([^"']+)["']/i.exec(iconHref)?.[1] ?? null;

  return {
    title: title === '' ? null : title,
    imageUrl: image,
    // No `/favicon.ico` guess. A 16px image is enough to log a viewer, and a
    // site that can count its referrers can count the readers of a tier it
    // cannot see — so okmeme only takes an icon the page actually declares,
    // and re-serves it from its own origin either way.
    faviconUrl: absolute(icon, finalUrl),
    canonicalUrl: absolute(meta(html, 'og:url'), finalUrl) ?? finalUrl,
  };
}

export { hostOf };
