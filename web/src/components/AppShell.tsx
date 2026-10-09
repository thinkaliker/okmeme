import { useState } from 'react';
import { Link as RouterLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { Bookmark, KeyRound, LogIn, LogOut, Menu, Plus, Search, Settings, Shield } from 'lucide-react';
import { CategoryNav } from '@/components/CategoryNav';
import { NotificationBell } from '@/components/NotificationBell';
import { SanctionBannerSlot } from '@/components/SanctionBanner';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useDisplay } from '@/display/DisplayProvider';
import { can, isAuthorTierLabel } from '@/domain/tier';
import { t, tierLabel } from '@/i18n/t';
import { cn } from '@/lib/utils';
import { useSession } from '@/session/SessionProvider';
import { usePreferenceSync } from '@/session/usePreferenceSync';

function ViewerTierBadge() {
  const { me } = useSession();
  if (me === null) return null;
  // Own tier: the server sends the ordinal, and the label still comes from the
  // fixed table rather than from anything assembled here.
  const label = ['anonymous', 'limited', 'full', 'staff', 'admin', 'owner'][me.tier];
  if (label === undefined || !isAuthorTierLabel(label)) return null;
  return <Badge variant="tier">{tierLabel(label)}</Badge>;
}

function SearchForm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(params.get('q') ?? '');

  return (
    <form
      role="search"
      className="hidden flex-1 md:flex md:max-w-sm"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(`/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <label htmlFor="site-search" className="sr-only">
        {t('nav.search')}
      </label>
      <div className="relative w-full">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="site-search"
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t('nav.search')}
          className="pl-8"
        />
      </div>
    </form>
  );
}

export function AppShell() {
  const { me, tier, logout } = useSession();
  const { width } = useDisplay();
  const [navOpen, setNavOpen] = useState(false);
  usePreferenceSync();

  // One container width for the header and the content, so the two never drift
  // apart. Wide is a desktop concern only; on a phone both are the full window.
  const container = cn('mx-auto px-3', width === 'wide' ? 'max-w-[100rem] lg:px-6' : 'max-w-5xl');

  return (
    <div className="min-h-full">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-popover focus:px-3 focus:py-2 focus:text-sm"
      >
        {t('app.skipToContent')}
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className={cn(container, 'flex h-14 items-center gap-2')}>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-expanded={navOpen}
            aria-controls="site-nav"
            aria-label={t('app.menu')}
            onClick={() => setNavOpen((open) => !open)}
          >
            <Menu />
          </Button>

          <RouterLink to="/" className="text-lg font-black italic tracking-tight text-primary">
            {t('app.name')}
          </RouterLink>

          <div className="flex-1" />
          <SearchForm />

          {can.submit(tier) ? (
            <Button size="sm" asChild className="hidden sm:inline-flex">
              <RouterLink to="/submit">
                <Plus />
                {t('nav.submit')}
              </RouterLink>
            </Button>
          ) : null}

          <NotificationBell />
          <ThemeToggle />

          {me === null ? (
            <Button variant="ghost" size="sm" asChild>
              <RouterLink to="/login">
                <LogIn />
                <span className="hidden sm:inline">{t('nav.login')}</span>
              </RouterLink>
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <RouterLink
                to="/settings"
                className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-accent sm:flex"
              >
                <span className="font-medium">{me.username}</span>
                <ViewerTierBadge />
              </RouterLink>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('nav.logout')}
                onClick={() => void logout()}
              >
                <LogOut />
              </Button>
            </div>
          )}
        </div>
      </header>

      <div className={cn(container, 'flex gap-6 py-4 compact:py-2')}>
        <aside
          id="site-nav"
          className={`${navOpen ? 'block' : 'hidden'} w-full shrink-0 md:block md:w-48`}
        >
          <div className="sticky top-18 flex flex-col gap-4">
            <CategoryNav onNavigate={() => setNavOpen(false)} />

            <div className="flex flex-col gap-0.5 border-t border-border pt-3">
              {can.submit(tier) ? (
                <Button variant="ghost" size="sm" asChild className="justify-start sm:hidden">
                  <RouterLink to="/submit" onClick={() => setNavOpen(false)}>
                    <Plus />
                    {t('nav.submit')}
                  </RouterLink>
                </Button>
              ) : null}
              {me === null ? null : (
                <Button variant="ghost" size="sm" asChild className="justify-start">
                  <RouterLink to="/bookmarks" onClick={() => setNavOpen(false)}>
                    <Bookmark />
                    {t('nav.bookmarks')}
                  </RouterLink>
                </Button>
              )}
              {me === null ? null : (
                <Button variant="ghost" size="sm" asChild className="justify-start">
                  <RouterLink to="/settings" onClick={() => setNavOpen(false)}>
                    <Settings />
                    {t('nav.settings')}
                  </RouterLink>
                </Button>
              )}
              {/* Presentation only. The routes are gated on the server; hiding
                  the entry here keeps the nav tidy and authorizes nothing.
                  Staff reach it for the tag queue and nothing else. */}
              {can.createTags(tier) || can.reviewReports(tier) ? (
                <Button variant="ghost" size="sm" asChild className="justify-start">
                  <RouterLink to="/admin" onClick={() => setNavOpen(false)}>
                    <Shield />
                    {can.reviewReports(tier) ? t('nav.admin') : t('nav.moderation')}
                  </RouterLink>
                </Button>
              ) : null}
              {/* Owner is recovery and system settings only, so it gets its own
                  entry rather than sharing the moderation one. */}
              {can.ownerSettings(tier) ? (
                <Button variant="ghost" size="sm" asChild className="justify-start">
                  <RouterLink to="/owner" onClick={() => setNavOpen(false)}>
                    <KeyRound />
                    {t('owner.title')}
                  </RouterLink>
                </Button>
              ) : null}
            </div>
          </div>
        </aside>

        <main id="main" className={`${navOpen ? 'hidden' : 'block'} min-w-0 flex-1 md:block`}>
          <SanctionBannerSlot />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
