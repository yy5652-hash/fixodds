// Pattern from shadcn/ui (MIT)
import type { ComponentProps } from 'react';
import { cn } from './utils';
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn('input', className)} {...props}/>;
}
