import { decodeTicket, encodeTicket, type Input } from './core';
export const conditions = ['Powers on', 'Screen intact', 'Case already damaged', 'Accessories handed over'] as const;
export type TicketDetails = { maximum: string; quote: string; conditions: string[]; notes: string };
export const blankTicket: TicketDetails = { maximum: '', quote: '', conditions: [], notes: '' };
function cleanDetails(value: unknown): TicketDetails {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const money = (s: unknown) => typeof s === 'string' && s.length <= 16 && /^(\d+(\.\d{0,2})?)?$/.test(s) ? s : '';
  return { maximum: money(v.maximum), quote: money(v.quote), conditions: Array.isArray(v.conditions) ? conditions.filter(c => (v.conditions as unknown[]).includes(c)) : [], notes: typeof v.notes === 'string' ? Array.from(v.notes).slice(0, 2000).join('') : '' };
}
export function encodeRepairTicket(input: Input, details: TicketDetails, includeProblem = false) {
  const base = encodeTicket(input, includeProblem);
  const payload = JSON.parse(new URLSearchParams(base.split('?')[1]).get('d')!);
  return '#/ticket?d=' + encodeURIComponent(JSON.stringify({ ...payload, ticket: cleanDetails(details) }));
}
export function decodeRepairTicket(hash: string) {
  try {
    // Extra hand-over notes have their own bounded payload; the existing input
    // validator still owns category, symptoms, description and version checks.
    if (hash.length > 60000) return null;
    const payload = JSON.parse(new URLSearchParams(hash.split('?')[1]).get('d')!);
    const baseHash = '#/ticket?d=' + encodeURIComponent(JSON.stringify({ v: payload.v, input: payload.input, includesProblem: payload.includesProblem }));
    const base = decodeTicket(baseHash);
    return base ? { ...base, ticket: cleanDetails(payload.ticket) } : null;
  } catch { return null; }
}
