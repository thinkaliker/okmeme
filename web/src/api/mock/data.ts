import type { Category, MediaType, Tag } from '@/domain/link';
import type { NotificationKind } from '@/domain/notification';
import { TIER, type TierOrdinal } from '@/domain/tier';

/**
 * Fixtures for the in-browser fake. Shaped like rows, not like responses: the
 * fake has to do the same resolution the server does, so it must start from
 * unresolved data. If these were pre-resolved payloads the mock would prove
 * nothing about the ring model.
 */

export interface MockUser {
  readonly id: number;
  readonly publicId: string;
  readonly username: string;
  readonly tier: TierOrdinal;
  readonly contentHold?: boolean;
}

export interface MockLink {
  readonly id: number;
  readonly publicId: string;
  readonly kind: 'link' | 'text' | 'media';
  readonly title: string;
  readonly url?: string;
  readonly mediaType?: MediaType;
  readonly body?: string;
  readonly authorId: number;
  /** Moderator re-tier. Freezes visibility regardless of the author's tier. */
  readonly pinnedTier?: TierOrdinal;
  readonly categorySlug: string;
  readonly tagSlugs: readonly string[];
  readonly isNsfw: boolean;
  readonly score: number;
  readonly minutesAgo: number;
  readonly editedMinutesAgo?: number;
  readonly removedReasonKey?: string;
}

export const MOCK_USERS: readonly MockUser[] = [
  { id: 1, publicId: 'u_dana', username: 'dana', tier: TIER.limited },
  { id: 2, publicId: 'u_kes', username: 'kes', tier: TIER.limited },
  { id: 3, publicId: 'u_sandra', username: 'sandra', tier: TIER.full },
  { id: 4, publicId: 'u_mo', username: 'mo', tier: TIER.full },
  { id: 5, publicId: 'u_vye', username: 'vye', tier: TIER.full, contentHold: true },
  { id: 6, publicId: 'u_pip', username: 'pip', tier: TIER.staff },
  { id: 7, publicId: 'u_root', username: 'root', tier: TIER.admin },
  { id: 8, publicId: 'u_keeper', username: 'keeper', tier: TIER.owner },
];

export const MOCK_CATEGORIES: readonly Category[] = [
  { slug: 'music', nameKey: 'category.music', name: 'Music' },
  { slug: 'videos', nameKey: 'category.videos', name: 'Videos' },
  { slug: 'images', nameKey: 'category.images', name: 'Images' },
  { slug: 'games', nameKey: 'category.games', name: 'Games' },
  { slug: 'code', nameKey: 'category.code', name: 'Code' },
  { slug: 'tech', nameKey: 'category.tech', name: 'Tech' },
  { slug: 'outside', nameKey: 'category.outside', name: 'Outside' },
  { slug: 'food', nameKey: 'category.food', name: 'Food' },
  { slug: 'memes', nameKey: 'category.memes', name: 'Memes' },
];

/** Seeded as approved; the mock adds the `pending` flag when it serves them. */
export const MOCK_TAGS: readonly Omit<Tag, 'pending'>[] = [
  { slug: 'electronic', name: 'electronic' },
  { slug: 'longread', name: 'longread' },
  { slug: 'selfhost', name: 'selfhost' },
  { slug: 'postgres', name: 'postgres' },
  { slug: 'gif', name: 'gif' },
  { slug: 'howto', name: 'howto' },
  { slug: 'hardware', name: 'hardware' },
  { slug: 'recipes', name: 'recipes' },
];

export const MOCK_LINKS: readonly MockLink[] = [
  {
    id: 101,
    publicId: 'l_9fk21a',
    kind: 'link',
    title: 'Postgres full-text search is enough for most people',
    url: 'https://pgnotes.example.org/fts-is-enough',
    authorId: 1,
    categorySlug: 'code',
    tagSlugs: ['postgres', 'longread'],
    isNsfw: false,
    score: 14,
    minutesAgo: 12,
  },
  {
    id: 102,
    publicId: 'l_2mq80c',
    kind: 'text',
    title: 'What I want from a linkdump in 2026',
    body: 'Short list. No algorithmic feed. No infinite scroll that hijacks the scrollbar. No account required to read, but reading is all you get without one.\n\nThe thing I keep coming back to is that every site I liked died the same way: it got discovered. Growth was the goal and the goal was the problem. If nobody can find you, nobody has to moderate the people who found you.',
    authorId: 2,
    categorySlug: 'tech',
    tagSlugs: ['longread'],
    isNsfw: false,
    score: 8,
    minutesAgo: 45,
  },
  {
    id: 103,
    publicId: 'l_7xz44b',
    kind: 'media',
    title: 'cat knocks over an entire rack, walks away',
    url: 'https://media.example.net/rack.gif',
    mediaType: 'image',
    authorId: 3,
    categorySlug: 'memes',
    tagSlugs: ['gif'],
    isNsfw: false,
    score: 96,
    minutesAgo: 70,
  },
  {
    id: 104,
    publicId: 'l_5tt19d',
    kind: 'link',
    title: 'Self-hosting without email: recovery codes as the only reset path',
    url: 'https://keys.example.org/no-email-auth',
    authorId: 3,
    categorySlug: 'code',
    tagSlugs: ['selfhost', 'howto'],
    isNsfw: false,
    score: 31,
    minutesAgo: 130,
    editedMinutesAgo: 90,
  },
  {
    id: 105,
    publicId: 'l_1aa02e',
    kind: 'media',
    title: 'field recording — 3am, empty car park, one very committed bird',
    url: 'https://sounds.example.net/3am.mp3',
    mediaType: 'audio',
    authorId: 4,
    categorySlug: 'music',
    tagSlugs: ['electronic'],
    isNsfw: false,
    score: 22,
    minutesAgo: 200,
  },
  {
    id: 106,
    publicId: 'l_8kd77f',
    kind: 'link',
    title: 'The invite is the growth control, not the rate limiter',
    url: 'https://invites.example.com/growth',
    authorId: 6,
    categorySlug: 'tech',
    tagSlugs: ['longread'],
    isNsfw: false,
    score: 40,
    minutesAgo: 260,
  },
  {
    id: 107,
    publicId: 'l_3nn55g',
    kind: 'text',
    title: 'staff note: tag naming, please read before creating more',
    body: 'Tags are cheap but not free. Before you create one, check whether an existing tag covers it. Categories are the top-level axis and only admins make those; tags filter inside a category or across the whole site.',
    authorId: 6,
    categorySlug: 'code',
    tagSlugs: [],
    isNsfw: false,
    score: 11,
    minutesAgo: 320,
  },
  {
    id: 108,
    publicId: 'l_6pp31h',
    kind: 'link',
    title: 'admin: instance settings and what invite_min_tier actually does',
    url: 'https://example.org/invite-min-tier',
    authorId: 7,
    categorySlug: 'tech',
    tagSlugs: ['selfhost'],
    isNsfw: false,
    score: 5,
    minutesAgo: 400,
  },
  {
    id: 109,
    publicId: 'l_4ss66i',
    kind: 'media',
    title: 'not safe for the office, genuinely',
    url: 'https://media.example.net/nsfw.jpg',
    mediaType: 'image',
    authorId: 4,
    categorySlug: 'images',
    tagSlugs: [],
    isNsfw: true,
    score: 17,
    minutesAgo: 150,
  },
  {
    id: 110,
    publicId: 'l_0jj88j',
    kind: 'link',
    title: 'a full-tier post that a moderator pinned down to limited',
    url: 'https://retier.example.org/pinned',
    authorId: 3,
    pinnedTier: TIER.limited,
    categorySlug: 'tech',
    tagSlugs: [],
    isNsfw: false,
    score: 3,
    minutesAgo: 480,
  },
  {
    id: 111,
    publicId: 'l_1zz44k',
    kind: 'link',
    title: 'this one is under a content hold and should not appear',
    url: 'https://held.example.org/hold',
    authorId: 5,
    categorySlug: 'memes',
    tagSlugs: [],
    isNsfw: false,
    score: 2,
    minutesAgo: 90,
  },
  {
    id: 112,
    publicId: 'l_2cc77l',
    kind: 'text',
    title: 'removed: read the room',
    body: 'You cannot see this body; the row is soft-deleted.',
    authorId: 1,
    categorySlug: 'memes',
    tagSlugs: [],
    isNsfw: false,
    score: 1,
    minutesAgo: 500,
    removedReasonKey: 'sanction.reason.abuse',
  },
  {
    id: 113,
    publicId: 'l_9bb12m',
    kind: 'media',
    title: 'ten minutes of a lathe, no commentary, no music',
    url: 'https://video.example.net/lathe.mp4',
    mediaType: 'video',
    authorId: 1,
    categorySlug: 'videos',
    tagSlugs: ['hardware'],
    isNsfw: false,
    score: 27,
    minutesAgo: 610,
  },
  {
    id: 114,
    publicId: 'l_5ee90n',
    kind: 'link',
    title: 'one-pan thing, forty minutes, mostly waiting',
    url: 'https://recipes.example.com/one-pan',
    authorId: 2,
    categorySlug: 'food',
    tagSlugs: ['recipes'],
    isNsfw: false,
    score: 19,
    minutesAgo: 700,
  },
  {
    id: 115,
    publicId: 'l_7uu23o',
    kind: 'link',
    title: 'cheap NAS build that is mostly just a case',
    url: 'https://parts.example.com/nas',
    authorId: 4,
    categorySlug: 'tech',
    tagSlugs: ['hardware', 'selfhost'],
    isNsfw: false,
    score: 34,
    minutesAgo: 820,
  },
  {
    id: 116,
    publicId: 'l_3hh45p',
    kind: 'link',
    title: 'walked the whole ridge, took the wrong turn twice',
    url: 'https://trails.example.org/ridge',
    authorId: 1,
    categorySlug: 'outside',
    tagSlugs: [],
    isNsfw: false,
    score: 12,
    minutesAgo: 900,
  },
];

export interface MockNotification {
  readonly id: string;
  readonly userId: number;
  readonly kind: NotificationKind;
  readonly minutesAgo: number;
  readonly read: boolean;
  readonly subjectPublicId?: string;
  readonly subjectTitle?: string;
  readonly detailKey?: string;
  readonly note?: string;
}

export const MOCK_NOTIFICATIONS: readonly MockNotification[] = [
  {
    id: 'n_1',
    userId: 1,
    kind: 'content_removed',
    minutesAgo: 500,
    read: false,
    subjectPublicId: 'l_2cc77l',
    subjectTitle: 'removed: read the room',
    detailKey: 'sanction.reason.abuse',
    note: 'Keep it civil. This is the only warning that gets sent.',
  },
  {
    id: 'n_2',
    userId: 1,
    kind: 'tier_changed',
    minutesAgo: 4000,
    read: true,
  },
  {
    id: 'n_3',
    userId: 3,
    kind: 'content_retiered',
    minutesAgo: 480,
    read: false,
    subjectPublicId: 'l_0jj88j',
    subjectTitle: 'a full-tier post that a moderator pinned down to limited',
  },
];
