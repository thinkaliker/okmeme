import { describe, expect, it } from 'vitest';

/**
 * The files in this folder are shadcn registry components, edited. A fresh
 * `npx shadcn add` (or `--overwrite`) brings upstream's version back verbatim,
 * and two of upstream's habits break rules this app holds elsewhere. This test
 * is what notices.
 */
/*
 * No `glob<string>(`: Vitest keeps transformed modules in node_modules/.vitest-cache
 * and skips only files containing the literal text `import.meta.glob(`. With
 * a type argument in between, this file was cached with the folder listing of
 * its first run, and components added later were never checked.
 */
const raw = import.meta.glob('./*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Code only: the comments in these files name the very classes they leave out. */
const sources = Object.fromEntries(
  Object.entries(raw).map(([file, source]) => [
    file,
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''),
  ]),
);

describe('ui components', () => {
  it('were found', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(5);
  });

  /*
   * The focus indicator is the global :focus-visible outline in globals.css,
   * and nothing may remove it. Upstream swaps it for `outline-none` plus a
   * focus ring; take those classes out again after adding a component.
   */
  it.each(Object.entries(sources))('%s keeps the global focus outline', (_file, source) => {
    for (const forbidden of [/\boutline-none\b/, /\boutline-hidden\b/, /\boutline-0\b/, /\bfocus(?:-visible)?:ring/]) {
      expect(source).not.toMatch(forbidden);
    }
  });

  /*
   * Upstream imports `cn` from the `cn` npm package. This app has one class
   * merger, in @/lib/utils; point the import there instead of installing it.
   */
  it.each(Object.entries(sources))('%s takes cn from @/lib/utils', (_file, source) => {
    expect(source).not.toMatch(/from ['"]cn['"]/);
  });
});
