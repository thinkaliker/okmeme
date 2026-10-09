import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/**
 * Public ids are opaque and random.
 *
 * Sequential ids would let anyone walk the space and count the gaps, and a gap
 * is a hidden post. That makes enumeration a census of content above your tier,
 * which is precisely what the ring model exists to prevent.
 */

const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz'; // no 0/1/l/o

function randomString(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export const publicId = (prefix: string): string => `${prefix}_${randomString(12)}`;

/** Session and API token secrets. 32 bytes, base64url, never stored in the clear. */
export function secretToken(prefix = ''): string {
  return prefix + randomBytes(32).toString('base64url');
}

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Recovery codes are read aloud and typed back, so they use the same alphabet. */
export function recoveryCode(): string {
  return `${randomString(5)}-${randomString(5)}-${randomString(5)}`;
}

export function inviteCode(): string {
  return `okmi_${randomString(16)}`;
}

export function apiToken(): string {
  return `okm_${randomBytes(24).toString('base64url')}`;
}

/** Constant-time compare over the hashes, not the secrets. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}
