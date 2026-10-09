import { db } from '../db.js';
import { conflict } from '../errors.js';
import { TIER } from '../tier.js';
import { audit } from './audit.js';
import { setSetting } from './settings.js';
import { createAccount, type CreatedAccount } from './accounts.js';

/**
 * Bootstrapping needs **two accounts, not one**.
 *
 * An owner cannot post and an admin is the only tier that issues invites, so an
 * instance with just an owner can never gain a single user. Install therefore
 * creates both at once, and shows both sets of recovery codes exactly once.
 *
 * There are two entry points because there are two deployment shapes: the
 * one-time `/setup` page (the only option on Vercel, which gives you no shell)
 * and `okmeme init` for docker and bare metal. Both land here, and this is
 * where `settings.setup_complete` is checked and set — inside one transaction,
 * so a race between them cannot produce two owners.
 */

export interface BootstrapInput {
  readonly ownerUsername: string;
  readonly ownerPassword: string;
  readonly adminUsername: string;
  readonly adminPassword: string;
  /**
   * Thumbnails, on unless the operator says otherwise. Asked here because the
   * answer depends on whether a blob store was configured, which is known at
   * install time and nowhere else. Not a decision anyone is stuck with: it is
   * an ordinary admin setting afterwards.
   */
  readonly thumbnails?: boolean;
}

export interface BootstrapResult {
  readonly owner: CreatedAccount;
  readonly admin: CreatedAccount;
}

/**
 * Claims the bootstrap slot. `SELECT ... FOR UPDATE` on the settings row is the
 * lock: a second caller blocks, then finds the flag set and is refused.
 */
async function claimSetup(): Promise<void> {
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ value: unknown }[]>`
      SELECT value FROM settings WHERE key = 'setup_complete' FOR UPDATE
    `;
    const current = rows[0]?.value;
    if (current === true) throw conflict('setup_complete', 'this instance is already set up');

    await tx.$executeRaw`
      INSERT INTO settings (key, value, min_writer_tier)
      VALUES ('setup_complete', 'true'::jsonb, 5)
      ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb, updated_at = now()
    `;
  });
}

export async function bootstrap(input: BootstrapInput): Promise<BootstrapResult> {
  await claimSetup();

  try {
    const owner = await createAccount({
      username: input.ownerUsername,
      password: input.ownerPassword,
      tier: TIER.owner,
    });
    const admin = await createAccount({
      username: input.adminUsername,
      password: input.adminPassword,
      tier: TIER.admin,
      invitedBy: owner.userId,
    });

    if (input.thumbnails === false) {
      // Through setSetting rather than a raw upsert, so the choice lands in the
      // audit log next to the accounts it was made alongside.
      await setSetting('thumbnails_enabled', false, {
        id: owner.userId,
        tier: TIER.owner,
      });
    }

    await audit({
      actorId: owner.userId,
      action: 'setup.completed',
      subjectType: 'instance',
      subjectId: null,
      after: {
        owner: owner.publicId,
        admin: admin.publicId,
        thumbnails: input.thumbnails !== false,
      },
    });

    return { owner, admin };
  } catch (error) {
    // The flag is only worth keeping if two accounts actually exist. Releasing
    // it on failure is what makes a mistyped password recoverable rather than
    // permanently bricking the instance.
    await db.$executeRaw`
      UPDATE settings SET value = 'false'::jsonb WHERE key = 'setup_complete'
    `;
    throw error;
  }
}
