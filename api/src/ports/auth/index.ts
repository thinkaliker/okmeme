import type { AuthProviderName } from '../../env.js';
import { env } from '../../env.js';
import { createLocalAuthProvider } from './local.js';
import { createSupabaseAuthProvider } from './supabase.js';

/**
 * The authentication port.
 *
 * Both implementations are built from the start and both run the same contract
 * suite (test/auth-contract.test.ts). An abstraction with one implementation is
 * a guess, and the guess is always wrong in the direction of whatever the
 * second one needs.
 *
 * The rule that makes provider swapping possible at all lives one level up:
 * **the provider's user id is never okmeme's user id.** `identities` maps
 * `(provider, subject) -> user_id`, so a subject changing shape costs a row.
 */

export interface ProviderCredential {
  /** Goes in `identities.subject`. Never used as a key for anything else. */
  readonly subject: string;
  /**
   * Secret material okmeme stores on its own side (`identities.password_hash`).
   * Null when the provider holds the secret, as Supabase does.
   */
  readonly secret: string | null;
}

export interface ExchangeResult {
  readonly subject: string;
  /** A username hint for first-time linking. Never trusted over an existing row. */
  readonly username: string | null;
}

export interface AuthProvider {
  readonly name: AuthProviderName;

  /** Create the provider-side account for a signup. */
  provision(username: string, password: string): Promise<ProviderCredential>;

  /** Verify credentials presented at POST /auth/login. */
  verify(
    username: string,
    password: string,
    stored: ProviderCredential,
  ): Promise<boolean>;

  /** Replace the secret: recovery, or an admin-issued reset. */
  reset(stored: ProviderCredential, password: string): Promise<ProviderCredential>;

  /**
   * Provider-initiated login — GET /auth/callback. The local provider has no
   * such flow and rejects.
   */
  exchange(token: string): Promise<ExchangeResult>;

  /** Best-effort revocation of provider-held sessions on lockout or deletion. */
  revoke(stored: ProviderCredential): Promise<void>;
}

let cached: AuthProvider | null = null;

export function authProvider(): AuthProvider {
  if (cached !== null) return cached;
  cached = env().authProvider === 'supabase'
    ? createSupabaseAuthProvider()
    : createLocalAuthProvider();
  return cached;
}

export function resetAuthProvider(): void {
  cached = null;
}
