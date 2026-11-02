// Pattern from shadcn/ui (MIT)
import type { ReactNode } from 'react';
import { Accordion as Primitive } from 'radix-ui';
import { ChevronDown } from 'lucide-react';
export function Accordion({ title, children }: { title: string; children: ReactNode }) {
  return <Primitive.Root type="single" collapsible className="accordion"><Primitive.Item value="content"><Primitive.Header><Primitive.Trigger>{title}<ChevronDown size={18}/></Primitive.Trigger></Primitive.Header><Primitive.Content><div className="accordion-body">{children}</div></Primitive.Content></Primitive.Item></Primitive.Root>;
}
