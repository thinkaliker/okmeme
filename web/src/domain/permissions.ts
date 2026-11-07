import { TIER, can, type AuthorTierLabel, type ViewerTier } from '@/domain/tier';

/**
 * Per-tier permissions — the mirror of api/src/permissions.ts.
 *
 * The browser never decides what a viewer may do: `GET /me` carries the
 * viewer's own list and every route checks again. This copy exists for the dev
 * fake in src/api/mock, which has to apply the same rules the server does, and
 * so there is one written-down catalogue on this side of the wire.
 */

export const CAPABILITIES = [
  'submit',
  'vote',
  'bookmark',
  'editOwn',
  'postBelow',
  'postNsfw',
  'createTags',
  'moderate',
  'seeNsfw',
  'reviewTags',
  'retier',
  'issueInvites',
  'reviewReports',
  'manageCategories',
  'readAuditLog',
  'ownerSettings',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value);
}

/** What one link lets this viewer do to it. Resolved by the server, per viewer. */
export interface ViewerCan {
  readonly edit: boolean;
  readonly remove: boolean;
  readonly retier: boolean;
  /** Acting on someone else's post: audited, and the author is notified. */
  readonly moderate: boolean;
  /** The author choosing who can see their own post. */
  readonly setTier: boolean;
}

export const NOTHING: ViewerCan = {
  edit: false,
  remove: false,
  retier: false,
  moderate: false,
  setTier: false,
};

export interface MatrixCell {
  readonly tier: number;
  readonly granted: boolean;
  readonly editable: boolean;
}

export interface MatrixRow {
  readonly capability: Capability;
  /** A rule the ring model depends on, shown for completeness and never editable. */
  readonly locked: boolean;
  readonly cells: readonly MatrixCell[];
}

/** `GET /me/permissions`. Columns stop at the viewer's own tier. */
export interface PermissionMatrix {
  readonly tiers: readonly { readonly tier: number; readonly label: AuthorTierLabel }[];
  readonly rows: readonly MatrixRow[];
}

/* ------------------------------------------------------------------ *
 * The rules, for the fake. Keep in step with the server's copy.
 * ------------------------------------------------------------------ */

const v = (tier: number) => tier as ViewerTier;
const isParticipant = (tier: number) => tier >= TIER.limited && tier < TIER.owner;

const SPECS: Readonly<Record<Capability, { byDefault: (tier: number) => boolean; floor: number | null }>> = {
  submit: { byDefault: (tier) => can.submit(v(tier)), floor: TIER.limited },
  vote: { byDefault: (tier) => can.vote(v(tier)), floor: TIER.limited },
  bookmark: { byDefault: (tier) => can.bookmark(v(tier)), floor: TIER.limited },
  editOwn: { byDefault: isParticipant, floor: TIER.limited },
  postBelow: { byDefault: (tier) => tier >= TIER.staff && tier < TIER.owner, floor: TIER.full },
  postNsfw: { byDefault: (tier) => can.postNsfw(v(tier)), floor: TIER.full },
  createTags: { byDefault: (tier) => can.createTags(v(tier)), floor: TIER.limited },
  moderate: { byDefault: (tier) => can.moderateContent(v(tier)), floor: TIER.full },
  seeNsfw: { byDefault: (tier) => can.seeNsfw(v(tier)), floor: null },
  reviewTags: { byDefault: (tier) => tier >= TIER.staff, floor: null },
  retier: { byDefault: (tier) => tier === TIER.admin, floor: null },
  issueInvites: { byDefault: (tier) => can.issueInvites(v(tier)), floor: null },
  reviewReports: { byDefault: (tier) => can.reviewReports(v(tier)), floor: null },
  manageCategories: { byDefault: (tier) => can.createCategories(v(tier)), floor: null },
  readAuditLog: { byDefault: (tier) => can.readAuditLog(v(tier)), floor: null },
  ownerSettings: { byDefault: (tier) => can.ownerSettings(v(tier)), floor: null },
};

export const defaultGrant = (capability: Capability, tier: number): boolean =>
  SPECS[capability].byDefault(tier);

export function isConfigurable(capability: Capability, tier: number): boolean {
  const floor = SPECS[capability].floor;
  return floor !== null && tier >= floor && tier < TIER.owner;
}

export function effectivePermissions(
  tier: number,
  overrides: ReadonlyMap<Capability, boolean>,
): Set<Capability> {
  const granted = new Set<Capability>();
  for (const capability of CAPABILITIES) {
    const override = isConfigurable(capability, tier) ? overrides.get(capability) : undefined;
    if (override ?? defaultGrant(capability, tier)) granted.add(capability);
  }
  return granted;
}

interface Actor {
  readonly tier: number;
  readonly permissions: ReadonlySet<Capability>;
}

/** Below your own tier, configurable there, and — for an admin — held yourself. */
export function canEditCell(actor: Actor, tier: number, capability: Capability): boolean {
  if (actor.tier < TIER.admin) return false;
  if (!isConfigurable(capability, tier)) return false;
  if (tier >= actor.tier) return false;
  return actor.tier >= TIER.owner || actor.permissions.has(capability);
}

/** Someone else's post, strictly below the actor's tier, never as an owner. */
export function mayModerate(actor: Actor, subjectTier: number): boolean {
  return (
    actor.permissions.has('moderate') && actor.tier < TIER.owner && subjectTier < actor.tier
  );
}

/**
 * An author moving their own post: never above themselves, narrowing always,
 * widening with `postBelow`, and not a post a moderator pinned above them.
 * `current` is where it lives; `next` null means "follow me".
 */
export function canSetOwnTier(author: Actor, current: number, next: number | null): boolean {
  if (author.tier < TIER.limited || author.tier >= TIER.owner) return false;
  if (current > author.tier) return false;
  const target = next ?? author.tier;
  if (target < TIER.limited || target > author.tier) return false;
  return target >= current || author.permissions.has('postBelow');
}

export function canAdjustOwnTier(author: Actor, current: number): boolean {
  if (author.tier < TIER.limited || author.tier >= TIER.owner || current > author.tier) return false;
  if (current < author.tier) return true;
  return author.tier > TIER.limited && author.permissions.has('postBelow');
}

const LABELS: Readonly<Record<number, AuthorTierLabel>> = {
  [TIER.limited]: 'limited',
  [TIER.full]: 'full',
  [TIER.staff]: 'staff',
  [TIER.admin]: 'admin',
  [TIER.owner]: 'owner',
};

export function permissionMatrix(
  actor: Actor,
  grantsFor: (tier: number) => ReadonlySet<Capability>,
): PermissionMatrix {
  const columns: number[] = [];
  for (let tier = TIER.limited; tier <= Math.min(actor.tier, TIER.owner); tier += 1) {
    columns.push(tier);
  }

  const rows: MatrixRow[] = [];
  for (const capability of CAPABILITIES) {
    const cells = columns.map((tier) => ({
      tier,
      granted: grantsFor(tier).has(capability),
      editable: canEditCell(actor, tier, capability),
    }));
    if (cells.some((cell) => cell.granted || cell.editable)) {
      rows.push({ capability, locked: SPECS[capability].floor === null, cells });
    }
  }

  return {
    tiers: columns.flatMap((tier) => {
      const label = LABELS[tier];
      return label === undefined ? [] : [{ tier, label }];
    }),
    rows,
  };
}
