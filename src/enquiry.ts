// Ready-to-send repair enquiries. FixOdds only builds the text; the person sends it from their own phone or mail app.
import { inputSymptoms, englishLabel as label, symptomData, type Input } from './core';
export function enquiryText(input: Input, ticketUrl: string, place?: string) {
  const symptoms = inputSymptoms(input).map(id => symptomData[id].label.toLowerCase());
  const item = [input.brand.trim(), (input.deviceType || label(input.category)).toLowerCase()].filter(Boolean).join(' ');
  const age = input.years ? `, about ${input.years} years old` : '';
  return [`Hello${place ? ' ' + place : ''},`, `Do you repair a ${item}${input.modelNumber ? ` (Model number: ${input.modelNumber})` : ''}${age}?${symptoms.length ? ` The problem: ${symptoms.join(', ')}.` : ''}`, 'Could you tell me whether you can look at it, your diagnosis fee and a rough price before any work?', `Repair ticket with the details: ${ticketUrl}`, 'Thank you.'].join('\n');
}
// Only international numbers can open WhatsApp; local numbers would need a guessed country code.
export function whatsappNumber(phone: string) {
  const first = phone.split(/[;,/]/)[0].trim();
  if (!/^(\+|00)/.test(first)) return '';
  const digits = first.replace(/^00/, '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : '';
}
export const firstPhone = (phone: string) => phone.split(/[;,/]/)[0].trim();
export function enquiryLinks(text: string, phone: string, subject: string) {
  const tel = firstPhone(phone), wa = whatsappNumber(phone);
  return {
    sms: tel ? `sms:${tel.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(text)}` : '',
    whatsapp: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : '',
    email: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`,
  };
}
