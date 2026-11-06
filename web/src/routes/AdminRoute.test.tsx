import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { auth, taxonomy } from '@/api/endpoints';
import { DisplayProvider } from '@/display/DisplayProvider';
import { router } from '@/router';
import { SessionProvider } from '@/session/SessionProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';

/** The admin panel against the in-browser fake, signed in as a given account. */
async function open(username: string, path: string) {
  await auth.login(username, 'x');
  await router.navigate(path);
  render(
    <ThemeProvider>
      <DisplayProvider>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </DisplayProvider>
    </ThemeProvider>,
  );
}

/** A list row in the panel. Scoped to <main>: the header and the nav repeat names. */
const rowOf = async (text: string) => {
  const main = within(await screen.findByRole('main'));
  const label = await main.findByText(text, {}, { timeout: 4000 });
  const row = label.closest('li');
  if (row === null) throw new Error(`no row for ${text}`);
  return within(row);
};

afterEach(cleanup);

describe('admin users tab', () => {
  it('explains the numbers and shows owner, self and peer-admin rows read-only to an admin', async () => {
    await open('root', '/admin?tab=users');

    expect(await screen.findByText(/higher number means more access/i, {}, { timeout: 4000 })).toBeDefined();

    const owner = await rowOf('keeper');
    expect(owner.getByText('5 · owner')).toBeDefined();
    expect(owner.queryByRole('combobox')).toBeNull();
    expect(owner.getByText(/managed on the Owner page/i)).toBeDefined();

    const self = await rowOf('root');
    expect(self.queryByRole('combobox')).toBeNull();
    expect(self.getByText(/this is you/i)).toBeDefined();

    // Below admin: a picker that never offers owner, and nothing happens until Apply.
    const member = await rowOf('sandra');
    const picker = member.getByRole('combobox');
    const offered = within(picker).getAllByRole('option').map((option) => option.textContent);
    expect(offered).toEqual(['1 · limited', '2 · full', '3 · staff', '4 · admin']);
    expect(member.getByRole('button', { name: 'Apply' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(picker, { target: { value: '3' } });
    expect(member.getByRole('button', { name: 'Apply' }).hasAttribute('disabled')).toBe(false);
  });

  it('lets an owner pick a tier for an admin, but never for an owner', async () => {
    await open('keeper', '/admin?tab=users');

    const admin = await rowOf('root');
    expect(admin.getByRole('combobox')).toBeDefined();

    const owner = await rowOf('keeper');
    expect(owner.queryByRole('combobox')).toBeNull();
    // An owner gets a way to the page that does manage the set.
    expect(owner.getByRole('link', { name: /managed on the Owner page/i })).toBeDefined();
  });
});

describe('admin categories tab', () => {
  beforeEach(async () => {
    await auth.login('root', 'x');
  });

  it('adds, renames, and deletes by moving links somewhere else', async () => {
    await open('root', '/admin?tab=categories');

    // Add, with the address previewed before it is fixed.
    fireEvent.change(await screen.findByLabelText('Name', {}, { timeout: 4000 }), {
      target: { value: 'Long Reads' },
    });
    expect(screen.getByText('Address: /c/long-reads')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
    await rowOf('Long Reads');
    expect((await taxonomy.categories()).map((c) => c.slug)).toContain('long-reads');

    // Rename: the name changes, the slug does not.
    const music = await rowOf('Music');
    fireEvent.click(music.getByRole('button', { name: 'Rename' }));
    const field = await screen.findByDisplayValue('Music');
    fireEvent.change(field, { target: { value: 'Songs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await rowOf('Songs');
    expect((await taxonomy.categories()).find((c) => c.slug === 'music')?.name).toBe('Songs');

    // Delete one with links: it asks where they go before it will.
    const songs = await rowOf('Songs');
    expect(songs.getByText('has links')).toBeDefined();
    fireEvent.click(songs.getByRole('button', { name: 'Delete' }));
    const target = await songs.findByLabelText('Move its links to');
    fireEvent.change(target, { target: { value: 'long-reads' } });
    fireEvent.click(songs.getByRole('button', { name: 'Delete category' }));

    await waitFor(async () => {
      expect((await taxonomy.categories()).map((c) => c.slug)).not.toContain('music');
    });
    const longReads = await rowOf('Long Reads');
    await waitFor(() => expect(longReads.getByText('has links')).toBeDefined());
  });
});
