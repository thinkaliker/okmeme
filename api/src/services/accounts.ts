import { db } from '../db.js';
import { env } from '../env.js';
import { conflict, invalid } from '../errors.js';
import { hashToken, publicId, recoveryCode, secretToken } from '../lib/ids.js';
import { hashPassword } from '../lib/password.js';
import { isValidUsername } from '../lib/slug.js';
import { authProvider } from '../ports/auth/index.js';
import { audit } from './audit.js';

/**
 * Account lifecycle. There is no email anywhere in it.
 *
 * Signup consumes an invite — the invite *is* the vouching, so there is nothing
 * to verify — and account recovery spends one of ten codes issued once, at
 * signup, and never recoverable afterwards. A self-hoster needs a database and
 * nothing else: no SMTP, no deliverability, no bounce handling.
 */

export const RECOVERY_CODE_COUNT = 10;

export async function issueRecoveryCodes(userId: bigint): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => recoveryCode());
  const hashes = await Promise.all(codes.map((code) => hashPassword(code)));

  await db.$transaction([
    // Regenerating invalidates every prior code, used or not.
    db.recoveryCode.deleteMany({ where: { userId } }),
    db.recoveryCode.createMany({
      data: hashes.map((codeHash) => ({ userId, codeHash })),
    }),
  ]);

  return codes;
}

export interface CreatedAccount {
  readonly userId: bigint;
  readonly publicId: string;
  readonly username: string;
  readonly tier: number;
  /** Displayed exactly once. Nothing can print them again. */
  readonly recoveryCodes: readonly string[];
}

export async function createAccount(input: {
  username: string;
  password: string;
  tier: number;
  invitedBy?: bigint | null;
}): Promise<CreatedAccount> {
  const username = input.username.trim();
  if (!isValidUsername(username)) {
    throw invalid('usernames are 2–31 characters: letters, numbers, dash, underscore', 'bad_username');
  }
  if (input.password.length < 10) {
    throw invalid('passwords are at least 10 characters', 'weak_password');
  }

  const taken = await db.user.findFirst({ where: { username } });
  if (taken !== null) throw conflict('username_taken', 'that username is taken');

  const credential = await authProvider().provision(username, input.password);

  const user = await db.user.create({
    data: {
      publicId: publicId('u'),
      username,
      tier: input.tier,
      showNsfw: false,
      invitedBy: input.invitedBy ?? null,
      identities: {
        create: {
          provider: authProvider().name,
          subject: credential.subject,
          passwordHash: credential.secret,
        },
      },
    },
  });

  const codes = await issueRecoveryCodes(user.id);

  return {
    userId: user.id,
    publicId: user.publicId,
    username,
    tier: input.tier,
    recoveryCodes: codes,
  };
}

/* ---------------------------------------------------------------- sessions */

export interface IssuedSession {
  readonly token: string;
  readonly expiresAt: Date;
}

export async function createSession(userId: bigint): Promise<IssuedSession> {
  // Opaque, and stored as a hash. A database dump is not a set of live sessions.
  const token = secretToken();
  const expiresAt = new Date(Date.now() + env().sessionTtlDays * 86_400_000);
  await db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  return { token, expiresAt };
}

export async function revokeSession(token: string): Promise<void> {
  await db.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Lockout and deletion both need every credential gone, not just the current one. */
export async function revokeAllCredentials(userId: bigint): Promise<void> {
  const now = new Date();
  await db.$transaction([
    db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    db.apiToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
  ]);
}

/* ---------------------------------------------------------------- deletion */

/**
 * Deletion tombstones in place.
 *
 * Every link the account authored gets `pinned_tier` set to its last effective
 * tier, so the dynamic join still resolves against something after the row
 * stops carrying a live tier. Without that, deleting an account would either
 * orphan its posts or silently move them.
 */
export async function tombstoneUser(userId: bigint, actorId: bigint | null): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (user === null || user.state === 'deleted') return;

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE links SET pinned_tier = COALESCE(pinned_tier, ${user.tier})
      WHERE author_id = ${userId}
    `;
    await tx.user.update({
      where: { id: userId },
      data: {
        username: null,
        state: 'deleted',
        deletedAt: new Date(),
        showNsfw: false,
        display: {},
      },
    });
    await tx.identity.deleteMany({ where: { userId } });
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.session.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
    await tx.apiToken.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
  });

  await audit({
    actorId,
    action: 'user.deleted',
    subjectType: 'user',
    subjectId: user.publicId,
    before: { tier: user.tier },
  });
}
