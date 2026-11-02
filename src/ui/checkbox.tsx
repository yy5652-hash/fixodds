// Pattern from shadcn/ui (MIT)
import type { ComponentProps } from 'react';
import { Checkbox as Primitive } from 'radix-ui';
import { Check } from 'lucide-react';
import { cn } from './utils';
export function Checkbox({ className, ...props }: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root className={cn('checkbox-control', className)} {...props}><Primitive.Indicator><Check size={16}/></Primitive.Indicator></Primitive.Root>;
}
