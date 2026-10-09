import { env } from '../../env.js';
import type { BlobStore } from './index.js';

/**
 * Supabase Storage over its REST surface, with no client library: three verbs
 * against one path is not worth a dependency on a security-adjacent path.
 *
 * The bucket must be **private**. Objects are read back through okmeme's own
 * `/thumb/:key` so a viewer's browser never resolves a foreign host — the same
 * rule that rules out hotlinking the original image.
 */
export function createSupabaseBlobStore(): BlobStore {
  const config = env().supabase;

  if (config.url === '' || config.serviceKey === '') {
    throw new Error(
      'BLOB_STORE=supabase-storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }

  const base = `${config.url}/storage/v1/object`;
  const headers = {
    apikey: config.serviceKey,
    Authorization: `Bearer ${config.serviceKey}`,
  };

  const objectUrl = (key: string): string =>
    `${base}/${config.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

  return {
    name: 'supabase-storage',

    async get(key) {
      const response = await fetch(objectUrl(key), { headers });
      if (!response.ok) return null;
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      };
    },

    async put(key, blob) {
      const response = await fetch(objectUrl(key), {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': blob.contentType,
          'Cache-Control': 'max-age=31536000',
          'x-upsert': 'true',
        },
        body: blob.bytes,
      });
      if (!response.ok) {
        throw new Error(`supabase storage put failed: ${response.status}`);
      }
    },

    async delete(key) {
      await fetch(objectUrl(key), { method: 'DELETE', headers });
    },
  };
}
