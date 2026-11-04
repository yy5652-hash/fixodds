import { expect, test } from 'vitest';
import { categories } from './core';
import { enquiryLinks, enquiryText, whatsappNumber } from './enquiry';
import { itemTerms, matches, queries, toGuide } from './guides';
test('every category except the two catch-alls has iFixit search words', () => {
  expect(categories.filter(c => !itemTerms[c])).toEqual(['Misc', 'Small home electrical']);
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
