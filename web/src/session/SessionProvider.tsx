import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { auth, me as meApi } from '@/api/endpoints';
import { setViewAsTier } from '@/api/viewAs';
import { effectivePermissions, type Capability } from '@/domain/permissions';
import type { Me } from '@/domain/user';
import { ANONYMOUS, TIER, viewerTier, type ViewerTier } from '@/domain/tier';

/**
 * Anonymous is a state, not an account: `me === null` and the tier is 0. Every
 * capability check in the UI reads `tier` from here, so there is one answer to
 * "who is asking" rather than one per component.
 *
 * None of it is authorization. The server gates every route again.
 */
interface SessionContextValue {
  me: Me | null;
  /** The viewer's own tier. Previewing does not change it. */
  tier: ViewerTier;
  /**
   * Whether the viewer's tier holds a permission on this instance, from the
   * list `GET /me` carries. Anonymous holds none, and nobody holds anything
   * while previewing: a preview is read-only, because a write would answer for
   * the real viewer and drop their own view of the post into the preview.
   */
  allows: (capability: Capability) => boolean;
  /** The tier the content is being previewed as, or null when not previewing. */
  viewAs: ViewerTier | null;
  /** Enter, switch or (with null, or your own tier) leave a preview. */
  setViewAs: (tier: number | null) => void;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  update: (next: Me) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Per tab, so a preview survives a reload but not a new window. A preview that
 * outlived the tab would leave someone reading a narrowed site days later with
 * no memory of having asked for it.
 */
const VIEW_AS_KEY = 'okmeme.viewAs';

function readStoredViewAs(): number | null {
  try {
    const raw = sessionStorage.getItem(VIEW_AS_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

function writeStoredViewAs(tier: number | null): void {
  try {
    if (tier === null) sessionStorage.removeItem(VIEW_AS_KEY);
    else sessionStorage.setItem(VIEW_AS_KEY, String(tier));
  } catch {
    /* private browsing; the preview simply does not survive a reload */
  }
}

function permissionsOf(me: Me | null): ReadonlySet<Capability> {
  if (me === null) return new Set();
  // An API from before adjustable permissions sends no list. Fall back to the
  // defaults it still enforces rather than switching every control off.
  const listed = me.permissions as readonly Capability[] | undefined;
  return listed === undefined ? effectivePermissions(me.tier, new Map()) : new Set(listed);
}

/**
 * A tier this viewer may preview as, or null. Strictly below their own: their
 * own tier is just them. Mirrors the server's check, which is the one that
 * counts — this only keeps the control from offering what would be refused.
 */
function previewable(me: Me | null, tier: number | null): ViewerTier | null {
  if (me === null || tier === null || !Number.isInteger(tier)) return null;
  if (tier < TIER.anonymous || tier >= me.tier) return null;
  return viewerTier(tier);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [viewAs, setViewAsState] = useState<ViewerTier | null>(null);
  const viewAsRef = useRef<ViewerTier | null>(null);
  const [loading, setLoading] = useState(true);

  // The module copy first, then React's: see src/api/viewAs.ts for why the
  // order matters.
  const applyViewAs = useCallback((tier: ViewerTier | null) => {
    setViewAsTier(tier);
    writeStoredViewAs(tier);
    viewAsRef.current = tier;
    setViewAsState(tier);
  }, []);

  const load = useCallback(async () => {
    let next: Me | null;
    try {
      next = await meApi.get();
    } catch {
      // 401 is the ordinary anonymous path; anything else leaves us anonymous
      // too, rather than showing a session that could not be confirmed.
      next = null;
    }
    setMe(next);
    // A preview carried over a reload, or one a demotion or a revoked
    // permission has since put out of reach, is checked against who this is now.
    applyViewAs(previewable(next, readStoredViewAs()));
    setLoading(false);
  }, [applyViewAs]);

  useEffect(() => {
    void load();
  }, [load]);

  const login = useCallback(
    async (username: string, password: string) => {
      const next = await auth.login(username, password);
      applyViewAs(null);
      setMe(next);
    },
    [applyViewAs],
  );

  const logout = useCallback(async () => {
    await auth.logout();
    applyViewAs(null);
    setMe(null);
  }, [applyViewAs]);

  const update = useCallback(
    (next: Me) => {
      setMe(next);
      const kept = previewable(next, viewAsRef.current);
      if (kept !== viewAsRef.current) applyViewAs(kept);
    },
    [applyViewAs],
  );

  const setViewAs = useCallback(
    (tier: number | null) => applyViewAs(previewable(me, tier)),
    [me, applyViewAs],
  );

  const permissions = useMemo(() => permissionsOf(me), [me]);

  const value = useMemo<SessionContextValue>(
    () => ({
      me,
      tier: me === null ? ANONYMOUS : viewerTier(me.tier),
      allows: (capability: Capability) => viewAs === null && permissions.has(capability),
      viewAs,
      setViewAs,
      loading,
      refresh: load,
      login,
      logout,
      update,
    }),
    [me, permissions, viewAs, setViewAs, loading, load, login, logout, update],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession outside SessionProvider');
  return value;
}
