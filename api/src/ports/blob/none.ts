import type { Blob, BlobStore } from './index.js';

/**
 * No blob store at all: `BLOB_STORE=none`.
 *
 * For an instance that has nowhere free to put bytes, or does not want the
 * outbound fetch. Nothing is stored and nothing is served, so every link renders
 * with the tinted host letter the client already draws for a target that has no
 * preview image.
 *
 * What this must never become is a fallback to the source URL. Hotlinking a
 * third-party image hands every viewer's IP to whoever hosts it, and in a tiered
 * system that is an active attack: post an image on a box you control, read your
 * own access log, and count the readers below you. "No thumbnails" is a
 * cosmetic loss. "Thumbnails from someone else's server" is a hole in the ring
 * model. So the degraded state is *fewer pictures*, never *foreign pictures*.
 *
 * Writes succeed silently rather than throwing. A submission is not a failure
 * because the instance chose not to keep a picture of it.
 */
export function createNoneBlobStore(): BlobStore {
  return {
    name: 'none',
    get: async (): Promise<Blob | null> => null,
    put: async (): Promise<void> => {},
    delete: async (): Promise<void> => {},
  };
}
