import { expect, test } from 'vitest';
import { nearest } from './finder';
test('nearest retains phone and hours from the eight-field place rows', () => {
  const data = { built: '2026-11-02', kinds: ['Repair cafe'], places: [
    [51.456, -2.59, 'Cafe', 0, '', 'node/1', '+441234', 'Mo-Fr 09:00-17:00'],
    [40.7, -74, 'Too far', 0, '', 'node/2', '', ''],
  ] as [number, number, string, number, string, string, string, string][] };
  const result = nearest(data, { lat: 51.4545, lon: -2.5879 }, 5);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ name: 'Cafe', phone: '+441234', hours: 'Mo-Fr 09:00-17:00' });
});
test('missing optional contact fields remain empty', () => {
  const data = { built: '', kinds: ['Repair cafe'], places: [[0, 0, '', 0, '', 'node/1']] as [number, number, string, number, string, string][] };
  expect(nearest(data, { lat: 0, lon: 0 }, 5)[0]).toMatchObject({ name: 'Repair cafe', phone: '', hours: '' });
});
