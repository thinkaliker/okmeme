/**
 * Tiers are integer ordinals. Every rule in the model is a comparison —
 * `effective <= viewer + 1` — and that only works on ordinals, which is why
 * this is never an enum string anywhere in the stack.
 *
 * web/src/domain/tier.ts is the mirror of this file. The client's copy exists
 * so the UI can decide what to render; this one is the copy that decides what
 * exists. Hiding a control in the browser is presentation, not authorization.
 */

export const TIER = {
  anonymous: 0,
  limited: 1,
  full: 2,
  staff: 3,
  admin: 4,
  owner: 5,
} as const;

export type TierOrdinal = (typeof TIER)[keyof typeof TIER];

export const AUTHOR_TIER_LABELS = ['limited', 'full', 'staff', 'admin', 'owner'] as const;
export type AuthorTierLabel = (typeof AUTHOR_TIER_LABELS)[number];

const LABEL_BY_ORDINAL: Readonly<Record<number, AuthorTierLabel>> = {
  [TIER.limited]: 'limited',
  [TIER.full]: 'full',
  [TIER.staff]: 'staff',
  [TIER.admin]: 'admin',
  [TIER.owner]: 'owner',
};

/**
 * The label is chosen here and shipped as a fixed key. It is never assembled
 * from parts on either side of the wire: a label that can be constructed can be
 * constructed wrongly, and this one is a security boundary rendered as a word.
 */
export function tierLabel(ordinal: number): AuthorTierLabel {
  const label = LABEL_BY_ORDINAL[ordinal];
  if (label === undefined) throw new Error(`no tier label for ordinal ${ordinal}`);
  return label;
}

/* ---------------------------------------------------------------- the ring */

/** `E <= T + 1`. Anything above does not exist for this viewer. */
export const isWithinRing = (viewer: number, effective: number): boolean =>
  effective <= viewer + 1;

/** `E <= T` — the only case where a real username may be attached. */
export const isIdentified = (viewer: number, effective: number): boolean => effective <= viewer;

/* ---------------------------------------------------------------- capabilities */

/** Owner is recovery and system settings only: it cannot post, comment, or vote. */
const isParticipant = (tier: number): boolean => tier >= TIER.limited && tier < TIER.owner;

export const can = {
  submit: isParticipant,
  vote: isParticipant,
  comment: isParticipant,
  bookmark: (tier: number) => tier >= TIER.limited,
  postNsfw: (tier: number) => tier >= TIER.full && tier < TIER.owner,
  seeNsfw: (tier: number) => tier >= TIER.full,
  createTags: (tier: number) => tier >= TIER.staff && tier < TIER.owner,
  moderateContent: (tier: number) => tier >= TIER.staff && tier < TIER.owner,
  createCategories: (tier: number) => tier >= TIER.admin && tier < TIER.owner,
  issueInvites: (tier: number) => tier >= TIER.admin && tier < TIER.owner,
  reviewReports: (tier: number) => tier >= TIER.admin && tier < TIER.owner,
  readAuditLog: (tier: number) => tier >= TIER.admin,
  adminPanel: (tier: number) => tier >= TIER.admin,
  ownerSettings: (tier: number) => tier >= TIER.owner,
} as const;

/**
 * Staff edit limited and full content; admins edit staff and below. Nobody
 * edits sideways, and admins cannot demote other admins.
 */
export const canModerateTier = (actor: number, subject: number): boolean => {
  if (actor >= TIER.owner) return false; // owner does not moderate content
  if (actor >= TIER.admin) return subject <= TIER.staff;
  if (actor >= TIER.staff) return subject <= TIER.full;
  return false;
};

/** An admin may promote up to admin; staff may promote up to full. Never above self. */
export const canSetTier = (actor: number, current: number, next: number): boolean => {
  if (actor >= TIER.owner) return true; // owners manage the owner set itself
  if (actor >= TIER.admin) return current < TIER.admin && next <= TIER.admin;
  if (actor >= TIER.staff) return current < TIER.staff && next <= TIER.full;
  return false;
};
