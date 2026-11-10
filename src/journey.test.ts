import { afterEach, expect, test, vi } from 'vitest';
import { blankInput, confirmEnquiry, exportPilot, followupDue, logTotals, openEnquiry, outcomeJob, readJobs, readLog, sameItem, saveStep, type Job, type LogEntry } from './core';
const input = { ...blankInput, category: 'Laptop', brand: 'Apple', modelNumber: 'A123' };
const planned: Job = { id: 'old', created: '2026-01-01', input, stage: 'Planned', where: '', appointment: '' };
afterEach(() => vi.unstubAllGlobals());
test('saved steps update an open item across symptom edits without merging different models or closed jobs', () => {
  const first = saveStep([], input, { route: 'diy', guideTitle: 'Battery guide', intention: 'replace' }, 'one');
  expect(first[0]).toMatchObject({ next: 'Follow the guide: Battery guide', intention: 'replace', stage: 'Planned' });
  const updated = saveStep(first, { ...input, problem: 'new symptoms' }, { route: 'shop' }, 'two');
  expect(updated).toHaveLength(1); expect(updated[0]).toMatchObject({ id: 'one', next: 'Ask a repairer for a diagnosis and quote', intention: 'replace' });
  expect(sameItem(input, { ...input, modelNumber: 'A124' })).toBe(false);
  expect(saveStep([{ ...first[0], stage: 'Done' }], input, { route: 'diy' }, 'new')).toHaveLength(2);
  expect(saveStep([], input, { route: 'diy' }, 'no-guide')[0].next).toBe('Find a matching guide');
  expect(saveStep([], input, { route: 'cafe' }, 'no-event')[0].next).toBe('Find a repair event');
});
test('cafe steps retain event identity, link and absolute date without claiming a booking', () => {
  const event = { id: 5, group: 'Cafe', date: '10 Nov', start: '2030-11-10T10:00:00+01:00', link: 'https://restarters.net/party/view/5' };
  const job = saveStep([], input, { route: 'cafe', event }, 'event')[0];
  expect(job).toMatchObject({ eventId: 5, eventLink: event.link, eventStart: event.start, next: 'Cafe, 10 Nov', stage: 'Planned' });
  expect(new Date(job.appointment).getTime()).toBe(Date.parse(event.start));
  expect(saveStep([job], input, { route: 'shop' })[0]).toMatchObject({ appointment: '', eventId: undefined, eventLink: undefined, eventStart: undefined });
});
test('enquiries require explicit confirmation and Not yet restores the previous stage', () => {
  const pending = openEnquiry(planned, 'Shop');
  expect(pending.stage).toBe('Enquiry sent?');
  expect(confirmEnquiry(pending, false).stage).toBe('Planned');
  expect(confirmEnquiry(pending, true).stage).toBe('Enquiry sent');
  expect(confirmEnquiry(openEnquiry({ ...planned, stage: 'Booked' }, 'Shop'), true).stage).toBe('Booked');
  expect(confirmEnquiry(openEnquiry(pending, 'Shop'), false).stage).toBe('Planned');
});
test('Repairable stays open for parts; only terminal outcomes close the repair', () => {
  const waiting = outcomeJob({ ...planned, stage: 'With the repairer' }, 'Repairable');
  expect(waiting).toMatchObject({ stage: 'Waiting for parts', next: 'Order or ask about the part', stepDone: false });
  expect(outcomeJob(waiting, 'Fixed').stage).toBe('Done');
  expect(outcomeJob(waiting, 'End of life').stage).toBe('Done');
});
test('old jobs and log entries still load, and optional evidence survives reload', () => {
  const entry: LogEntry = { id: 'fixed', date: '2026-01-01', input, status: 'Fixed', intention: 'replace', purchasePostponed: 'yes', stillWorking: 'yes', checkedOn: '2026-02-01', route: 'shop' };
  vi.stubGlobal('localStorage', { getItem: (key: string) => JSON.stringify(key.includes('jobs') ? [planned, { ...planned, id: 'pending', stage: 'Enquiry sent?', beforeEnquiry: 'Planned', next: 'Ask', intention: 'repair' }, { ...planned, id: 'unknown', input: blankInput }] : [entry, { id: 'legacy', date: '2026-01-02', input, status: 'Repairable' }, { id: 'unknown', date: '2026-01-02', input: blankInput, status: 'End of life' }]) });
  expect(readJobs()).toHaveLength(3); expect(readJobs()[1]).toMatchObject({ next: 'Ask', intention: 'repair', beforeEnquiry: 'Planned' });
  expect(readJobs()[2].input.category).toBe('');
  expect(readLog().entries[0]).toMatchObject(entry); expect(readLog().entries).toHaveLength(3); expect(readLog().entries[2].input.category).toBe('');
});
test('30-day follow-up and totals use reported evidence only; pilot CSV remains separate and formula-safe', () => {
  const entry: LogEntry = { id: 'fixed', date: '2026-01-01', input: { ...input, brand: '=formula' }, status: 'Fixed', intention: 'replace', purchasePostponed: 'yes' };
  expect(followupDue(entry, new Date('2026-01-30T23:59:59Z'))).toBe(false);
  expect(followupDue(entry, new Date('2026-01-31T00:00:00Z'))).toBe(true);
  expect(followupDue({ ...entry, checkedOn: '2026-02-01' })).toBe(false);
  expect(followupDue({ ...entry, status: 'Repairable' })).toBe(false);
  expect(logTotals([entry, { ...entry, id: 'b', purchasePostponed: 'no', stillWorking: 'yes' }, { ...entry, status: 'Repairable' }])).toMatchObject({ fixed: 2, postponed: 1, inUse: 1 });
  // A fix with no postponed purchase keeps its e-waste in use but adds no avoided emissions.
  const one = logTotals([entry]), both = logTotals([entry, { ...entry, id: 'b', purchasePostponed: 'no' }]), unknown = logTotals([entry, { ...entry, id: 'c', purchasePostponed: undefined }]);
  expect(one.carbon).toBeGreaterThan(0); expect(both.carbon).toBeCloseTo(one.carbon); expect(both.waste).toBeCloseTo(2 * one.waste); expect(unknown.carbon).toBeCloseTo(2 * one.carbon);
  const csv = exportPilot([entry], [planned]);
  expect(csv).toContain('purchase_postponed,still_working,checked_on'); expect(csv).toContain('"\'=formula"'); expect(csv).toContain('"replace","Fixed","yes"'); expect(csv).toContain('"Planned"');
});

test('route changes clear stale bookings, while saving the same route preserves a manual appointment', () => {
  const booked: Job = { ...planned, route: 'shop', stage: 'Booked', appointment: '2030-01-01T10:00', where: 'Shop' };
  expect(saveStep([booked], input, { route: 'shop' })[0]).toMatchObject({ stage: 'Booked', appointment: booked.appointment, where: 'Shop' });
  expect(saveStep([booked], input, { route: 'diy' })[0]).toMatchObject({ stage: 'Planned', appointment: '', where: '' });
});
test('end-of-life links use the exact model and the area, with the UK official locator', async () => {
  const { endOfLifeLinks } = await import('./core');
  expect(decodeURIComponent(endOfLifeLinks(input).parts)).toContain('Apple Laptop A123 parts');
  expect(endOfLifeLinks(input, 'Bristol, United Kingdom').recycling).toBe('https://www.recyclenow.com/recycling-locator');
  expect(decodeURIComponent(endOfLifeLinks(input, 'Paris, France').recycling)).toContain('e-waste recycling near Paris, France');
});
