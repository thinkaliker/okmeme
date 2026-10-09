import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DISPLAY_STORAGE_KEY } from '@/config';
import {
  DEFAULT_DISPLAY,
  type Density,
  type DisplayPreferences,
  type FeedView,
  type Width,
} from '@/domain/user';

/**
 * Density, width and feed layout — the three knobs that change how much of the
 * list you can see at once, and nothing else.
 *
 * They are stored the same way the theme is: locally, so an anonymous reader
 * keeps them, and mirrored onto the account when there is one so they follow the
 * user to another device. None of them touch a query, a cursor or a payload:
 * gallery mode is a different arrangement of exactly the rows the server sent.
 */
interface DisplayContextValue extends DisplayPreferences {
  set: (patch: Partial<DisplayPreferences>) => void;
}

const DisplayContext = createContext<DisplayContextValue | null>(null);

function isDensity(value: unknown): value is Density {
  return value === 'comfortable' || value === 'compact';
}

function isWidth(value: unknown): value is Width {
  return value === 'normal' || value === 'wide';
}

function isFeedView(value: unknown): value is FeedView {
  return value === 'list' || value === 'gallery';
}

/** Anything unrecognised falls back rather than throwing: a stale or hand-edited
 *  storage entry should not be able to stop the app from rendering. */
export function parseDisplay(raw: unknown): DisplayPreferences {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_DISPLAY;
  const candidate = raw as Partial<Record<keyof DisplayPreferences, unknown>>;
  return {
    density: isDensity(candidate.density) ? candidate.density : DEFAULT_DISPLAY.density,
    width: isWidth(candidate.width) ? candidate.width : DEFAULT_DISPLAY.width,
    feedView: isFeedView(candidate.feedView) ? candidate.feedView : DEFAULT_DISPLAY.feedView,
  };
}

function readStored(): DisplayPreferences {
  try {
    const raw = localStorage.getItem(DISPLAY_STORAGE_KEY);
    return raw === null ? DEFAULT_DISPLAY : parseDisplay(JSON.parse(raw));
  } catch {
    return DEFAULT_DISPLAY;
  }
}

/**
 * Written to the root element so components can style against it with a variant
 * instead of threading a prop down every level. The same inline script in
 * index.html sets these before first paint, so a compact wide layout does not
 * arrive as a reflow after the first render.
 */
function apply(display: DisplayPreferences): void {
  const root = document.documentElement;
  root.dataset['density'] = display.density;
  root.dataset['width'] = display.width;
}

export function DisplayProvider({ children }: { children: ReactNode }) {
  const [display, setDisplay] = useState<DisplayPreferences>(readStored);

  useEffect(() => {
    apply(display);
  }, [display]);

  const set = useCallback((patch: Partial<DisplayPreferences>) => {
    setDisplay((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable; the choice lasts for this session only */
      }
      return next;
    });
  }, []);

  const value = useMemo<DisplayContextValue>(() => ({ ...display, set }), [display, set]);

  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

export function useDisplay(): DisplayContextValue {
  const value = useContext(DisplayContext);
  if (value === null) throw new Error('useDisplay outside DisplayProvider');
  return value;
}
