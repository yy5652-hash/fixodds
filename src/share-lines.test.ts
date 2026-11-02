import { expect, test } from 'vitest';
import { shareCardLines } from './share-lines';
import { blankInput, type Model } from './core';
import model from '../public/model.json';
test('share card includes impact, source footnote and no private description', () => {
  const lines = shareCardLines({ ...blankInput, category: 'Laptop', problem: 'private name battery' }, model as Model);
  expect(lines[0]).toBe('Laptop');
  expect(lines.join(' ')).toContain('kg CO₂e');
  expect(lines.join(' ')).toContain('e-waste kept in use if fixed');
  expect(lines).toContain('Category-average estimate, 0.5 displacement, The Restart Project factors');
  expect(lines.join(' ')).not.toContain('private name');
});
test('no factor means no carbon or waste claims', () => {
  const lines = shareCardLines({ ...blankInput, category: 'Misc' }, model as Model);
  expect(lines.join(' ')).not.toMatch(/CO₂e|kg e-waste|displacement/);
});
test('share card respects the safety override', () => {
  expect(shareCardLines({ ...blankInput, category: 'Kettle', symptoms: ['sparks_trips'] }, model as Model)[1]).toBe('Let a professional assess it.');
});
