import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError } from '@/api/client';
import { auth, me as meApi } from '@/api/endpoints';
import type { Me } from '@/domain/user';
import { ANONYMOUS, viewerTier, type ViewerTier } from '@/domain/tier';

/**
 * Anonymous is a state, not an account: `me === null` and the tier is 0. Every
 * capability check in the UI reads `tier` from here, so there is one answer to
 * "who is asking" rather than one per component.
 *
 * None of it is authorization. The server gates every route again.
 */
interface SessionContextValue {
  me: Me | null;
  tier: ViewerTier;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  update: (next: Me) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setMe(await meApi.get());
    } catch (error) {
      // 401 is the ordinary anonymous path, not a failure.
      if (error instanceof ApiError && error.status === 401) setMe(null);
      else setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const login = useCallback(async (username: string, password: string) => {
    setMe(await auth.login(username, password));
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    setMe(null);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      me,
      tier: me === null ? ANONYMOUS : viewerTier(me.tier),
      loading,
      refresh: load,
      login,
      logout,
      update: setMe,
    }),
    [me, loading, load, login, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession outside SessionProvider');
  return value;
}
