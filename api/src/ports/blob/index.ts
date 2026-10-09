import { env } from '../../env.js';
import { createLocalFsBlobStore } from './local-fs.js';
import { createNoneBlobStore } from './none.js';
import { createS3BlobStore } from './s3.js';
import { createSupabaseBlobStore } from './supabase-storage.js';

/**
 * The blob store is a **cache, not a store of record**. Every derivative is
 * recomputable from the source URL recorded on the link, so a database-only
 * restore is complete rather than merely valid, and backup is `pg_dump` plus an
 * optional blob sync.
 */
export interface Blob {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface BlobStore {
  readonly name: string;
  get(key: string): Promise<Blob | null>;
  put(key: string, blob: Blob): Promise<void>;
  delete(key: string): Promise<void>;
}

let cached: BlobStore | null = null;

export function blobStore(): BlobStore {
  if (cached !== null) return cached;
  switch (env().blobStore) {
    case 's3':
      cached = createS3BlobStore();
      break;
    case 'supabase-storage':
      cached = createSupabaseBlobStore();
      break;
    case 'none':
      cached = createNoneBlobStore();
      break;
    default:
      cached = createLocalFsBlobStore();
  }
  return cached;
}

export function resetBlobStore(): void {
  cached = null;
}
