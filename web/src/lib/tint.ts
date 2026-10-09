import type { CSSProperties } from 'react';

/**
 * A stable colour per thing, derived from a string.
 *
 * Only two seeds are ever allowed: a category slug and a link's host. Both are
 * already on screen, so the colour tells a viewer nothing they were not already
 * shown.
 *
 * **Never seed this with an author.** A stable colour attached to an identity is
 * a correlation handle, and above-tier authors exist precisely so there is
 * nothing to correlate — two `[full]` posts must stay indistinguishable, and a
 * per-author tint would quietly undo that in a way no test would catch.
 */
export function hueFor(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }
  return hash;
}

/*
 * These are inline styles rather than CSS classes on purpose.
 *
 * A class in the `components` layer loses to any utility in the `utilities`
 * layer, so `border-border` on the same element silently beat a `.tint-edge`
 * class and the tinted sliver rendered in the default border grey. Nothing
 * errored; the colour was simply gone. Inline wins over every layer, so the
 * tint cannot be switched off by adding an unrelated utility later.
 *
 * Hue is the only per-item value. Lightness and chroma come from theme
 * variables, so one seed reads correctly in light and dark rather than being a
 * light-mode colour that has to be re-picked for dark.
 */
const DOT = 'oklch(var(--tint-dot-l) var(--tint-dot-c) var(--hue))';
const EDGE = 'oklch(var(--tint-edge-l) var(--tint-edge-c) var(--hue))';
const CHIP = 'oklch(var(--tint-chip-l) var(--tint-chip-c) var(--hue))';

function hue(seed: string): CSSProperties {
  return { '--hue': String(hueFor(seed)) } as CSSProperties;
}

/** Solid dot, for a category in the nav. */
export function tintDot(seed: string): CSSProperties {
  return { ...hue(seed), backgroundColor: DOT };
}

/** The sliver down the left of a row, or across the top of a gallery tile. */
export function tintEdge(seed: string, side: 'left' | 'top'): CSSProperties {
  return {
    ...hue(seed),
    ...(side === 'left' ? { borderLeftColor: EDGE } : { borderTopColor: EDGE }),
  };
}

/** Small filled square carrying a letter. */
export function tintChip(seed: string): CSSProperties {
  return { ...hue(seed), backgroundColor: CHIP, color: 'var(--tint-chip-fg)' };
}

/** First character of a host, for the small square chip. Falls back to nothing. */
export function hostInitial(host: string): string {
  return (host[0] ?? '').toUpperCase();
}
