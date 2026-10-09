import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { DisplayProvider } from '@/display/DisplayProvider';
import { router } from '@/router';
import { SessionProvider } from '@/session/SessionProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';

/** The whole tree, mounted: shell, lazy route, mock transport, first page. */
afterEach(cleanup);

describe('the app', () => {
  it('mounts and renders a feed for an anonymous viewer', async () => {
    render(
      <ThemeProvider>
        <DisplayProvider>
          <SessionProvider>
            <RouterProvider router={router} />
          </SessionProvider>
        </DisplayProvider>
      </ThemeProvider>,
    );

    // The shell is present before the route chunk resolves.
    expect(await screen.findByRole('banner')).toBeDefined();
    expect(await screen.findByRole('main')).toBeDefined();

    const cards = await screen.findAllByRole('article', {}, { timeout: 4000 });
    expect(cards.length).toBeGreaterThan(0);

    // Anonymous: everything visible is one rung up and therefore unattributed.
    expect(screen.getAllByText('limited').length).toBe(cards.length);
    expect(screen.queryByRole('button', { name: /report/i })).toBeNull();
  });
});
