import { ages, categories, cleanInput, decodeTicket, encodeTicket, factors, inputSymptoms, symptomIds, type Input } from './core';
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
// Short link for messages: item, age, years, brand, size, symptoms, device type and model. Categories and symptoms use indexes. No description, no notes.
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
export function shortTicket(input: Input) {
  const sizes = factors[input.category]?.variants.map(v => v.name) || [];
  return '#/ticket?s=' + b64(JSON.stringify([1, categories.indexOf(input.category), ages.indexOf(input.age as typeof ages[number]), input.years || '', input.brand.slice(0, 40), input.size ? sizes.indexOf(input.size) : -1, inputSymptoms(input).map(id => symptomIds.indexOf(id)), input.deviceType || '', input.modelNumber || '']));
}
function decodeShort(raw: string) {
  if (raw.length > 1600) return null;
  const [v, c, a, years, brand, size, symptoms, deviceType = '', modelNumber = ''] = JSON.parse(unb64(raw));
  if (v !== 1 || !Array.isArray(symptoms)) return null;
  const category = categories[c];
  const input = cleanInput({ category, age: ages[a], years, brand, deviceType, modelNumber, problem: '', size: factors[category]?.variants[size]?.name, symptoms: symptoms.map((i: number) => symptomIds[i]) });
  return input ? { input, includesProblem: false, ticket: blankTicket } : null;
}
export const isSharedTicket = (hash: string) => /^#\/ticket\?(d|s)=/.test(hash);
export function decodeRepairTicket(hash: string) {
  try {
    const short = new URLSearchParams(hash.split('?')[1]).get('s');
    if (short) return decodeShort(short);
    // Extra hand-over notes have their own bounded payload; the existing input
    // validator still owns category, symptoms, description and version checks.
    if (hash.length > 60000) return null;
    const payload = JSON.parse(new URLSearchParams(hash.split('?')[1]).get('d')!);
    const baseHash = '#/ticket?d=' + encodeURIComponent(JSON.stringify({ v: payload.v, input: payload.input, includesProblem: payload.includesProblem }));
    const base = decodeTicket(baseHash);
    return base ? { ...base, ticket: cleanDetails(payload.ticket) } : null;
  } catch { return null; }
}
