import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';

/**
 * Route-level code splitting. Every screen is its own chunk, so a first visit on
 * a slow connection downloads the feed and nothing else — the admin panel, the
 * submit form and the settings screen do not travel with it.
 *
 * Imports are direct paths rather than barrels for the same reason: a barrel
 * re-export drags every sibling into whichever chunk touches one of them.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, lazy: async () => ({ Component: (await import('@/routes/FeedRoute')).default }) },
      {
        path: 'c/:categorySlug',
        lazy: async () => ({ Component: (await import('@/routes/FeedRoute')).default }),
      },
      {
        path: 't/:tagSlug',
        lazy: async () => ({ Component: (await import('@/routes/FeedRoute')).default }),
      },
      {
        path: 'search',
        lazy: async () => ({ Component: (await import('@/routes/SearchRoute')).default }),
      },
      {
        path: 'l/:publicId',
        lazy: async () => ({ Component: (await import('@/routes/LinkRoute')).default }),
      },
      {
        path: 'submit',
        lazy: async () => ({ Component: (await import('@/routes/SubmitRoute')).default }),
      },
      {
        path: 'login',
        lazy: async () => ({ Component: (await import('@/routes/LoginRoute')).default }),
      },
      {
        path: 'signup',
        lazy: async () => ({ Component: (await import('@/routes/SignupRoute')).default }),
      },
      {
        path: 'recover',
        lazy: async () => ({ Component: (await import('@/routes/RecoverRoute')).default }),
      },
      {
        // One time, ever. The route exists in the bundle; the server is what
        // decides whether it answers, and after setup it never does again.
        path: 'setup',
        lazy: async () => ({ Component: (await import('@/routes/SetupRoute')).default }),
      },
      {
        path: 'bookmarks',
        lazy: async () => ({ Component: (await import('@/routes/BookmarksRoute')).default }),
      },
      {
        path: 'notifications',
        lazy: async () => ({ Component: (await import('@/routes/NotificationsRoute')).default }),
      },
      {
        path: 'settings',
        lazy: async () => ({ Component: (await import('@/routes/SettingsRoute')).default }),
      },
      {
        path: 'admin',
        lazy: async () => ({ Component: (await import('@/routes/AdminRoute')).default }),
      },
      {
        path: 'owner',
        lazy: async () => ({ Component: (await import('@/routes/OwnerRoute')).default }),
      },
      {
        path: '*',
        lazy: async () => ({ Component: (await import('@/routes/NotFoundRoute')).default }),
      },
    ],
  },
]);
