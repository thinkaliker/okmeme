import { Monitor, Moon, Sun } from 'lucide-react';
import { me as meApi } from '@/api/endpoints';
import { Button } from '@/components/ui/button';
import type { ThemePreference } from '@/domain/user';
import { t } from '@/i18n/t';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';

const NEXT: Readonly<Record<ThemePreference, ThemePreference>> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const LABEL: Readonly<Record<ThemePreference, string>> = {
  system: t('settings.themeSystem'),
  light: t('settings.themeLight'),
  dark: t('settings.themeDark'),
};

/** Cycles system → light → dark. The choice is stored locally and, when there is
 *  an account to store it on, mirrored there so it follows the user to a new
 *  device. A failed mirror is not an error worth showing: the local one holds. */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const { me, update } = useSession();

  function change() {
    const next = NEXT[preference];
    setPreference(next);
    if (me !== null) {
      meApi.patch({ theme: next }).then(update).catch(() => undefined);
    }
  }

  const Icon = preference === 'system' ? Monitor : preference === 'light' ? Sun : Moon;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={change}
      aria-label={`${t('settings.theme')}: ${LABEL[preference]}`}
      title={`${t('settings.theme')}: ${LABEL[preference]}`}
    >
      <Icon />
    </Button>
  );
}
