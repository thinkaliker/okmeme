import { argon2id, argon2Verify } from 'hash-wasm';
import { randomBytes } from 'node:crypto';

/**
 * argon2id, per DESIGN.md, through a WASM implementation rather than a native
 * addon. The addon is faster; the WASM build is the one that runs unchanged on
 * a serverless platform, in a distroless container, and on an M-series laptop
 * without a compiler. Portability is the point of the whole adapter layer.
 */

const PARAMS = {
  parallelism: 1,
  iterations: 3,
  memorySize: 19 * 1024, // 19 MiB — OWASP's argon2id floor
  hashLength: 32,
  outputType: 'encoded',
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2id({ password, salt: randomBytes(16), ...PARAMS });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash });
  } catch {
    return false;
  }
}

/**
 * Burned on every failed login and on every recovery-request lookup, so a
 * missing account costs the same wall time as a present one. Without it the
 * response timing is a username oracle no matter what the body says.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=3,p=1$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';

export async function burnPasswordTime(): Promise<void> {
  await verifyPassword('not-a-password', DUMMY_HASH);
}
