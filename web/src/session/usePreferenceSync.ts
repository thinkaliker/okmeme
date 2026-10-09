import { useEffect, useRef } from 'react';
import { useDisplay } from '@/display/DisplayProvider';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * When a session appears, the account's preferences win.
 *
 * Local storage is what an anonymous reader gets and what survives a logout; the
 * account copy is what makes a preference follow someone to another device. This
 * runs once per user id rather than on every `me` update, so a change made here
 * and mirrored back with `PATCH /me` does not immediately re-apply itself over
 * whatever the user does next.
 */
export function usePreferenceSync(): void {
  const { me } = useSession();
  const { set } = useDisplay();
  const { setPreference } = useTheme();
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (me === null) {
      syncedFor.current = null;
      return;
    }
    if (syncedFor.current === me.publicId) return;
    syncedFor.current = me.publicId;
    setPreference(me.theme);
    set(me.display);
  }, [me, set, setPreference]);
}
