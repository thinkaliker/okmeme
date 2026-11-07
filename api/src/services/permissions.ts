import { Prisma } from '@prisma/client';
import { db } from '../db.js';
import { forbidden, invalid } from '../errors.js';
import {
  canEditCell,
  defaultGrant,
  effectivePermissions,
  isCapability,
  isConfigurable,
  permissionMatrix,
  type Capability,
  type Matrix,
  type PermissionActor,
} from '../permissions.js';
import { TIER } from '../tier.js';
import { audit } from './audit.js';
import { inviteMinTier } from './settings.js';

/**
 * Storage for the table in src/permissions.ts. A row in `tier_permissions` is
 * an override; no row means the default. Writing a value equal to the default
 * deletes the row, so "reset" and "never touched" are the same state.
 */

/**
 * Migrations do not run on deploy (DEPLOY.md, A6), so the code can reach a
 * database that has no `tier_permissions` yet. A table that does not exist
 * holds no overrides, so the defaults are not a guess but the exact answer —
 * and every signed-in request keeps working instead of answering 500.
 *
 * Only "no such table" is caught. Anything else, a missing grant included,
 * still fails: there the table may hold overrides this read cannot see.
 */
let warnedMissing = false;

async function readOverrides<T>(read: () => Promise<T[]>): Promise<T[]> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      if (!warnedMissing) {
        warnedMissing = true;
        console.warn('[okmeme] tier_permissions is missing; using default permissions. Run `npm run migrate`.');
      }
      return [];
    }
    throw error;
  }
}

function toOverrides(rows: readonly { capability: string; granted: boolean }[]) {
  const overrides = new Map<Capability, boolean>();
  for (const row of rows) {
    if (isCapability(row.capability)) overrides.set(row.capability, row.granted);
  }
  return overrides;
}

/**
 * Read on every authenticated request, like the sanction, so a change takes
 * effect on the next request rather than whenever a cache expires. One indexed
 * read of a table that is at most a few dozen rows. Owners and anonymous
 * viewers have nothing configurable and skip it.
 */
export async function loadPermissions(tier: number): Promise<ReadonlySet<Capability>> {
  if (tier < TIER.limited || tier >= TIER.owner) return effectivePermissions(tier, new Map());
  const rows = await readOverrides(() =>
    db.tierPermission.findMany({ where: { tier }, select: { capability: true, granted: true } }),
  );
  return effectivePermissions(tier, toOverrides(rows));
}

async function allGrants(): Promise<Map<number, ReadonlySet<Capability>>> {
  const rows = await readOverrides(() =>
    db.tierPermission.findMany({ select: { tier: true, capability: true, granted: true } }),
  );

  // Issuing invites is fixed in the table, but the owner-only setting can raise
  // the bar above admin. Show what the invite route will actually enforce.
  const minimum = await inviteMinTier();

  const grants = new Map<number, ReadonlySet<Capability>>();
  for (let tier = TIER.limited; tier <= TIER.owner; tier += 1) {
    const set = effectivePermissions(tier, toOverrides(rows.filter((row) => row.tier === tier)));
    if (tier < minimum) set.delete('issueInvites');
    grants.set(tier, set);
  }
  return grants;
}

export async function matrixFor(actor: PermissionActor): Promise<Matrix> {
  const grants = await allGrants();
  return permissionMatrix(actor, (tier) => grants.get(tier) ?? new Set());
}

export async function setPermission(
  actor: PermissionActor & { readonly id: bigint },
  tier: number,
  capability: string,
  granted: boolean,
): Promise<void> {
  if (!isCapability(capability)) throw invalid('no such permission', 'bad_permission');
  if (!isConfigurable(capability, tier)) {
    throw forbidden('that permission is fixed for that tier');
  }
  if (!canEditCell(actor, tier, capability)) {
    throw forbidden('you can only change permissions you hold, for tiers below yours');
  }

  const existing = await db.tierPermission.findUnique({
    where: { tier_capability: { tier, capability } },
  });
  const before = existing?.granted ?? defaultGrant(capability, tier);
  if (before === granted) return;

  if (granted === defaultGrant(capability, tier)) {
    await db.tierPermission.deleteMany({ where: { tier, capability } });
  } else {
    await db.tierPermission.upsert({
      where: { tier_capability: { tier, capability } },
      update: { granted, updatedBy: actor.id, updatedAt: new Date() },
      create: { tier, capability, granted, updatedBy: actor.id },
    });
  }

  // A permission change rewrites what a whole tier may do, so it is logged the
  // way a promotion is.
  await audit({
    actorId: actor.id,
    action: 'permission.updated',
    subjectType: 'permission',
    subjectId: `${tier}:${capability}`,
    before: { granted: before },
    after: { granted },
  });
}
