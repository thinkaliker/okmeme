import type { AuthorTierLabel } from '@/domain/tier';

/**
 * Authorship arrives already resolved for this viewer. The union is the point:
 * on the `tier` branch there is no `id` property to read, because the server
 * omits it from the payload entirely — not present-and-null. Shipping identity
 * to the browser and suppressing it in the UI is how systems like this leak.
 *
 * Above-tier authors are deliberately indistinguishable from each other. Two
 * `{ kind: 'tier', label: 'full' }` values may be one person or twelve, and
 * nothing in the client may try to tell them apart.
 */
export type Author =
  | { readonly kind: 'user'; readonly id: string; readonly name: string }
  | { readonly kind: 'tier'; readonly label: AuthorTierLabel };

/**
 * Thread-scoped discriminator for above-tier participants (`[full]`, `[full 2]`).
 * Reserved for comments, which are not built — see GAPS.md. It is meaningless
 * outside its thread and must never be persisted or correlated across threads.
 */
export type ThreadDiscriminator = number;
