import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../../errors.js';
import { env } from '../../env.js';
import type { AuthProvider, ExchangeResult, ProviderCredential } from './index.js';

/**
 * Supabase GoTrue behind the same port.
 *
 * Two details are adapter work rather than configuration:
 *
 * 1. **okmeme has no email and GoTrue insists on one.** Usernames map to a
 *    synthetic address under `SUPABASE_USER_DOMAIN`, which is never delivered
 *    to and never shown. Signup stays invite-only; nothing is ever sent.
 * 2. **`identities.subject` is the GoTrue user id, not the email.** The email is
 *    derived and could be rewritten; the id is the thing worth mapping. This is
 *    the rule that makes providers swappable at all.
 */

interface Deps {
  /** Injected so the contract suite can run this implementation against a stub. */
  readonly fetchImpl?: typeof fetch;
  readonly url?: string;
  readonly serviceKey?: string;
  readonly jwtSecret?: string;
  readonly userDomain?: string;
}

interface GoTrueUser {
  id?: string;
  email?: string;
  user_metadata?: { username?: string };
}

export function createSupabaseAuthProvider(deps: Deps = {}): AuthProvider {
  const config = env().supabase;
  const doFetch = deps.fetchImpl ?? fetch;
  const url = (deps.url ?? config.url).replace(/\/+$/, '');
  const serviceKey = deps.serviceKey ?? config.serviceKey;
  const jwtSecret = deps.jwtSecret ?? config.jwtSecret;
  const userDomain = deps.userDomain ?? process.env['SUPABASE_USER_DOMAIN'] ?? 'users.okmeme.invalid';

  const emailFor = (username: string): string => `${username.toLowerCase()}@${userDomain}`;

  async function admin(path: string, init: RequestInit): Promise<unknown> {
    if (url === '' || serviceKey === '') {
      throw new ApiError(500, 'misconfigured', 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }
    const response = await doFetch(`${url}${path}`, {
      ...init,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    const body: unknown = text === '' ? null : JSON.parse(text);
    if (!response.ok) {
      const message =
        typeof body === 'object' && body !== null && 'msg' in body
          ? String((body as { msg: unknown }).msg)
          : `supabase ${response.status}`;
      throw new ApiError(response.status === 400 ? 400 : 502, 'provider_error', message);
    }
    return body;
  }

  return {
    name: 'supabase',

    async provision(username, password) {
      const created = (await admin('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: emailFor(username),
          password,
          email_confirm: true, // nothing is ever mailed; the invite was the vouching
          user_metadata: { username },
        }),
      })) as GoTrueUser;

      if (typeof created.id !== 'string') {
        throw new ApiError(502, 'provider_error', 'supabase returned no user id');
      }
      return { subject: created.id, secret: null };
    },

    async verify(username, password) {
      if (url === '') throw new ApiError(500, 'misconfigured', 'SUPABASE_URL is required');
      const response = await doFetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailFor(username), password }),
      });
      return response.ok;
    },

    async reset(stored, password) {
      await admin(`/auth/v1/admin/users/${encodeURIComponent(stored.subject)}`, {
        method: 'PUT',
        body: JSON.stringify({ password }),
      });
      return { subject: stored.subject, secret: null };
    },

    async exchange(token) {
      return verifyAccessToken(token, jwtSecret);
    },

    async revoke(stored) {
      // Best effort: a failure here must not block a lockout on okmeme's side.
      try {
        await admin(`/auth/v1/admin/users/${encodeURIComponent(stored.subject)}/factors`, {
          method: 'GET',
        });
        await admin('/auth/v1/logout', { method: 'POST', body: '{}' });
      } catch {
        /* okmeme's own sessions and tokens are revoked regardless */
      }
    },
  };
}

/* ---------------------------------------------------------------- jwt */

interface JwtPayload {
  sub?: string;
  exp?: number;
  email?: string;
  user_metadata?: { username?: string };
}

/**
 * HS256 verification against the project's JWT secret, done here rather than
 * with a library because it is thirty lines and the alternative is a dependency
 * that has to be audited on a security path.
 */
export function verifyAccessToken(token: string, secret: string): ExchangeResult {
  if (secret === '') throw new ApiError(500, 'misconfigured', 'SUPABASE_JWT_SECRET is required');

  const parts = token.split('.');
  if (parts.length !== 3) throw new ApiError(401, 'invalid_token', 'malformed token');
  const [header, payload, signature] = parts as [string, string, string];

  const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as {
    alg?: string;
  };
  if (decodedHeader.alg !== 'HS256') {
    throw new ApiError(401, 'invalid_token', 'unsupported token algorithm');
  }

  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  const provided = Buffer.from(signature, 'base64url');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new ApiError(401, 'invalid_token', 'bad signature');
  }

  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JwtPayload;
  if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) {
    throw new ApiError(401, 'invalid_token', 'expired');
  }
  if (typeof claims.sub !== 'string' || claims.sub === '') {
    throw new ApiError(401, 'invalid_token', 'no subject');
  }

  return { subject: claims.sub, username: claims.user_metadata?.username ?? null };
}

export type { ProviderCredential };
