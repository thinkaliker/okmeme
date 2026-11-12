import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * shadcn new-york-v4 `skeleton`, with okmeme's look kept: bg-muted (upstream's
 * bg-accent is tinted orange in this palette), and aria-hidden, because a
 * placeholder shape has nothing to say to a screen reader.
 */
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="skeleton" className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden {...props} />
  );
}

export { Skeleton };
