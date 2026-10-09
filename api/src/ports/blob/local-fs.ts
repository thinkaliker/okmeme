import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { env } from '../../env.js';
import type { Blob, BlobStore } from './index.js';

/**
 * Files on a disk. The default, because a self-hoster with a volume should not
 * need an object store to see a thumbnail.
 *
 * On a serverless platform the filesystem is ephemeral and per-instance: this
 * store still works there, it simply degrades to a per-instance cache that
 * refetches on a cold start. That is a performance property, not a correctness
 * one, because the store is a cache by design.
 */
export function createLocalFsBlobStore(root = env().blobDir): BlobStore {
  const base = resolve(root);

  /** A key is a path fragment from a URL. It never escapes the root. */
  function pathFor(key: string): string {
    const target = resolve(join(base, key.replace(/\.\./g, '_')));
    if (target !== base && !target.startsWith(base + sep)) {
      throw new Error('blob key escapes the store root');
    }
    return target;
  }

  return {
    name: 'local-fs',

    async get(key) {
      try {
        const bytes = await readFile(pathFor(key));
        const meta = await readFile(`${pathFor(key)}.type`, 'utf8').catch(() => 'image/webp');
        return { bytes: new Uint8Array(bytes), contentType: meta };
      } catch {
        return null;
      }
    },

    async put(key, blob: Blob) {
      const target = pathFor(key);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, blob.bytes);
      await writeFile(`${target}.type`, blob.contentType, 'utf8');
    },

    async delete(key) {
      await rm(pathFor(key), { force: true });
      await rm(`${pathFor(key)}.type`, { force: true });
    },
  };
}
