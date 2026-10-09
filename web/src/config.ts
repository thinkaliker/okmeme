/**
 * The SPA is deployed as static files against a separate API, so its origin is
 * configuration rather than an assumption.
 *
 * `VITE_API_MOCK` defaults to on: there is no server yet, and a frontend that
 * cannot be run is a frontend that cannot be reviewed.
 */
const env = import.meta.env;

export const API_URL: string = env.VITE_API_URL ?? '/api';

export const USE_MOCK_API: boolean = env.VITE_API_MOCK !== 'false';

/** Feed page size. Cursor pagination only — this is a limit, never an offset. */
export const PAGE_SIZE = 20;

/**
 * Poll interval for the notification count. No realtime and no provider-specific
 * channel; short polling against the same API. Slow on purpose — polling the
 * feed hard is the one channel that leaks tier changes by timing (GAPS.md).
 */
export const NOTIFICATION_POLL_MS = 60_000;

export const THEME_STORAGE_KEY = 'okmeme.theme';

/** Density, width and feed layout, stored as one blob under a single key. */
export const DISPLAY_STORAGE_KEY = 'okmeme.display';
