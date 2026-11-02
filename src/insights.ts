import { displacement, factorFor, inputSymptoms, predict, stats, type Input, type Model } from './core';

export function datasetImpact() {
  return Object.entries(stats).reduce((total, [category, stat]) => {
    const factor = factorFor({ category, age: 'unknown', brand: '', problem: '' });
    if (factor) {
      const fixed = stat.statusCounts.Fixed;
      total.fixed += fixed;
      total.carbonTonnes += fixed * factor.footprint * displacement / 1000;
      total.wasteTonnes += fixed * factor.weight / 1000;
    }
    return total;
  }, { fixed: 0, carbonTonnes: 0, wasteTonnes: 0 });
}

export function symptomEffects(input: Input, model: Model) {
  const symptoms = inputSymptoms(input);
  const p = predict(input, model);
  return symptoms.map(id => {
    const without = predict({ ...input, problem: '', symptoms: symptoms.filter(s => s !== id) }, model);
    return { id, points: (p[0] + p[1] - without[0] - without[1]) * 100 };
  });
}
