import { factorFor, impact, label, predict, safety, verdict, type Input, type Model } from './core';
import { t } from './i18n';
import { number } from './format';
export function shareCardLines(input: Input, model: Model): string[] {
  const p = predict(input, model);
  const factor = factorFor(input);
  return [label(input.category), safety(input).length ? t('Let a professional assess it.') : t(verdict(p[0] + p[1])), ...(factor ? [
    t('{amount} kg CO₂e expected avoided', { amount: number(impact(p[0], factor).carbon, 1) }),
    t('{amount} kg e-waste kept in use if fixed', { amount: number(factor.weight, 2) }),
    t('Category-average estimate, 0.5 displacement, The Restart Project factors'),
  ] : []), t('Estimated from past community repair events. Not a diagnosis.')];
}
