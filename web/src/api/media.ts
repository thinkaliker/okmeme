import { API_URL, USE_MOCK_API } from '@/config';

/**
 * Thumbnails are always served from okmeme's own origin, at display size.
 *
 * The rule behind that: hotlinking a third-party image hands the viewer's IP to
 * whoever hosts it. In a tiered system that is not a privacy nitpick, it is an
 * attack — post an image on a box you control, read your own access log, and
 * count the people below you. So the browser never resolves a foreign host, and
 * this function is the only place a thumbnail URL is constructed.
 */
export function thumbUrl(key: string | null): string | null {
  if (key === null) return null;
  if (USE_MOCK_API) return placeholder(key);
  return `${API_URL.replace(/\/+$/, '')}/thumb/${encodeURIComponent(key)}`;
}

/**
 * Favicons take the same route for the same reason. A 16px image is more than
 * enough to log a viewer, so `https://<target-host>/favicon.ico` is off limits
 * even though every other site on the web does exactly that.
 */
export const faviconUrl = thumbUrl;

/** Deterministic local placeholder. No network, so the rule above still holds. */
function placeholder(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 45% 42%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 48) % 360} 45% 26%)"/>
    </linearGradient></defs>
    <rect width="320" height="180" fill="url(#g)"/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
