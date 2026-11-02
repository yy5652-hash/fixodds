// Pattern from shadcn/ui (MIT)
import type { ComponentProps } from 'react';
import { Slot } from 'radix-ui';
import { cva } from 'class-variance-authority';
import { cn } from './utils';
const variants = cva('button', { variants: { variant: { primary: 'primary', secondary: 'secondary', ghost: 'ghost' } }, defaultVariants: { variant: 'secondary' } });
export function Button({ asChild, variant, className, ...props }: ComponentProps<'button'> & { asChild?: boolean; variant?: 'primary' | 'secondary' | 'ghost' }) {
  const Component = asChild ? Slot.Root : 'button';
  return <Component className={cn(variants({ variant }), className)} {...props}/>;
}
