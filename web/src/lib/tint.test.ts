import { describe, expect, it } from 'vitest';
import { hueFor, tintChip, tintDot, tintEdge } from '@/lib/tint';

describe('tint', () => {
  it('is deterministic and in range', () => {
    expect(hueFor('memes')).toBe(hueFor('memes'));
    expect(hueFor('memes')).not.toBe(hueFor('tech'));
    for (const seed of ['memes', 'tech', 'a', '', 'example.org', 'a-very-long-category-slug']) {
      expect(hueFor(seed)).toBeGreaterThanOrEqual(0);
      expect(hueFor(seed)).toBeLessThan(360);
    }
  });

  it('varies only the hue, leaving lightness and chroma to the theme', () => {
    // If a component could set the whole colour, dark mode would need a second
    // seed table. One variable is the whole contract.
    const dot = tintDot('memes');
    expect(dot['--hue' as keyof typeof dot]).toBe(String(hueFor('memes')));
    expect(dot.backgroundColor).toBe('oklch(var(--tint-dot-l) var(--tint-dot-c) var(--hue))');
  });

  it('paints one edge, so the sliver cannot be flattened by a border utility', () => {
    // Regression: this used to be a class in the components layer, which loses
    // to `border-border` in the utilities layer — the tint silently vanished.
    expect(tintEdge('memes', 'left')).toMatchObject({
      borderLeftColor: 'oklch(var(--tint-edge-l) var(--tint-edge-c) var(--hue))',
    });
    expect(tintEdge('memes', 'top')).toMatchObject({
      borderTopColor: 'oklch(var(--tint-edge-l) var(--tint-edge-c) var(--hue))',
    });
    expect(tintEdge('memes', 'left')).not.toHaveProperty('borderTopColor');
  });

  it('gives the chip a foreground that follows the theme', () => {
    expect(tintChip('example.org').color).toBe('var(--tint-chip-fg)');
  });
});
