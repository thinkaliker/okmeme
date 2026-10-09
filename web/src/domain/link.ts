import type { Author } from '@/domain/author';
export type { Author };

export interface Category {
  readonly slug: string;
  /** Server-chosen i18n key; category names are never assembled client-side. */
  readonly nameKey: string;
  /** Fallback for instance-defined categories with no catalogue entry. */
  readonly name: string;
}

export interface Tag {
  readonly slug: string;
  readonly name: string;
  /**
   * Proposed by an author and not yet approved by staff.
   *
   * A pending tag is applied to its post immediately but is only *shown* to the
   * person who proposed it and to staff and above — everyone else gets the post
   * with the tag absent. Otherwise one user could put a word of their choosing
   * in front of every reader without anyone approving it.
   *
   * Only tiers below staff can produce one: staff and above create tags
   * outright. That is what keeps this from leaking — every pending tag comes
   * from someone the reviewer can already see.
   */
  readonly pending: boolean;
}

/** A tag waiting on review. Never carries a count of anything. */
export interface TagProposal {
  readonly slug: string;
  readonly name: string;
  readonly proposedAt: string;
  /** Resolved by the server like every other author reference. */
  readonly proposedBy: Author;
}

export type MediaType = 'image' | 'video' | 'audio';

interface LinkCommon {
  readonly publicId: string;
  readonly title: string;
  readonly author: Author;
  readonly category: Category;
  readonly tags: readonly Tag[];
  readonly score: number;
  /** The viewer's own vote, never anyone else's. */
  readonly viewerVote: 1 | 0;
  readonly bookmarked: boolean;
  readonly isNsfw: boolean;
  readonly createdAt: string;
  /** Present when edited: the public marker, with no actor and no diff. */
  readonly editedAt: string | null;
  /** Set when a moderator removed it. The actor is always "moderator". */
  readonly removed: RemovalNotice | null;
}

export interface RemovalNotice {
  readonly at: string;
  /** Reason category key, or null. Never carries an actor or a tier. */
  readonly reasonKey: string | null;
}

/**
 * Three kinds as a real discriminated union rather than a sentinel url. The old
 * card branched on `link === '#'` to mean "text post"; that is a data model
 * hiding in a string comparison.
 */
export type Link =
  | (LinkCommon & {
      readonly kind: 'link';
      readonly url: string;
      /** Host only, computed server-side — the client never parses a URL to display it. */
      readonly host: string;
      /** Key into okmeme's own /thumb origin. Never a third-party URL. */
      readonly thumbKey: string | null;
      /**
       * The site's icon, fetched once at submission and re-served from okmeme,
       * exactly like a thumbnail. Null when the site has none.
       *
       * It is a key rather than a URL for the reason every other image is: a
       * `<img>` pointing at the target site would hand that site the IP of
       * everyone who loads the feed, and in a tiered system that is an attack,
       * not a privacy nitpick — a favicon is enough to count your readers.
       */
      readonly faviconKey: string | null;
      readonly body: string | null;
    })
  | (LinkCommon & {
      readonly kind: 'text';
      readonly body: string;
    })
  | (LinkCommon & {
      readonly kind: 'media';
      readonly url: string;
      readonly host: string;
      readonly mediaType: MediaType;
      readonly thumbKey: string | null;
      readonly faviconKey: string | null;
      readonly body: string | null;
    });

export type LinkKind = Link['kind'];

export type FeedSort = 'new' | 'top';

export interface FeedQuery {
  readonly cursor?: string | null;
  readonly limit?: number;
  readonly category?: string | null;
  readonly tag?: string | null;
  readonly sort?: FeedSort;
}

export interface SearchQuery extends FeedQuery {
  readonly q: string;
  readonly bookmarked?: boolean;
}

export interface SubmitDraft {
  readonly kind: LinkKind;
  readonly title: string;
  readonly url: string;
  readonly body: string;
  readonly categorySlug: string;
  readonly tagSlugs: readonly string[];
  /**
   * Free text the author typed. The server slugifies and decides what each one
   * becomes: an existing tag applied, or a proposal queued for staff.
   */
  readonly newTagNames: readonly string[];
  readonly isNsfw: boolean;
}

/**
 * Result of `POST /links/preview`. `duplicate` is scoped to what the submitter
 * can already see — a global check would confirm the existence of content they
 * are not allowed to know about.
 */
export interface PreviewResult {
  readonly canonicalUrl: string;
  readonly title: string | null;
  readonly host: string;
  readonly thumbKey: string | null;
  readonly duplicate: { readonly publicId: string; readonly title: string } | null;
}
