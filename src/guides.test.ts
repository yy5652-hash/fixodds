import { afterEach, expect, test, vi } from 'vitest';
import { categories, inputSymptoms, safety } from './core';
import { enquiryLinks, enquiryText, whatsappNumber } from './enquiry';
import { broadCategories, findGuides, guideHazards, itemTerms, matches, queries, toGuide } from './guides';
test('every category has iFixit search words', () => {
  expect(categories.filter(c => !itemTerms[c])).toEqual([]);
});
test('queries go from specific to general and guides must name the item', () => {
  expect(queries({ category: 'Laptop', age: 'unknown', brand: 'Dell', problem: '', symptoms: ['battery'] })).toEqual(['dell laptop battery', 'laptop battery', 'dell laptop', 'laptop']);
  expect(matches('Toaster', { title: 'Panasonic Lumix DMC-TZ5 Front Cover Replacement', category: 'Panasonic Lumix DMC-TZ5' })).toBe(false);
  expect(matches('Toaster', { title: 'Slider of toaster does not stay down - Repair', category: 'Toaster' })).toBe(true);
});
test('guides keep only safe links and plausible times', () => {
  expect(toGuide({ dataType: 'guide', guideid: 1, title: 'x', url: 'javascript:alert(1)' })).toBeNull();
  const g = toGuide({ dataType: 'guide', guideid: 2, title: 'Kettle', url: 'https://www.ifixit.com/Guide/K/2', difficulty: 'Easy', time_required_max: 86400, image: { thumbnail: 'https://guide-images.cdn.ifixit.com/a.thumbnail' } });
  expect(g?.minutes).toBeNull();
  expect(g?.image).toContain('https://');
});
test('enquiries carry the ticket link and open WhatsApp only for international numbers', () => {
  const text = enquiryText({ category: 'Kettle', age: '3-5', years: '4', brand: 'Bosch', problem: '', symptoms: ['no_heat'] }, 'https://x/#/ticket?d=1', 'Test Cafe');
  expect(text).toContain('bosch kettle'.replace('bosch', 'Bosch'));
  expect(text).toContain("doesn't heat");
  expect(text).toContain('https://x/#/ticket?d=1');
  expect(whatsappNumber('+44 1234 567890')).toBe('441234567890');
  expect(whatsappNumber('01234 567890')).toBe('');
  const links = enquiryLinks(text, '+44 1234 567890; +44 999', 'Repair enquiry');
  expect(links.sms.startsWith('sms:+441234567890?&body=')).toBe(true);
  expect(links.whatsapp.startsWith('https://wa.me/441234567890?text=')).toBe(true);
  expect(enquiryLinks(text, '', 'x').sms).toBe('');
});
import { suggestRoute } from './routes';
test('DIY is suggested only for an easy guide once a symptom is known, never when unsafe', () => {
  const easy = [{ id: 1, title: 'Laptop battery replacement', matched: true, url: 'https://www.ifixit.com/Guide/x/1', difficulty: 'Very easy', minutes: 1, image: '', author: '', type: '' }];
  expect(suggestRoute(0.8, false, easy, null, true)).toBe('diy');
  expect(suggestRoute(0.8, false, easy, null, false)).toBe('cafe');
  expect(suggestRoute(0.8, true, easy, null, true)).toBe('shop');
  expect(suggestRoute(0.3, false, [], null, true)).toBe('shop');
});

afterEach(() => vi.unstubAllGlobals());
test('broad categories do not default to a specific device or treat category metadata as a title match', () => {
  for (const category of broadCategories) {
    expect(matches(category, { title: 'Microwave repair', category })).toBe(false);
    expect(queries({ category, age: 'unknown', brand: '', problem: '' })[0]).not.toBe('microwave');
  }
  expect(matches('Laptop', { title: 'Battery replacement', category: 'Laptop' })).toBe(false);
  expect(matches('Small kitchen item', { title: 'Toaster switch replacement' }, 'toaster')).toBe(true);
  expect(matches('Small kitchen item', { title: 'Microwave switch replacement' }, 'toaster')).toBe(false);
  expect(matches('Flat screen', { title: 'TVstand replacement' })).toBe(false);
  expect(matches('Small kitchen item', { title: 'Camera replacement' }, '!!!')).toBe(false);
});
test('typed device and model stay in all guide queries without sending the description', () => {
  const qs = queries({ category: 'Small kitchen item', age: 'unknown', brand: 'Bosch', deviceType: 'Toaster', modelNumber: 'TAT-123', problem: 'private marker will not turn on' });
  expect(qs[0]).toBe('bosch toaster tat-123 power');
  for (const q of qs) { expect(q).toContain('toaster tat-123'); expect(q).not.toContain('private marker'); }
});
test('Small kitchen item / won’t turn on cannot suggest DIY from microwave guides', async () => {
  const input = { category: 'Small kitchen item', age: 'unknown', brand: '', problem: "won't turn on" };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ dataType: 'guide', guideid: 701, title: 'Microwave power supply replacement', category: 'Small kitchen item', difficulty: 'Very easy', url: 'https://www.ifixit.com/Guide/Microwave/701' }] }) }));
  const guides = await findGuides(input);
  expect(guides).toHaveLength(1);
  expect(guides[0].matched).toBe(false);
  expect(guideHazards(guides)).toContain('Microwave high-voltage parts');
  expect(suggestRoute(0.9, safety(input).length > 0, guides, null, inputSymptoms(input).length > 0)).toBe('shop');
});
test('an unrelated easy guide never suggests DIY', () => {
  const guide = toGuide({ dataType: 'guide', guideid: 99, title: 'Camera replacement', url: 'https://www.ifixit.com/Guide/Camera/99', difficulty: 'Easy' })!;
  expect(suggestRoute(.9, false, [{ ...guide, matched: false }], null, true)).toBe('cafe');
  expect(suggestRoute(.9, false, [guide], null, true)).toBe('cafe');
});
test.each(['microwave', 'mains', 'power supply', 'power-supply', 'capacitor', 'capacitors', 'high voltage', 'high-voltage', 'gas', 'CRT'])('hazardous guide titles override even a matching easy guide: %s', title => {
  const guide = toGuide({ dataType: 'guide', guideid: 98, title: `Laptop ${title} replacement`, url: 'https://www.ifixit.com/Guide/Laptop/98', difficulty: 'Easy' })!;
  expect(guideHazards([guide]).length).toBeGreaterThan(0);
  expect(suggestRoute(.9, false, [{ ...guide, matched: true }], null, true)).toBe('shop');
});
test('enquiry includes device type and model without the private description', () => {
  const text = enquiryText({ category: 'Small kitchen item', age: 'unknown', brand: 'Bosch', deviceType: 'Toaster', modelNumber: 'TAT-123', problem: 'private marker' }, 'https://example.org/ticket');
  expect(text).toContain('Bosch toaster (Model number: TAT-123)');
  expect(text).not.toContain('private marker');
});
