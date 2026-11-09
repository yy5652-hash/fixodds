import { expect, test } from 'vitest';
import { ics, upcoming, type RepairEvent } from './events';
const base = { end: '', timezone: 'Europe/London', title: 'Repair cafe', location: 'Hall', group: 'G', online: false, country: 'United Kingdom' };
const events: RepairEvent[] = [
  { ...base, id: 1, start: '2026-11-01T10:00:00Z', end: '2026-11-01T12:00:00Z', lat: 51.45, lon: -2.59 },
  { ...base, id: 2, start: '2026-11-10T10:00:00Z', lat: 51.46, lon: -2.6 },
  { ...base, id: 3, start: '2026-11-08T10:00:00Z', lat: 51.6, lon: -2.6 },
  { ...base, id: 4, start: '2026-11-09T10:00:00Z', lat: 40.7, lon: -74 },
  { ...base, id: 5, start: '2026-11-05T10:00:00Z', lat: null, lon: null, online: true },
];
test('upcoming events drop past ones and keep the radius, soonest first', () => {
  const found = upcoming(events, new Date('2026-11-04T00:00:00Z'), { lat: 51.4545, lon: -2.5879 }, 25);
  expect(found.map(e => e.id)).toEqual([3, 2]);
  expect(found[1].distance).toBeLessThan(2);
  expect(upcoming(events, new Date('2026-11-04T00:00:00Z')).map(e => e.id)).toEqual([2, 3, 4, 5]);
});
test('calendar file escapes text, folds long lines and adds a reminder', () => {
  const text = ics([{ uid: 'a@fixodds', start: '2026-11-10T10:00:00Z', end: '2026-11-10T12:00:00Z', title: 'Fix, mend; repair', location: 'x'.repeat(120), alarmMinutes: 60 }], new Date('2026-11-04T00:00:00Z'));
  expect(text).toContain('SUMMARY:Fix\\, mend\\; repair');
  expect(text).toContain('DTSTART:20261110T100000Z');
  expect(text).toContain('TRIGGER:-PT60M');
  expect(text.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75)).toBe(true);
  expect(ics([{ uid: 'b', start: '2027-03-01', allDay: true, title: 'Warranty ends' }])).toContain('DTSTART;VALUE=DATE:20270301');
});

test('event statuses parse title and description with whole words and cancellation spelling variants', async () => {
  const { eventStatuses, readRows } = await import('./events');
  expect(eventStatuses({ title: 'FULL — Cafe (cancelled)', description: '<p>Booking is required</p>' })).toEqual(['FULL', 'Cancelled', 'Booking required']);
  expect(eventStatuses({ title: 'Fully booked', description: 'Canceled. Registration essential.' })).toEqual(['FULL', 'Cancelled', 'Booking required']);
  expect(eventStatuses({ title: 'Sold-out event', description: 'Please book in advance.' })).toEqual(['FULL', 'Booking required']);
  expect(eventStatuses({ title: 'Wonderful cafe', description: 'Not full. Not cancelled. No booking required. Registration is not required.' })).toEqual([]);
  const row = [1, '2030-01-01', '', '', 'Cafe', '', null, null, 'G', 0, 'UK'] as const;
  expect(readRows({ built: '', events: [[...row]] })[0].description).toBeUndefined();
  expect(eventStatuses(readRows({ built: '', events: [[...row, 'Booking required']] })[0])).toEqual(['Booking required']);
});
