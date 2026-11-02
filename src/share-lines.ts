import { factorFor, impact, label, predict, safety, verdict, type Input, type Model } from './core';
import { number } from './format';
export function shareCardLines(input: Input, model: Model): string[] {
  const p = predict(input, model);
  const factor = factorFor(input);
  return [label(input.category), safety(input).length ? 'Let a professional assess it.' : verdict(p[0] + p[1]), ...(factor ? [
    `${number(impact(p[0], factor).carbon, 1)} kg CO₂e expected avoided`,
    `${number(factor.weight, 2)} kg e-waste kept in use if fixed`,
    'Category-average estimate, 0.5 displacement, The Restart Project factors',
  ] : []), 'Estimated from past community repair events. Not a diagnosis.'];
}
