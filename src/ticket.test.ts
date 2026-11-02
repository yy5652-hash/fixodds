import { expect, test } from 'vitest';
import { blankInput, encodeTicket, inputSymptoms } from './core';
import { blankTicket, decodeRepairTicket, encodeRepairTicket } from './ticket';
const input = { ...blankInput, category: 'Laptop', problem: 'battery will not charge' };
const details = { maximum: '75.50', quote: '60', conditions: ['Powers on', 'Accessories handed over'], notes: 'Cable included. Ask before extra work.' };
test('ticket round trips hand-over fields, without description by default', () => {
  const decoded = decodeRepairTicket(encodeRepairTicket(input, details));
  expect(decoded?.ticket).toEqual(details);
  expect(decoded?.input.problem).toBe('');
  expect(decoded?.input.symptoms).toEqual(inputSymptoms(input));
});
test('description is included only on opt-in', () => {
  expect(decodeRepairTicket(encodeRepairTicket(input, details, true))?.input.problem).toBe(input.problem);
});
test('old core ticket links still open', () => {
  expect(decodeRepairTicket(encodeTicket(input))?.ticket).toEqual(blankTicket);
});
test('invalid and oversized links fail safely', () => {
  expect(decodeRepairTicket('#/ticket?d=bad')).toBeNull();
  expect(decodeRepairTicket('#/ticket?d=' + 'x'.repeat(18001))).toBeNull();
});

test('full-length multilingual notes and opted-in description round trip', () => {
  const long = { ...input, problem: '🔋'.repeat(1000) };
  const notes = { ...details, notes: '修'.repeat(2000) };
  expect(decodeRepairTicket(encodeRepairTicket(long, notes, true))?.ticket.notes).toBe(notes.notes);
  expect(decodeRepairTicket(encodeRepairTicket(long, notes, true))?.input.problem).toBe(long.problem);
});
