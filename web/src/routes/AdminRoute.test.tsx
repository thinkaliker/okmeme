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

describe('admin invites tab', () => {
  it('shows who used an invite, issues a wider one, edits it, and revokes it', async () => {
    await open('root', '/admin?tab=invites');

    // Fixtures: a used-up one-time invite and a partly used five-use one.
    const club = await rowOf('book club');
    expect(club.getByText('2 / 5 used')).toBeDefined();
    expect(club.getByText('never expires')).toBeDefined();
    expect(club.getByText('kes')).toBeDefined();
    expect(club.getByText('sandra')).toBeDefined();
    const dana = await rowOf('for dana');
    expect(dana.getByText('used up')).toBeDefined();

    // The defaults are one-time; widening it is allowed but said out loud.
    expect(screen.queryByText(/however far it is forwarded/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Note (optional, for your own records)'), {
      target: { value: 'meetup' },
    });
    fireEvent.change(screen.getByLabelText('Max uses'), { target: { value: '3' } });
    fireEvent.click(screen.getByLabelText('Never expires'));
    expect(screen.getByText(/however far it is forwarded/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Issue an invite' }));

    expect(await screen.findByText(/^okmi_mock/)).toBeDefined();
    expect(screen.getByText(/up to 3 uses · never expires/)).toBeDefined();

    // Edit: the limit goes up, and the row says so.
    const meetup = await rowOf('meetup');
    expect(meetup.getByText('0 / 3 used')).toBeDefined();
    fireEvent.click(meetup.getByRole('button', { name: 'Edit' }));
    const uses = await meetup.findByDisplayValue('3');
    fireEvent.change(uses, { target: { value: '5' } });
    fireEvent.click(meetup.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await rowOf('meetup')).getByText('0 / 5 used')).toBeDefined());

    // The limit cannot go below what has been spent. (Rows are re-queried: a
    // reload remounts the list.)
    const clubAgain = await rowOf('book club');
    fireEvent.click(clubAgain.getByRole('button', { name: 'Edit' }));
    fireEvent.change(await clubAgain.findByDisplayValue('5'), { target: { value: '1' } });
    expect(clubAgain.getByText(/At least 2/)).toBeDefined();
    expect(clubAgain.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(clubAgain.getByRole('button', { name: 'Cancel' }));

    // Revoked is final: no more Edit or Revoke on that row.
    fireEvent.click((await rowOf('meetup')).getByRole('button', { name: 'Revoke' }));
    await waitFor(async () => expect((await rowOf('meetup')).getByText('revoked')).toBeDefined());
    const revoked = await rowOf('meetup');
    expect(revoked.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(revoked.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });
});

describe('admin settings tab', () => {
  it('edits each setting with an input that only takes its type', async () => {
    await open('root', '/admin?tab=settings');

    // A flag is a true/false choice, not a text box.
    const thumbnails = await rowOf('thumbnails_enabled');
    const flag = thumbnails.getByRole('combobox', { name: 'thumbnails_enabled' });
    expect(within(flag).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'true',
      'false',
    ]);
    expect((flag as HTMLSelectElement).value).toBe('true');
    fireEvent.change(flag, { target: { value: 'false' } });
    fireEvent.click(thumbnails.getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const saved = (await rowOf('thumbnails_enabled')).getByRole('combobox');
      expect((saved as HTMLSelectElement).value).toBe('false');
    });

    // A count is a number field, and a fraction is refused before it is sent.
    const ttl = await rowOf('invite_ttl_days');
    const days = ttl.getByRole('spinbutton', { name: 'invite_ttl_days' });
    expect(days.getAttribute('type')).toBe('number');
    fireEvent.change(days, { target: { value: '2.5' } });
    fireEvent.click(ttl.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a whole number.')).toBeDefined();
    fireEvent.change(days, { target: { value: '7' } });
    fireEvent.click(ttl.getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const saved = (await rowOf('invite_ttl_days')).getByRole('spinbutton');
      expect((saved as HTMLInputElement).value).toBe('7');
    });
    expect(screen.queryByText('Enter a whole number.')).toBeNull();

    // Anything else stays raw JSON; an owner-only key is shown but not editable.
    expect((await rowOf('instance_name')).getByRole('textbox', { name: 'instance_name' })).toBeDefined();
    const minTier = (await rowOf('invite_min_tier')).getByRole('spinbutton', { name: 'invite_min_tier' });
    expect(minTier.hasAttribute('disabled')).toBe(true);
  });
});
