import { expect, test } from 'vitest';
import { datasetImpact, symptomEffects } from './insights';
import { blankInput, predict, type Model } from './core';
import model from '../public/model.json';
test('dataset impact counts only fixes with a default factor, without displacing weight', () => {
  const result = datasetImpact();
  expect(result.fixed).toBe(202076);
  expect(result.carbonTonnes).toBeCloseTo(5391.73833, 4);
  expect(result.wasteTonnes).toBeCloseTo(698.76794, 4);
});
test('symptom effect removes a detected symptom as well as a selected one', () => {
  const input = { ...blankInput, category: 'Laptop', problem: 'battery', symptoms: ['screen'] };
  const p = predict(input, model as Model);
  const without = predict({ ...input, problem: '', symptoms: ['screen'] }, model as Model);
  expect(symptomEffects(input, model as Model).find(x => x.id === 'battery')?.points).toBeCloseTo((p[0]+p[1]-without[0]-without[1])*100, 8);
});
