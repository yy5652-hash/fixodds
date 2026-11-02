import { expect, test } from 'vitest';
import { aliases } from './aliases';
import { categories } from '../core';
test('at least 60 aliases all target an existing model category', () => {
  expect(Object.keys(aliases).length).toBeGreaterThanOrEqual(60);
  for (const [word, target] of Object.entries(aliases)) expect(categories, word).toContain(target);
  expect(aliases.MacBook).toBe('Laptop');
  expect(aliases.iPhone).toBe('Mobile');
  expect(aliases.Hoover).toBe('Vacuum');
  expect(aliases.telly).toBe('Flat screen');
});
