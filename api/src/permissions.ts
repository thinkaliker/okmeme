import { TIER, can, tierLabel, type AuthorTierLabel } from './tier.js';

/**
 * Per-tier permissions, adjustable roughly the way Discord roles are: an admin
 * or owner may change what a tier *below their own* is allowed to do, and an
 * admin may only hand out — or take away — something they hold themselves.
 *
 * Not everything in the model is a permission. Some rows are rules the ring
 * depends on, and making them adjustable would let a settings page undo the
 * visibility model:
 *
 * - **seeing NSFW** is a clause in the feed predicate, not a capability.
 * - **issuing invites** below admin builds a cross-tier identity graph; it is
 *   governed by the owner-only `invite_min_tier` and nothing else.
 * - **reports, the audit log, revisions** carry real names from every tier, so
 *   they stay where everything is already visible.
 * - **reviewing tags** is pinned at staff so a proposer is never more than one
 *   rung above the reviewer who sees their label.
 * - **the owner column** never changes: an owner cannot post, comment or vote,
 *   and nobody sits above an owner to change that.
 *
 * Those rows still appear in the table so it tells the whole truth, but no cell
 * in them is ever editable.
 *
 * web/src/domain/permissions.ts mirrors the catalogue for the dev fake. This
 * copy decides what exists.
 */

export const CAPABILITIES = [
  'submit',
  'vote',
  'bookmark',
  'editOwn',
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

export const isCapability = (value: unknown): value is Capability =>
  typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value);

interface Spec {
  /** Who holds it on an instance nobody has adjusted. */
  readonly byDefault: (tier: number) => boolean;
  /**
   * The lowest tier this may ever be granted to, or null when it is fixed.
   *
   * `postNsfw` starts at full because limited never receives NSFW rows — a
   * limited author could not see their own post. `moderate` starts at full
   * because a limited moderator would have nobody below them to moderate.
   */
  readonly floor: number | null;
}

const isParticipant = (tier: number): boolean => tier >= TIER.limited && tier < TIER.owner;

const SPECS: Readonly<Record<Capability, Spec>> = {
  submit: { byDefault: can.submit, floor: TIER.limited },
  vote: { byDefault: can.vote, floor: TIER.limited },
  bookmark: { byDefault: can.bookmark, floor: TIER.limited },
  editOwn: { byDefault: isParticipant, floor: TIER.limited },
  postNsfw: { byDefault: can.postNsfw, floor: TIER.full },
  createTags: { byDefault: can.createTags, floor: TIER.limited },
  moderate: { byDefault: can.moderateContent, floor: TIER.full },

  seeNsfw: { byDefault: can.seeNsfw, floor: null },
  reviewTags: { byDefault: (tier) => tier >= TIER.staff, floor: null },
  retier: { byDefault: (tier) => tier === TIER.admin, floor: null },
  issueInvites: { byDefault: can.issueInvites, floor: null },
  reviewReports: { byDefault: can.reviewReports, floor: null },
  manageCategories: { byDefault: can.createCategories, floor: null },
  readAuditLog: { byDefault: can.readAuditLog, floor: null },
  ownerSettings: { byDefault: can.ownerSettings, floor: null },
};

export const defaultGrant = (capability: Capability, tier: number): boolean =>
  SPECS[capability].byDefault(tier);

export const isLocked = (capability: Capability): boolean => SPECS[capability].floor === null;

/** Whether this cell can ever differ from its default, by anyone. */
export function isConfigurable(capability: Capability, tier: number): boolean {
  const floor = SPECS[capability].floor;
  return floor !== null && tier >= floor && tier < TIER.owner;
}

export type Overrides = ReadonlyMap<Capability, boolean>;

/**
 * Defaults, with stored overrides applied only where a cell is configurable.
 * An override on a locked cell — left by a bad write or a future catalogue
 * change — is ignored rather than trusted.
 */
export function effectivePermissions(tier: number, overrides: Overrides): Set<Capability> {
  const granted = new Set<Capability>();
  for (const capability of CAPABILITIES) {
    const override = isConfigurable(capability, tier) ? overrides.get(capability) : undefined;
    if (override ?? defaultGrant(capability, tier)) granted.add(capability);
  }
  return granted;
}

export interface PermissionActor {
  readonly tier: number;
  readonly permissions: ReadonlySet<Capability>;
}

/**
 * The Discord rule. Admin and owner only; strictly below your own tier; and an
 * admin cannot hand out or take away a permission they do not hold. Owners are
 * exempt from the last part — they hold almost nothing themselves, by design,
 * and are the ones who set the instance up.
 */
export function canEditCell(actor: PermissionActor, tier: number, capability: Capability): boolean {
  if (actor.tier < TIER.admin) return false;
  if (!isConfigurable(capability, tier)) return false;
  if (tier >= actor.tier) return false;
  return actor.tier >= TIER.owner || actor.permissions.has(capability);
}

/**
 * Editing or removing someone else's post: the permission, and the structural
 * half that no setting changes — strictly below your own tier, never sideways
 * or up, and never as an owner.
 */
export function mayModerate(actor: PermissionActor, subjectTier: number): boolean {
  return (
    actor.permissions.has('moderate') && actor.tier < TIER.owner && subjectTier < actor.tier
  );
}

/* ---------------------------------------------------------------- the table */

export interface MatrixCell {
  readonly tier: number;
  readonly granted: boolean;
  readonly editable: boolean;
}

export interface MatrixRow {
  readonly capability: Capability;
  readonly locked: boolean;
  readonly cells: readonly MatrixCell[];
}

export interface Matrix {
  readonly tiers: readonly { readonly tier: number; readonly label: AuthorTierLabel }[];
  readonly rows: readonly MatrixRow[];
}

/**
 * The table a viewer sees on their account page.
 *
 * Columns stop at the viewer's own tier. The ring lets you see one rung up, but
 * a column of what that rung may do says more about it than a bare label, and
 * "the number of tiers above you is not discoverable through the interface".
 *
 * A row appears only when some visible column holds it or the viewer can edit
 * it. A limited user's table is therefore four rows long and says nothing about
 * invite queues or audit logs. Omission is safe because the set of rows is not
 * itself something a viewer can see.
 */
export function permissionMatrix(
  actor: PermissionActor,
  grantsFor: (tier: number) => ReadonlySet<Capability>,
): Matrix {
  const columns: number[] = [];
  for (let tier = TIER.limited; tier <= Math.min(actor.tier, TIER.owner); tier += 1) {
    columns.push(tier);
  }

  const grants = new Map(columns.map((tier) => [tier, grantsFor(tier)]));

  const rows: MatrixRow[] = [];
  for (const capability of CAPABILITIES) {
    const cells = columns.map<MatrixCell>((tier) => ({
      tier,
      granted: grants.get(tier)?.has(capability) ?? false,
      editable: canEditCell(actor, tier, capability),
    }));
    if (cells.some((cell) => cell.granted || cell.editable)) {
      rows.push({ capability, locked: isLocked(capability), cells });
    }
  }

  return {
    tiers: columns.map((tier) => ({ tier, label: tierLabel(tier) })),
    rows,
  };
}
