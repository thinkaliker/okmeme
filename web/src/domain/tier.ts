/**
 * Tiers are integer ordinals, never enum strings — every rule in the model is a
 * comparison (`effective <= viewer + 1`) and that only works on ordinals.
 *
 * Viewer tiers and content tiers are branded separately so the compiler rejects
 * `isWithinRing(effective, viewer)`. Getting that pair backwards is a silent
 * privacy bug in plain JavaScript: it still returns a boolean, just the wrong one.
 */
declare const tierBrand: unique symbol;

type Branded<Name extends string> = number & { readonly [tierBrand]: Name };

/** The tier of whoever is asking. Anonymous is a state, not an account. */
export type ViewerTier = Branded<'ViewerTier'>;

/** `COALESCE(links.pinned_tier, author.tier)` — the tier content lives at. */
export type EffectiveTier = Branded<'EffectiveTier'>;

export const TIER = {
  anonymous: 0,
  limited: 1,
  full: 2,
  staff: 3,
  admin: 4,
  owner: 5,
} as const;

export type TierOrdinal = (typeof TIER)[keyof typeof TIER];

const ORDINALS: readonly number[] = Object.values(TIER);

function assertOrdinal(value: number): void {
  if (!ORDINALS.includes(value)) {
    throw new RangeError(`not a tier ordinal: ${value}`);
  }
}

export function viewerTier(value: number): ViewerTier {
  assertOrdinal(value);
  return value as ViewerTier;
}

export function effectiveTier(value: number): EffectiveTier {
  assertOrdinal(value);
  return value as EffectiveTier;
}

export const ANONYMOUS: ViewerTier = viewerTier(TIER.anonymous);

/**
 * Tier names the server may put on an above-tier author. Anonymous viewers see
 * `limited`; nobody ever sees `anonymous` as an attribution.
 */
export const AUTHOR_TIER_LABELS = ['limited', 'full', 'staff', 'admin', 'owner'] as const;

export type AuthorTierLabel = (typeof AUTHOR_TIER_LABELS)[number];

export function isAuthorTierLabel(value: unknown): value is AuthorTierLabel {
  return typeof value === 'string' && (AUTHOR_TIER_LABELS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ *
 * The ring rule.
 *
 * The browser is not where this is enforced — the server filters in SQL and
 * ships an already-resolved payload. These live here for the dev fake in
 * src/api/mock, which stands in for that predicate, and so there is exactly one
 * written-down copy of the rule on this side of the wire.
 * ------------------------------------------------------------------ */

/** `E <= T + 1`. Anything above that does not exist for this viewer. */
export function isWithinRing(viewer: ViewerTier, effective: EffectiveTier): boolean {
  return effective <= viewer + 1;
}

/** `E <= T` — the only case where a real username may be attached. */
export function isIdentified(viewer: ViewerTier, effective: EffectiveTier): boolean {
  return effective <= viewer;
}

/** `E == T + 1` — visible, but as a bare tier name with no id in the payload. */
export function isOneRungUp(viewer: ViewerTier, effective: EffectiveTier): boolean {
  return effective === viewer + 1;
}

/* ------------------------------------------------------------------ *
 * Capabilities.
 *
 * Presentation only. Hiding a control is not authorization — every one of these
 * is enforced again on the server, and the admin routes are gated there.
 * ------------------------------------------------------------------ */

/** Owner is recovery and system settings only: it cannot post, comment, or vote. */
function isParticipant(viewer: ViewerTier): boolean {
  return viewer >= TIER.limited && viewer < TIER.owner;
}

export const can = {
  submit: isParticipant,
  vote: isParticipant,
  comment: isParticipant,
  bookmark: (viewer: ViewerTier) => viewer >= TIER.limited,
  postNsfw: (viewer: ViewerTier) => viewer >= TIER.full && viewer < TIER.owner,
  seeNsfw: (viewer: ViewerTier) => viewer >= TIER.full,
  createTags: (viewer: ViewerTier) => viewer >= TIER.staff && viewer < TIER.owner,
  moderateContent: (viewer: ViewerTier) => viewer >= TIER.staff && viewer < TIER.owner,
  createCategories: (viewer: ViewerTier) => viewer >= TIER.admin && viewer < TIER.owner,
  issueInvites: (viewer: ViewerTier) => viewer >= TIER.admin && viewer < TIER.owner,
  reviewReports: (viewer: ViewerTier) => viewer >= TIER.admin && viewer < TIER.owner,
  readAuditLog: (viewer: ViewerTier) => viewer >= TIER.admin,
  ownerSettings: (viewer: ViewerTier) => viewer >= TIER.owner,
} as const;
