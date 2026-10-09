import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LinkCard } from '@/components/LinkCard';
import type { Link } from '@/domain/link';
import { hueFor } from '@/lib/tint';
import { SessionProvider } from '@/session/SessionProvider';

/**
 * The old card nested an `<a>` inside a clickable card surface, which gives a
 * keyboard user one target that behaves like two, and tells a screen reader
 * nothing about the expando at all. These assertions are the contract that
 * replaced it.
 */

const base = {
  publicId: 'l_test',
  title: 'a title',
  category: { slug: 'tech', nameKey: 'category.tech', name: 'Tech' },
  tags: [],
  score: 12,
  viewerVote: 0,
  bookmarked: false,
  isNsfw: false,
  createdAt: new Date().toISOString(),
  editedAt: null,
  removed: null,
} as const;

const aboveTierLink: Link = {
  ...base,
  kind: 'link',
  author: { kind: 'tier', label: 'full' },
  url: 'https://example.org/thing',
  host: 'example.org',
  thumbKey: null,
  faviconKey: null,
  body: 'a body that lives behind a disclosure',
};

function renderCard(link: Link) {
  return render(
    <MemoryRouter>
      <SessionProvider>
        <LinkCard link={link} />
      </SessionProvider>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('LinkCard', () => {
  it('renders an above-tier author as a bare label and nothing more', () => {
    renderCard(aboveTierLink);
    expect(screen.getByText('full')).toBeDefined();
    expect(screen.queryByText(/u_/)).toBeNull();
  });

  it('makes the title the only link in the header, opening safely', () => {
    renderCard(aboveTierLink);
    const anchor = screen.getByRole('link', { name: /a title/ });
    expect(anchor.getAttribute('href')).toBe('https://example.org/thing');
    expect(anchor.getAttribute('target')).toBe('_blank');
    expect(anchor.getAttribute('rel')).toContain('noopener');
    // Nothing interactive nested inside the anchor.
    expect(anchor.querySelector('a, button')).toBeNull();
  });

  it('does not put a click handler on the card surface', () => {
    const { container } = renderCard(aboveTierLink);
    const card = container.querySelector('article');
    expect(card).not.toBeNull();
    expect(card?.getAttribute('onclick')).toBeNull();
    expect(card?.getAttribute('tabindex')).toBeNull();
  });

  it('drives the body expando from a real button with aria-expanded', () => {
    renderCard(aboveTierLink);
    const toggle = screen.getByRole('button', { name: /expand/i });
    const region = document.getElementById(toggle.getAttribute('aria-controls') ?? '');

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(region).not.toBeNull();
    expect(region?.hasAttribute('hidden')).toBe(true);
    expect(region?.textContent).toBe('');

    fireEvent.click(toggle);

    const collapse = screen.getByRole('button', { name: /collapse/i });
    expect(collapse.getAttribute('aria-expanded')).toBe('true');
    expect(collapse.getAttribute('aria-controls')).toBe(region?.id);
    expect(region?.hasAttribute('hidden')).toBe(false);
    expect(region?.textContent).toContain('a body that lives behind a disclosure');
  });

  it('renders a removal notice with no actor', () => {
    renderCard({
      ...aboveTierLink,
      body: null,
      removed: { at: new Date().toISOString(), reasonKey: null },
    });
    expect(screen.getByText(/removed by a moderator/i)).toBeDefined();
    expect(screen.queryByText(/staff|admin|owner/i)).toBeNull();
  });

  it('tints the edge from the category and nothing else', () => {
    const { container } = renderCard(aboveTierLink);
    const card = container.querySelector('article');
    expect(card?.style.getPropertyValue('--hue')).toBe(String(hueFor('tech')));
    // Inline, so no border utility on the same element can flatten it.
    expect(card?.style.borderLeftColor).toContain('--tint-edge-l');

    // The same category on an identified author must produce the same colour.
    // A tint that tracked the author would be a stable handle attached to an
    // identity, which is exactly what an above-tier author must not have.
    cleanup();
    const identified = renderCard({
      ...aboveTierLink,
      author: { kind: 'user', id: 'u_sandra', name: 'sandra' },
    });
    expect(identified.container.querySelector('article')?.style.getPropertyValue('--hue')).toBe(
      String(hueFor('tech')),
    );
  });

  it('serves a favicon from okmeme, never from the site it points at', () => {
    const { container } = renderCard({ ...aboveTierLink, faviconKey: 'fav_example.org' });
    const icon = container.querySelector('img');
    expect(icon).not.toBeNull();

    // The whole point: no request may leave for the target host. Anything that
    // resolves to example.org here is a per-viewer beacon on every feed render.
    const src = icon?.getAttribute('src') ?? '';
    expect(src).not.toContain('example.org');
    expect(src).not.toMatch(/^https?:\/\//);
    expect(icon?.getAttribute('alt')).toBe('');
  });

  it('falls back to a letter square when the site has no icon', () => {
    const { container } = renderCard(aboveTierLink);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('E')).toBeDefined();
  });

  it('keeps the icons out of the heading so a long title cannot wrap under them', () => {
    renderCard({
      ...aboveTierLink,
      faviconKey: 'fav_example.org',
      title: 'a title long enough that it has to run onto a second line to be read at all',
    });
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.querySelector('svg')).toBeNull();
    expect(heading.querySelector('img')).toBeNull();
  });

  it('opens media from the kind icon itself', () => {
    const mediaLink: Link = {
      ...base,
      kind: 'media',
      author: { kind: 'tier', label: 'full' },
      url: 'https://media.example.net/clip.gif',
      host: 'media.example.net',
      mediaType: 'image',
      thumbKey: 'th_test',
      faviconKey: null,
      body: null,
    };
    renderCard(mediaLink);

    const toggle = screen.getByRole('button', { name: /show media/i });
    const region = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(region?.hasAttribute('hidden')).toBe(true);
    // The trigger has to precede its region, or opening it sends focus backwards.
    expect(toggle.compareDocumentPosition(region!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: /hide media/i }).getAttribute('aria-expanded')).toBe('true');
    expect(region?.hasAttribute('hidden')).toBe(false);
    expect(region?.querySelector('img')).not.toBeNull();
  });

  it('exposes the score without exposing a rank', () => {
    renderCard(aboveTierLink);
    const vote = screen.getByRole('button', { name: /upvote/i });
    expect(vote.textContent).toContain('12');
    expect(vote.getAttribute('aria-pressed')).toBe('false');
  });
});
