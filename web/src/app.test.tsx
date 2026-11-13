import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { transport } from '@/api/transport';
import { DisplayProvider } from '@/display/DisplayProvider';
import { router } from '@/router';
import { SessionProvider } from '@/session/SessionProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';

/** The whole tree, mounted: shell, lazy route, mock transport, first page. */
afterEach(cleanup);

const mountApp = () =>
  render(
    <ThemeProvider>
      <DisplayProvider>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </DisplayProvider>
    </ThemeProvider>,
  );

describe('the app', () => {
  it('mounts and renders a feed for an anonymous viewer', async () => {
    mountApp();

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

describe('view as', () => {
  afterEach(async () => {
    sessionStorage.clear();
    await transport.request('POST', '/auth/logout');
  });

  it('previews the feed as a lower tier from the header, read-only, and leaves again', async () => {
    await transport.request('POST', '/auth/login', { body: { username: 'root' } });
    mountApp();

    // As themselves, an admin sees staff and full authors by name.
    await screen.findAllByRole('article', {}, { timeout: 4000 });
    expect(await screen.findAllByText('pip')).not.toHaveLength(0);
    expect(screen.getAllByText('sandra')).not.toHaveLength(0);

    fireEvent.keyDown(await screen.findByLabelText('View the site as a lower tier'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'limited' }));

    // The bar replaces the header control, and has focus.
    const bar = await screen.findByRole('region', { name: 'Tier preview' });
    const picker = await screen.findByLabelText('Viewing as');
    expect(bar.contains(picker)).toBe(true);
    expect(document.activeElement).toBe(picker);
    expect(screen.queryByLabelText('View the site as a lower tier')).toBeNull();

    // The feed is limited's: staff posts gone, full authors reduced to a label.
    await waitFor(() => expect(screen.queryByText('pip')).toBeNull(), { timeout: 4000 });
    await waitFor(() => expect(screen.queryByText('sandra')).toBeNull(), { timeout: 4000 });
    expect((await screen.findAllByText('full')).length).toBeGreaterThan(0);

    // Read-only: no report, no bookmarking, no bookmarks list, no admin entry.
    expect(screen.queryByRole('button', { name: /report/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /bookmark/i })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Bookmarks' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Exit preview' }));
    expect(await screen.findByLabelText('View the site as a lower tier')).toBe(document.activeElement);
    expect(screen.queryByRole('region', { name: 'Tier preview' })).toBeNull();
    expect((await screen.findAllByText('pip', {}, { timeout: 4000 })).length).toBeGreaterThan(0);
  });

  it('offers nothing to a viewer who is not logged in', async () => {
    mountApp();
    await screen.findAllByRole('article', {}, { timeout: 4000 });
    expect(screen.queryByLabelText('View the site as a lower tier')).toBeNull();
  });
});

describe('phone menu', () => {
  it('opens the nav in a sheet, and a link or Escape closes it', async () => {
    mountApp();
    await screen.findAllByRole('article', {}, { timeout: 4000 });
    const button = screen.getByRole('button', { name: 'Menu' });

    // Following a link closes the sheet behind it.
    fireEvent.click(button);
    let sheet = await screen.findByRole('dialog', { name: 'Menu' });
    fireEvent.click(await within(sheet).findByRole('link', { name: /Music/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Escape closes it too, and focus goes back to the button.
    fireEvent.click(button);
    sheet = await screen.findByRole('dialog', { name: 'Menu' });
    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));
  });
});
