import { useEffect, useRef, type RefObject } from 'react';
import { Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
function TierOptions({ own }: { own: number }) {
  const options: number[] = [];
  for (let tier = own; tier >= TIER.anonymous; tier -= 1) options.push(tier);

  return options.map((tier) => {
    const label = AUTHOR_TIER_LABELS[tier - 1];
    const name = label === undefined ? t('viewAs.anonymous') : tierLabel(label);
    return (
      <option key={tier} value={tier}>
        {tier === own ? `${name} (${t('viewAs.self')})` : name}
      </option>
    );
  });
}

/** The way in: an eye in the header, which is a tier picker under the hood. */
export function ViewAsTrigger({ focusAfter }: { focusAfter: ViewAsFocus }) {
  const { me, viewAs, setViewAs } = useSession();
  if (me === null || viewAs !== null) return null;
  return <TriggerSelect own={me.tier} focusAfter={focusAfter} onPick={setViewAs} />;
}

function TriggerSelect({
  own,
  focusAfter,
  onPick,
}: {
  own: number;
  focusAfter: ViewAsFocus;
  onPick: (tier: number) => void;
}) {
  const ref = useRef<HTMLSelectElement>(null);

  // Back from a preview by the exit button: focus lands where it started
  // rather than on the body, where the button that had it used to be.
  useEffect(() => {
    if (focusAfter.current !== 'trigger') return;
    focusAfter.current = null;
    ref.current?.focus();
  }, [focusAfter]);

  return (
    // A real <select> laid over the icon, transparent: the platform's own
    // picker, keyboard and screen-reader support, without a menu library.
    // Its own outline is invisible at opacity 0, so the wrapper draws it.
    <div
      title={t('viewAs.trigger')}
      className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
    >
      <Eye aria-hidden="true" className="size-4" />
      <label htmlFor="view-as-trigger" className="sr-only">
        {t('viewAs.trigger')}
      </label>
      <select
        ref={ref}
        id="view-as-trigger"
        value={own}
        onChange={(event) => {
          focusAfter.current = 'bar';
          onPick(Number(event.target.value));
        }}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        <TierOptions own={own} />
      </select>
    </div>
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
  const ref = useRef<HTMLSelectElement>(null);

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
        <select
          ref={ref}
          id="view-as-bar"
          value={viewAs}
          aria-describedby="view-as-hint"
          onChange={(event) => {
            const next = Number(event.target.value);
            // Yourself is the way out, the same as the exit button.
            if (next === own) focusAfter.current = 'trigger';
            onPick(next);
          }}
          className="rounded-md border border-primary-foreground/30 bg-primary-foreground/10 py-0.5 pr-1 pl-2 font-semibold text-primary-foreground focus-visible:outline-primary-foreground [&>option]:bg-popover [&>option]:text-popover-foreground"
        >
          <TierOptions own={own} />
        </select>
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
