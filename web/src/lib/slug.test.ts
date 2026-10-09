import { describe, expect, it } from 'vitest';
import { isValidTagSlug, toTagSlug } from '@/lib/slug';

describe('toTagSlug', () => {
  it('collapses the spellings that would otherwise become separate tags', () => {
    expect(toTagSlug('Self Hosting')).toBe('self-hosting');
    expect(toTagSlug('  self   hosting  ')).toBe('self-hosting');
    expect(toTagSlug('Self-Hosting!')).toBe('self-hosting');
    expect(toTagSlug('café')).toBe('cafe');
  });

  it('never leaves a trailing separator, including after truncation', () => {
    const long = toTagSlug('a'.repeat(20) + ' ' + 'b'.repeat(20));
    expect(long).not.toMatch(/-$/);
    expect(long.length).toBeLessThanOrEqual(24);
  });

  it('rejects what is left of nonsense', () => {
    expect(isValidTagSlug(toTagSlug('!!!'))).toBe(false);
    expect(isValidTagSlug(toTagSlug('a'))).toBe(false);
    expect(isValidTagSlug(toTagSlug('go'))).toBe(true);
  });
});
