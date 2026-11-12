import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function FieldHint({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-xs text-muted-foreground', className)} {...props} />;
}
