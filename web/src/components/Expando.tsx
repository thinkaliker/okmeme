import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Disclosure {
  open: boolean;
  toggle: () => void;
  triggerProps: Pick<ComponentProps<'button'>, 'id' | 'type' | 'aria-expanded' | 'aria-controls'>;
  regionProps: Pick<ComponentProps<'div'>, 'id' | 'role' | 'aria-labelledby' | 'hidden'>;
}

/**
 * The wiring for a disclosure, separated from its layout.
 *
 * A trigger does not always sit next to the thing it opens — the media toggle is
 * the row's leading icon, while the media itself renders below the title. The
 * ids still have to match up, so they come from here rather than from whichever
 * component happens to hold both halves.
 *
 * The trigger stays before its region in DOM order, so opening one moves focus
 * forward into the content rather than backwards past it.
 */
export function useDisclosure(defaultOpen = false): Disclosure {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  const buttonId = useId();

  return {
    open,
    toggle: () => setOpen((current) => !current),
    triggerProps: {
      id: buttonId,
      type: 'button',
      'aria-expanded': open,
      'aria-controls': regionId,
    },
    regionProps: {
      id: regionId,
      role: 'region',
      'aria-labelledby': buttonId,
      hidden: !open,
    },
  };
}

interface ExpandoProps {
  labelExpand: string;
  labelCollapse: string;
  /** Rendered above the fold; the toggle sits next to it. */
  preview?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}

/**
 * Trigger and region together, for the ordinary case where they belong side by
 * side. The trigger is an icon button, the same size and weight as the row's
 * other controls, so a card reads as one set of buttons rather than a mix of
 * icons and text. The words moved to `aria-label` and `title`, so the button
 * still announces "Expand" and still says so on hover.
 */
export function Expando({
  labelExpand,
  labelCollapse,
  preview,
  children,
  className,
  defaultOpen = false,
}: ExpandoProps) {
  const { open, toggle, triggerProps, regionProps } = useDisclosure(defaultOpen);
  const label = open ? labelCollapse : labelExpand;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-2">
        {preview !== undefined && !open ? (
          <div className="min-w-0 flex-1 text-sm text-muted-foreground">{preview}</div>
        ) : null}
        <Button
          {...triggerProps}
          variant="ghost"
          size="icon"
          aria-label={label}
          title={label}
          onClick={toggle}
          className={cn('shrink-0 text-muted-foreground', open && 'bg-accent text-accent-foreground')}
        >
          <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
        </Button>
      </div>
      <div {...regionProps}>{open ? children : null}</div>
    </div>
  );
}
