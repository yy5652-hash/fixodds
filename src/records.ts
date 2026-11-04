// Measured repair records by category and brand, and similar real cases, from public/insights.json and public/cases/.
import { categories, inputSymptoms, label, normalize, symptomIds, type Input } from './core';
export type Row = [string, number, number, number];
export type CategoryRecord = { all: [number, number, number]; ages: Row[]; brands: Row[]; countries: Row[]; providers: Row[]; years: Row[]; symptoms: Row[]; case: number };
export type Insights = { minBrand: number; categories: Record<string, CategoryRecord> };
export type Case = { status: number; brand: string; age: string; country: string; year: string; problem: string; symptoms: string[]; provider: string };
let insights: Promise<Insights> | undefined;
export function loadInsights(): Promise<Insights> {
  if (!insights) insights = fetch('./insights.json').then(r => { if (!r.ok) throw Error('Repair records could not load.'); return r.json(); }).catch(e => { insights = undefined; throw e; });
  return insights;
}
const caseCache = new Map<number, Promise<Case[]>>();
export function loadCases(index: number): Promise<Case[]> {
  let found = caseCache.get(index);
  if (!found) {
    found = fetch(`./cases/${index}.json`).then(r => { if (!r.ok) throw Error('Cases could not load.'); return r.json(); }).then((d: { cases: [number, string, string, string, string, string, number[], string][] }) => d.cases.map(([status, brand, age, country, year, problem, s, provider]) => ({ status, brand, age, country, year, problem, symptoms: s.map(i => symptomIds[i]).filter(Boolean), provider })));
    found.catch(() => caseCache.delete(index));
    caseCache.set(index, found);
  }
  return found;
}
// 0–10 repair record: the share of past attempts that ended fixed. Measured outcomes, not a design score.
export const score = (n: number, fixed: number) => n ? Math.round(fixed / n * 100) / 10 : 0;
// Wilson 95% interval for a share; used to say when two records are not clearly different.
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}
const aliases: Record<string, string> = { phillips: 'philips', delonghi: "de'longhi", 'de longhi': "de'longhi", 'hewlett packard': 'hp', 'black decker': 'black+decker', 'black and decker': 'black+decker', 'black & decker': 'black+decker', 'russel hobbs': 'russell hobbs', 'kitchen aid': 'kitchenaid' };
export const brandKey = (s: string) => { const b = normalize(s).replace(/\s+/g, ' '); return aliases[b] || b; };
export function brandRecord(record: CategoryRecord, brand: string) {
  const key = brandKey(brand);
  return key ? record.brands.find(b => brandKey(b[0]) === key) : undefined;
}
// Rank against the person's item: shared symptoms first, then the same brand, then a similar age.
export function similarCases(cases: Case[], input: Input, limit = 5): Case[] {
  const wanted = inputSymptoms(input), brand = brandKey(input.brand), years = Number(input.years);
  const scored = cases.map((c, i) => {
    const overlap = c.symptoms.filter(s => wanted.includes(s)).length;
    const sameBrand = !!brand && brandKey(c.brand) === brand;
    const ageGap = input.years && c.age ? Math.abs(Number(c.age) - years) : 99;
    return { c, i, s: overlap * 3 + (sameBrand ? 2 : 0) + (ageGap <= 2 ? 1 : 0), overlap, sameBrand };
  }).filter(x => wanted.length ? x.overlap > 0 : brand ? x.sameBrand : true);
  return scored.sort((a, b) => b.s - a.s || Number(b.c.year) - Number(a.c.year) || a.i - b.i).slice(0, limit).map(x => x.c);
}
const iso3: Record<string, string> = { GBR: 'GB', NLD: 'NL', DEU: 'DE', BEL: 'BE', DNK: 'DK', FRA: 'FR', CAN: 'CA', NZL: 'NZ', AUS: 'AU', USA: 'US', ITA: 'IT', ESP: 'ES', NOR: 'NO', AUT: 'AT', JEY: 'JE', ARG: 'AR', SWE: 'SE', ISR: 'IL', PRT: 'PT', HKG: 'HK', IRL: 'IE', TUN: 'TN', CHE: 'CH', ISL: 'IS', TWN: 'TW', UGA: 'UG', KOR: 'KR', FIN: 'FI', LUX: 'LU', GUF: 'GF', LIE: 'LI', MYS: 'MY', ZAF: 'ZA', BEN: 'BJ' };
export function countryName(code: string, locale = 'en') {
  try { return iso3[code] ? new Intl.DisplayNames([locale], { type: 'region' }).of(iso3[code]) || code : code; } catch { return code; }
}
export const slug = (category: string) => label(category).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const fromSlug = (s: string) => categories.find(c => slug(c) === s);
// Share of stated end-of-life barriers that are about spare parts.
export const partsBarriers = ['Spare parts not available', 'Spare parts too expensive'];
