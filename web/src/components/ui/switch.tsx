import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * shadcn new-york-v4 `switch` (with its `size` prop), with okmeme's look kept:
 * the 2px transparent border and track sizes are okmeme's, and there is no
 * `outline-none` / focus ring — the global :focus-visible outline is used.
 */
function Switch({
  className,
  size = 'default',
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root> & { size?: 'sm' | 'default' }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'data-[size=default]:h-5 data-[size=default]:w-9 data-[size=sm]:h-4 data-[size=sm]:w-7',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block rounded-full bg-background shadow-sm transition-transform',
          'group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3',
          'data-[state=unchecked]:translate-x-0 group-data-[size=default]/switch:data-[state=checked]:translate-x-4 group-data-[size=sm]/switch:data-[state=checked]:translate-x-3',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
