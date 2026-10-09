import { env } from '../../env.js';
import type { BlobStore } from './index.js';

/**
 * S3 and anything that speaks it — R2, B2, MinIO, Spaces — through
 * `S3_ENDPOINT` plus `S3_FORCE_PATH_STYLE`.
 *
 * The SDK is an optional dependency and is imported lazily, so a deployment on
 * `local-fs` never installs or loads it.
 */
export function createS3BlobStore(): BlobStore {
  const config = env().s3;

  if (config.bucket === '') {
    throw new Error('BLOB_STORE=s3 requires S3_BUCKET');
  }

  type S3Module = typeof import('@aws-sdk/client-s3');
  let clientPromise: Promise<{ mod: S3Module; client: InstanceType<S3Module['S3Client']> }> | null =
    null;

  async function connect() {
    if (clientPromise === null) {
      clientPromise = (async () => {
        const mod: S3Module = await import('@aws-sdk/client-s3').catch(() => {
          throw new Error('BLOB_STORE=s3 requires the optional @aws-sdk/client-s3 dependency');
        });
        const client = new mod.S3Client({
          region: config.region,
          forcePathStyle: config.forcePathStyle,
          ...(config.endpoint !== null ? { endpoint: config.endpoint } : {}),
          ...(config.accessKeyId !== ''
            ? {
                credentials: {
                  accessKeyId: config.accessKeyId,
                  secretAccessKey: config.secretAccessKey,
                },
              }
            : {}),
        });
        return { mod, client };
      })();
    }
    return clientPromise;
  }

  return {
    name: 's3',

    async get(key) {
      const { mod, client } = await connect();
      try {
        const result = await client.send(
          new mod.GetObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        const bytes = await result.Body?.transformToByteArray();
        if (bytes === undefined) return null;
        return { bytes, contentType: result.ContentType ?? 'application/octet-stream' };
      } catch {
        // A miss and an error are the same answer here: the caller refetches
        // from the source, which is the whole point of a cache.
        return null;
      }
    },

    async put(key, blob) {
      const { mod, client } = await connect();
      await client.send(
        new mod.PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: blob.bytes,
          ContentType: blob.contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    },

    async delete(key) {
      const { mod, client } = await connect();
      await client.send(new mod.DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
