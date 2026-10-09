import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A surface, not a control. The card never carries a click handler — the old one
 * did, with an anchor nested inside it, which is unusable by keyboard and lies
 * to a screen reader about what is interactive. Everything actionable inside a
 * card is its own button or link.
 *
 * It has no header/content/footer parts. The row layout is one flex container,
 * and slicing it into three named slots only produced wrappers that existed to
 * hold padding.
 */
export function Card({ className, ...props }: ComponentProps<'article'>) {
  return (
    <article
      className={cn(
        'rounded-lg border border-border bg-card text-card-foreground shadow-xs',
        className,
      )}
      {...props}
    />
  );
}
