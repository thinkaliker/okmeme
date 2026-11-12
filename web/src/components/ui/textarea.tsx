import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * shadcn new-york-v4 `textarea`, with okmeme's look kept: a fixed min-h-24
 * rather than upstream's `field-sizing-content` (a 20k-character body should
 * scroll, not grow the dialog), no dark-mode fill, and no `outline-none` /
 * focus ring. Kept from upstream: text-base below md, so iOS does not zoom.
 */
function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-colors md:text-sm',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
