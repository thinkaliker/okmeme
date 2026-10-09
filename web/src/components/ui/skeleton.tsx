import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden {...props} />;
}

/**
 * Placeholder rows are deliberately a fixed count and carry no numbers. Sizing a
 * skeleton to the response would tell the viewer how many rows are coming before
 * the filter has run.
 */
export function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-busy="true">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="mt-3 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
