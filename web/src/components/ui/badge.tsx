import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * shadcn new-york-v4 `badge`, with okmeme's look kept:
 * - rounded-md rather than upstream's pill;
 * - `default` is the quiet secondary surface, not upstream's primary fill;
 * - `tier` and `nsfw` are okmeme variants.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-secondary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border text-muted-foreground',
        ghost: 'border-transparent [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        link: 'border-transparent text-primary underline-offset-4 [a&]:hover:underline',
        /** Tier attribution. One token, used nowhere else. */
        tier: 'border-transparent bg-tier text-tier-foreground font-mono lowercase tracking-tight',
        nsfw: 'border-transparent bg-nsfw text-white uppercase tracking-wide',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean };

function Badge({ className, variant = 'default', asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot.Root : 'span';
  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
