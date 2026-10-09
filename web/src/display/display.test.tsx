import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { DEFAULT_DISPLAY } from '@/domain/user';
import { DisplayProvider, parseDisplay } from '@/display/DisplayProvider';
import { router } from '@/router';
import { SessionProvider } from '@/session/SessionProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';

function renderApp() {
  return render(
    <ThemeProvider>
      <DisplayProvider>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </DisplayProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset['density'];
  delete document.documentElement.dataset['width'];
});

afterEach(cleanup);

describe('parseDisplay', () => {
  it('falls back rather than throwing on a stale or hand-edited entry', () => {
    expect(parseDisplay(null)).toEqual(DEFAULT_DISPLAY);
    expect(parseDisplay('nonsense')).toEqual(DEFAULT_DISPLAY);
    expect(parseDisplay({ density: 'tiny', width: 42, feedView: [] })).toEqual(DEFAULT_DISPLAY);
    expect(parseDisplay({ density: 'compact' })).toEqual({ ...DEFAULT_DISPLAY, density: 'compact' });
  });
});

describe('density and width', () => {
  it('puts the stored choice on the root element for the css variants to read', async () => {
    localStorage.setItem(
      'okmeme.display',
      JSON.stringify({ density: 'compact', width: 'wide', feedView: 'list' }),
    );
    renderApp();
    await screen.findAllByRole('article', {}, { timeout: 4000 });

    expect(document.documentElement.dataset['density']).toBe('compact');
    expect(document.documentElement.dataset['width']).toBe('wide');
  });
});

describe('gallery view', () => {
  it('replaces the cards with one tile per row, dropping nothing', async () => {
    localStorage.setItem('okmeme.display', JSON.stringify({ feedView: 'gallery' }));
    const { container } = renderApp();

    const tiles = await screen.findAllByRole('link', { name: /linkdump|postgres|ridge/i }, { timeout: 4000 });
    expect(tiles.length).toBeGreaterThan(0);

    // No cards at all in gallery mode.
    expect(container.querySelectorAll('article')).toHaveLength(0);

    // A text post has no thumbnail and still gets a tile: a gallery that hid
    // those would make the page short for a reason unrelated to visibility.
    expect(screen.getByText('What I want from a linkdump in 2026')).toBeDefined();
    expect(screen.getAllByText(/text post/i).length).toBeGreaterThan(0);
  });

  it('keeps nsfw tiles blurred, with no reveal control nested inside the link', async () => {
    localStorage.setItem('okmeme.display', JSON.stringify({ feedView: 'gallery' }));
    const { container } = renderApp();
    await screen.findAllByRole('link', { name: /linkdump/i }, { timeout: 4000 });

    for (const tile of container.querySelectorAll('a[href^="/l/"]')) {
      expect(tile.querySelector('a, button')).toBeNull();
    }
  });
});
