import { useEffect, useRef, type RefObject } from 'react';
import { Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AUTHOR_TIER_LABELS, TIER } from '@/domain/tier';
import { t, tierLabel } from '@/i18n/t';
import { cn } from '@/lib/utils';
import { useSession } from '@/session/SessionProvider';

/**
 * "View as": read the site the way a lower tier reads it, the way Discord lets
 * you view a server as a role. The header carries the way in; while a preview
 * is on, a bar across the top says so and carries the switch and the way out.
 *
 * The server builds the preview — see `viewAs` in api/src/context.ts. All this
 * does is pick a tier and stay out of the way of what comes back.
 */

/** Where focus goes when one control replaces the other. */
export type ViewAsFocus = RefObject<'bar' | 'trigger' | null>;

/**
 * The viewer's own tier, then each one below it, down to logged out. Only
 * ever the viewer's own tier and below, so the list says nothing about the
 * ring above them — the same rule as the visibility choice on the submit form.
 */
function tierChoices(own: number): { value: string; name: string }[] {
  const choices: { value: string; name: string }[] = [];
  for (let tier = own; tier >= TIER.anonymous; tier -= 1) {
    const label = AUTHOR_TIER_LABELS[tier - 1];
    const name = label === undefined ? t('viewAs.anonymous') : tierLabel(label);
    choices.push({ value: String(tier), name: tier === own ? `${name} (${t('viewAs.self')})` : name });
  }
  return choices;
}

/** The way in: an eye in the header that opens a menu of your tier and those below it. */
export function ViewAsTrigger({ focusAfter }: { focusAfter: ViewAsFocus }) {
  const { me, viewAs, setViewAs } = useSession();
  if (me === null || viewAs !== null) return null;
  return <TriggerMenu own={me.tier} focusAfter={focusAfter} onPick={setViewAs} />;
}

function TriggerMenu({
  own,
  focusAfter,
  onPick,
}: {
  own: number;
  focusAfter: ViewAsFocus;
  onPick: (tier: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  // Back from a preview by the exit button: focus lands where it started
  // rather than on the body, where the button that had it used to be.
  useEffect(() => {
    if (focusAfter.current !== 'trigger') return;
    focusAfter.current = null;
    ref.current?.focus();
  }, [focusAfter]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={ref}
          variant="ghost"
          size="icon"
          title={t('viewAs.trigger')}
          aria-label={t('viewAs.trigger')}
          className="text-muted-foreground"
        >
          <Eye />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('viewAs.trigger')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={String(own)}
          onValueChange={(value) => {
            focusAfter.current = 'bar';
            onPick(Number(value));
          }}
        >
          {tierChoices(own).map((choice) => (
            <DropdownMenuRadioItem key={choice.value} value={choice.value}>
              {choice.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The bar across the top while previewing: what you are looking at, and the way out. */
export function PreviewBar({ container, focusAfter }: { container: string; focusAfter: ViewAsFocus }) {
  const { me, viewAs, setViewAs } = useSession();
  if (me === null || viewAs === null) return null;
  return (
    <Bar container={container} own={me.tier} viewAs={viewAs} focusAfter={focusAfter} onPick={setViewAs} />
  );
}

function Bar({
  container,
  own,
  viewAs,
  focusAfter,
  onPick,
}: {
  container: string;
  own: number;
  viewAs: number;
  focusAfter: ViewAsFocus;
  onPick: (tier: number | null) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  // Entered from the header, the control that had focus has just gone; this
  // is its replacement. Restored from a reload, focus stays where it was.
  useEffect(() => {
    if (focusAfter.current !== 'bar') return;
    focusAfter.current = null;
    ref.current?.focus();
  }, [focusAfter]);

  return (
    <section aria-label={t('viewAs.region')} className="bg-primary text-primary-foreground">
      <div className={cn(container, 'flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm')}>
        <Eye aria-hidden="true" className="size-4 shrink-0" />
        <label htmlFor="view-as-bar" className="font-medium">
          {t('viewAs.banner')}
        </label>
        <Select
          value={String(viewAs)}
          onValueChange={(value) => {
            const next = Number(value);
            // Yourself is the way out, the same as the exit button.
            if (next === own) focusAfter.current = 'trigger';
            onPick(next);
          }}
        >
          <SelectTrigger
            ref={ref}
            id="view-as-bar"
            size="sm"
            aria-describedby="view-as-hint"
            className="h-7 border-primary-foreground/30 bg-primary-foreground/10 px-2 font-semibold text-primary-foreground shadow-none focus-visible:outline-primary-foreground [&_svg:not([class*='text-'])]:text-primary-foreground"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {tierChoices(own).map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                {choice.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span
          id="view-as-hint"
          title={t('viewAs.hint')}
          className="hidden rounded-full border border-primary-foreground/30 px-2 py-px text-xs sm:inline"
        >
          <span aria-hidden="true">{t('viewAs.hintShort')}</span>
          <span className="sr-only">{t('viewAs.hint')}</span>
        </span>
        <div className="flex-1" />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          aria-label={t('viewAs.exit')}
          onClick={() => {
            focusAfter.current = 'trigger';
            onPick(null);
          }}
        >
          <X />
          <span className="hidden sm:inline">{t('viewAs.exit')}</span>
        </Button>
      </div>
    </section>
  );
}
