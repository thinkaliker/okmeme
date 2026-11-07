import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createMockTransport } from '@/api/mock/transport';
import { LinkCard } from '@/components/LinkCard';
import type { Link } from '@/domain/link';
import { SessionProvider } from '@/session/SessionProvider';

/**
 * The cog's own-tier path, through the real dialog and the dev fake: an author
 * whose post went out wider than they meant pulls it back to their own tier.
 */
const api = createMockTransport();

afterEach(async () => {
  cleanup();
  await api.request('POST', '/auth/logout');
});

describe('LinkEditDialog, moving your own post', () => {
  it('raises a post pinned below its author back to their own tier, with no edited marker', async () => {
    await api.request('POST', '/auth/login', { body: { username: 'sandra' } }); // full
    // Sandra's post that a moderator pinned down to limited, in the fixtures.
    const link = await api.request<Link>('GET', '/links/l_0jj88j');
    expect(link.pinnedTier).toBe(1);
    expect(link.viewerCan.setTier).toBe(true);

    const changes: Link[] = [];
    render(
      <MemoryRouter>
        <SessionProvider>
          <LinkCard link={link} onChange={(next) => changes.push(next)} />
        </SessionProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /edit post/i }));
    await screen.findByRole('dialog');

    // The options depend on the session's tier, which loads asynchronously.
    const everyone = await screen.findByRole('radio', { name: /everyone/i }, { timeout: 3000 });
    expect((everyone as HTMLInputElement).checked).toBe(true);
    // Full holds no postBelow by default, but going back up needs none.
    const own = screen.getAllByRole('radio').find((radio) => radio !== everyone) as HTMLInputElement;
    expect(own.disabled).toBe(false);
    fireEvent.click(own);
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(changes.length).toBeGreaterThan(0), { timeout: 3000 });
    const saved = changes.at(-1);
    expect(saved?.pinnedTier).toBe(2); // her own tier, and it stays there
    expect(saved?.editedAt).toBeNull();
  });
});
