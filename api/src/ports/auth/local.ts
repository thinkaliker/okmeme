import { ApiError } from '../../errors.js';
import { burnPasswordTime, hashPassword, verifyPassword } from '../../lib/password.js';
import type { AuthProvider, ProviderCredential } from './index.js';

/**
 * argon2id and opaque session cookies, with the hash living in
 * `identities.password_hash`. Nothing leaves the instance: a self-hoster needs
 * a database and nothing else — no SMTP, no identity vendor, no deliverability.
 */
export function createLocalAuthProvider(): AuthProvider {
  return {
    name: 'local',

    async provision(username, password) {
      return { subject: username.toLowerCase(), secret: await hashPassword(password) };
    },

    async verify(_username, password, stored) {
      if (stored.secret === null) {
        // No hash on the row: burn the same wall time a real check would, so a
        // half-provisioned account is not distinguishable by timing.
        await burnPasswordTime();
        return false;
      }
      return verifyPassword(password, stored.secret);
    },

    async reset(stored, password) {
      return { subject: stored.subject, secret: await hashPassword(password) };
    },

    async exchange() {
      throw new ApiError(404, 'not_found', 'no callback flow for the local provider');
    },

    async revoke() {
      // Sessions and tokens are okmeme's own rows; the caller revokes them.
    },
  };
}
