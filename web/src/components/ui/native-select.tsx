import { ChevronDownIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * shadcn new-york-v4 `native-select`. Two okmeme changes:
 * - `className` sizes the wrapper, not the <select>, and the wrapper is full
 *   width by default. Upstream's wrapper is `w-fit` with no way to widen it, so
 *   the chevron would sit at the end of the wrapper rather than the control.
 *   Font and colour classes still reach the select through inheritance.
 * - no dark-mode fill and no `outline-none` / focus ring; the global
 *   :focus-visible outline is used.
 */
function NativeSelect({
  className,
  size = 'default',
  ...props
}: Omit<ComponentProps<'select'>, 'size'> & { size?: 'sm' | 'default' }) {
  return (
    <div
      className={cn('group/native-select relative w-full has-[select:disabled]:opacity-50', className)}
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          'h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent px-3 py-1 pr-9 text-sm shadow-xs transition-colors',
          'disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:h-8 data-[size=sm]:py-1',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        )}
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground opacity-50 select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

function NativeSelectOption({ className, ...props }: ComponentProps<'option'>) {
  return <option data-slot="native-select-option" className={cn('bg-[Canvas] text-[CanvasText]', className)} {...props} />;
}

function NativeSelectOptGroup({ className, ...props }: ComponentProps<'optgroup'>) {
  return (
    <optgroup data-slot="native-select-optgroup" className={cn('bg-[Canvas] text-[CanvasText]', className)} {...props} />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
