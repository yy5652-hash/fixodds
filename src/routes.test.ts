import { afterEach, expect, test, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { blankInput, factorFor } from './core';
import * as guides from './guides';
import { GuideList } from './routes';
import { ImpactBlock } from './outlook';
import { ResultCard } from './check';
const input = { ...blankInput, category: 'Small kitchen item', problem: "won't turn on" };
const guide: guides.Guide = { id: 1, title: 'Camera battery replacement', url: 'https://www.ifixit.com/Guide/Camera/1', difficulty: 'Easy', minutes: 5, author: '', image: '', type: '', matched: false };
const text = (html: string) => html.replace(/<[^>]*>/g, '');
afterEach(() => vi.restoreAllMocks());
test('unmatched guides are labelled as related with compatibility unconfirmed', () => {
  vi.spyOn(guides, 'useGuides').mockReturnValue({ key: '', guides: [guide] });
  const html = renderToStaticMarkup(createElement(GuideList, { input }));
  expect(text(html)).toContain('Related guides — model compatibility unconfirmed');
  expect(text(html)).not.toContain('Repair guides for this');
  expect(html).toContain(guide.url);
});
test('mixed results separate matching and related guides', () => {
  vi.spyOn(guides, 'useGuides').mockReturnValue({ key: '', guides: [{ ...guide, id: 2, title: 'Toaster lever replacement', matched: true }, guide] });
  const html = text(renderToStaticMarkup(createElement(GuideList, { input: { ...input, deviceType: 'toaster' } })));
  expect(html.indexOf('Toaster lever replacement')).toBeLessThan(html.indexOf('Related guides — model compatibility unconfirmed'));
  expect(html.indexOf('Related guides — model compatibility unconfirmed')).toBeLessThan(html.indexOf(guide.title));
});
test('microwave guides show the safety notice in both the guide list and live outlook', () => {
  vi.spyOn(guides, 'useGuides').mockReturnValue({ key: '', guides: [{ ...guide, title: 'Microwave capacitor replacement' }] });
  expect(text(renderToStaticMarkup(createElement(GuideList, { input })))).toContain('Stop using it. Get professional help.');
  const model = { version: 1, classes: ['Fixed', 'Repairable', 'End of life'], brands: [], features: [], coefficients: [], intercept: [0, 0, 0] };
  const outlook = text(renderToStaticMarkup(createElement(ResultCard, { input, model, onFind: () => {} })));
  expect(outlook).toContain('Let a professional assess it.');
  expect(outlook).toContain('Microwave high-voltage parts');
});
test('impact distinguishes expected carbon from weight kept in use if fixed', () => {
  const item = { ...input, category: 'Laptop' }, factor = factorFor(item)!;
  const html = text(renderToStaticMarkup(createElement(ImpactBlock, { input: item, probabilities: [.5, .3, .2] })));
  expect(html).toContain(`≈${(factor.footprint * .25).toFixed(1)} kg CO₂e`);
  expect(html).toContain('expected (probability-weighted)');
  expect(html).toContain(`${factor.weight.toFixed(2)} kgkept in use if fixed`);
  expect(html).toContain('Category average · half of successful repairs assumed to replace a purchase');
});
