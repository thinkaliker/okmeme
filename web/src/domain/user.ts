import type { TierOrdinal, ViewerTier } from '@/domain/tier';

export type SuspensionType = 'mute' | 'submission_ban' | 'lockout' | 'content_hold';

export type ReasonCategory = 'spam' | 'abuse' | 'nsfw' | 'other';

/**
 * What `GET /me` carries about an active sanction. The note is written by
 * someone who can see everything, for someone who cannot — it may never name a
 * reporter or reference content above the user's tier. The client renders it
 * verbatim and adds no actor of its own.
 */
export interface Sanction {
  readonly id: string;
  readonly types: readonly SuspensionType[];
  /** null means indefinite. */
  readonly expiresAt: string | null;
  readonly reasonCategory: ReasonCategory;
  readonly note: string | null;
  /** One appeal per sanction, enforced by a unique constraint server-side. */
  readonly appealFiled: boolean;
}

export type ThemePreference = 'system' | 'light' | 'dark';

/** How much padding a row gets. Presentation only — it changes no query. */
export type Density = 'comfortable' | 'compact';

/** How much of the window the list may use. */
export type Width = 'normal' | 'wide';

/** List of rows, or a grid of thumbnails. */
export type FeedView = 'list' | 'gallery';

export interface DisplayPreferences {
  readonly density: Density;
  readonly width: Width;
  readonly feedView: FeedView;
}

export const DEFAULT_DISPLAY: DisplayPreferences = {
  density: 'comfortable',
  width: 'normal',
  feedView: 'list',
};

/** The signed-in viewer. Anonymous is the absence of this object, not a tier-0 one. */
export interface Me {
  readonly publicId: string;
  readonly username: string;
  readonly tier: TierOrdinal;
  readonly showNsfw: boolean;
  readonly theme: ThemePreference;
  readonly display: DisplayPreferences;
  readonly unreadNotifications: number;
  readonly sanction: Sanction | null;
  readonly createdAt: string;
}

export interface Session {
  readonly me: Me | null;
  readonly tier: ViewerTier;
}

export interface MePatch {
  readonly showNsfw?: boolean;
  readonly theme?: ThemePreference;
  readonly display?: Partial<DisplayPreferences>;
}
