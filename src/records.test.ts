import { expect, test } from 'vitest';
import { categories } from './core';
import { brandKey, brandRecord, fromSlug, score, similarCases, slug, wilson, type Case, type CategoryRecord } from './records';
const c = (status: number, brand: string, age: string, symptoms: string[], year = '2025'): Case => ({ status, brand, age, country: 'GBR', year, problem: 'x', symptoms, provider: 'p' });
test('every category has a unique slug that maps back', () => {
  expect(new Set(categories.map(slug)).size).toBe(categories.length);
  expect(categories.every(cat => fromSlug(slug(cat)) === cat)).toBe(true);
});
test('scores, intervals and brand spellings', () => {
  expect(score(34059, 19959)).toBe(5.9);
  const [lo, hi] = wilson(50, 100);
  expect(lo).toBeGreaterThan(0.4); expect(hi).toBeLessThan(0.6);
  expect(brandKey(' Phillips ')).toBe('philips');
  const record = { brands: [['Philips', 100, 60, 10]] } as unknown as CategoryRecord;
  expect(brandRecord(record, 'phillips')?.[1]).toBe(100);
  expect(brandRecord(record, '')).toBeUndefined();
});
test('similar cases need a shared symptom, then prefer brand and age', () => {
  const cases = [c(0, 'Bosch', '4', ['battery']), c(2, 'Dyson', '4', ['battery']), c(1, 'Dyson', '12', ['noise']), c(0, 'Dyson', '5', ['battery', 'noise'])];
  const found = similarCases(cases, { category: 'Vacuum', age: '3-5', years: '4', brand: 'dyson', problem: '', symptoms: ['battery', 'noise'] });
  expect(found[0]).toBe(cases[3]);
  expect(found).toHaveLength(4);
  expect(similarCases(cases, { category: 'Vacuum', age: 'unknown', brand: 'Dyson', problem: '' }).every(x => x.brand === 'Dyson')).toBe(true);
});
