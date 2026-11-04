import { expect, test } from 'vitest';
import { openAt } from './hours';
// 2026-11-04 is a Wednesday.
const at = (day: number, time: string) => new Date(`2026-11-${String(2 + day).padStart(2, '0')}T${time}:00`);
test('weekday ranges and separate Saturday hours', () => {
  const h = 'Mo-Fr 09:00-18:00; Sa 09:00-13:00';
  expect(openAt(h, at(2, '10:00'))).toBe(true);
  expect(openAt(h, at(2, '18:00'))).toBe(false);
  expect(openAt(h, at(5, '12:59'))).toBe(true);
  expect(openAt(h, at(6, '12:00'))).toBe(false);
});
test('split days, lunch breaks, off and comma-separated rules', () => {
  expect(openAt('Mo,We,Fr 09:00-12:00,13:00-17:00', at(2, '12:30'))).toBe(false);
  expect(openAt('Mo,We,Fr 09:00-12:00,13:00-17:00', at(2, '13:30'))).toBe(true);
  expect(openAt('Mo-Sa 10:00-18:00; We off', at(2, '11:00'))).toBe(false);
  expect(openAt('Mo-Fr 08:00-12:00, Sa 10:00-14:00', at(5, '11:00'))).toBe(true);
});
test('24/7, past midnight and holidays', () => {
  expect(openAt('24/7', at(6, '03:00'))).toBe(true);
  expect(openAt('Fr 18:00-02:00', at(5, '01:30'))).toBe(true);
  expect(openAt('Fr 18:00-02:00', at(5, '02:30'))).toBe(false);
  expect(openAt('Mo-Fr 09:00-17:00; PH off', at(0, '10:00'))).toBe(true);
});
test('unknown forms are not guessed', () => {
  expect(openAt('', at(0, '10:00'))).toBeNull();
  expect(openAt('Jan-Mar Mo 10:00-12:00', at(0, '10:00'))).toBeNull();
  expect(openAt('by appointment', at(0, '10:00'))).toBeNull();
  expect(openAt('Mo-Fr sunrise-sunset', at(0, '10:00'))).toBeNull();
});
test('real OSM strings with spaces and trailing semicolons', () => {
  expect(openAt('Th 16:00 - 19:00', at(3, '17:00'))).toBe(true);
  expect(openAt('Sa-Th 08:00-20:00;', at(4, '10:00'))).toBe(false);
  expect(openAt('10:00-21:30', at(4, '21:00'))).toBe(true);
});
