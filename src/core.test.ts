import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import golden from './data/golden.json';
import report from './data/report.json';
import { predict, verdict, impact, breakEven, quotePasses, safety, encodeTicket, decodeTicket, exportOrds, logTotals, ageBucket, detectSymptoms, inputSymptoms, contributions, symptomData, symptomIds, readLog, saveLog, factors, categories, stats, type Model, type LogEntry } from './core';
const model: Model = JSON.parse(readFileSync('public/model.json', 'utf8'));
const input = { category: 'Laptop', age: '3-5', brand: 'Dell', problem: 'Will not charge. 電池故障', years: '4' };
const entry: LogEntry = { id: 'local-1', date: '2026-11-01', input, status: 'Fixed' };
describe('Python → TypeScript golden parity', () => {
  it.each(golden.map((row, i) => ({ ...row, i })))('matches held-out row $i within 1e-6', row => {
    const actual = predict(row.input, model);
    actual.forEach((p, k) => expect(Math.abs(p - row.probabilities[k])).toBeLessThan(1e-6));
    expect(actual.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });
  it('stays within the model budget and keeps the split out-of-time and group-disjoint', () => {
    expect(gzipSync(readFileSync('public/model.json')).length).toBeLessThan(1_500_000);
    expect(report.split.groupOverlap).toBe(0);
    expect(report.split.trainEnd < report.split.testStart).toBe(true);
  });
});
it.each([[0, 'Harder repair, check first'], [0.649999, 'Harder repair, check first'], [0.65, 'Worth a try'], [0.799999, 'Worth a try'], [0.8, 'Repair first'], [1, 'Repair first']])('verdict boundary %s', (f, expected) => expect(verdict(Number(f))).toBe(expected));
it('verdict bands in report.json use the same thresholds as the app', () => {
  for (const band of report.verdictBands) expect(verdict(band.low)).toBe(band.verdict);
  expect(report.verdictBands.reduce((n, b) => n + b.n, 0)).toBe(report.split.testN);
});
describe('symptom detection', () => {
  it.each([
    ['Won’t turn on at all', 'no_power'], ['Der Akku lädt nicht mehr', 'battery'], ['geen geluid meer', 'no_sound'],
    ['ne s’allume plus', 'no_power'], ['La batterie ne charge pas', 'battery'], ['wordt niet warm', 'no_heat'],
    ['zuigt slecht', 'no_motion'], ['Bildschirm bleibt dunkel', 'screen'], ['Smoke and a burning smell', 'smell_smoke'],
    ['CRACKED casing', 'physical_break'], ['la fiche est cassée, cordon abîmé', 'cable_plug'],
  ])('detects %s as %s', (text, id) => expect(detectSymptoms(text)).toContain(id));
  it('matches whole words or declared prefixes, not substrings inside other words', () => {
    expect(detectSymptoms('deadline approaching')).not.toContain('no_power');
    expect(detectSymptoms('dead')).toContain('no_power');
    expect(detectSymptoms('plugin manager')).not.toContain('cable_plug');
    expect(detectSymptoms('abcd')).not.toContain('media');
    expect(detectSymptoms('a tapestry')).not.toContain('media');
    expect(detectSymptoms('')).toEqual([]);
  });
  it('merges chips with detected text, ignores unknown ids and is order independent', () => {
    const base = { category: 'Kettle', age: 'unknown', brand: '', problem: 'it leaks' };
    expect(inputSymptoms({ ...base, symptoms: ['no_heat', 'no_heat'] })).toEqual(['leak', 'no_heat']);
    expect(inputSymptoms({ ...base, symptoms: ['no_heat'] })).toEqual(inputSymptoms({ ...base, problem: '', symptoms: ['leak', 'no_heat'] }));
  });
  it('contributions are labelled, signed and capped at six', () => {
    const rows = contributions({ category: 'Kettle', age: 'unknown', brand: '', problem: '', symptoms: symptomIds }, model);
    expect(rows.length).toBeLessThanOrEqual(6);
    for (const r of rows) { expect(r.label).toBe(symptomData[r.id].label); expect(Number.isFinite(r.effect)).toBe(true); }
    expect(contributions({ category: 'Kettle', age: 'unknown', brand: '', problem: 'hello' }, model)).toEqual([]);
  });
  it('no curated term contains outcome language (it would leak the repair result)', () => {
    const outcome = /replac|repair|fixed|gerepareerd|vervangen|gesoldeerd|réparé|reparé|remplac|repariert|ersetzt|ersetz|irreparab|beyond|écrit|written off|new part|nieuw onderdeel|neues teil/i;
    for (const id of symptomIds) for (const term of symptomData[id].terms) expect({ id, term, leaks: outcome.test(term) }).toEqual({ id, term, leaks: false });
  });
  it('has 21 symptoms, each with a label and at least one term', () => {
    expect(symptomIds).toHaveLength(report.model.symptoms);
    for (const id of symptomIds) { expect(symptomData[id].label.length).toBeGreaterThan(2); expect(symptomData[id].terms.length).toBeGreaterThan(0); }
  });
});
it('impact uses Fixed only, with displacement only for carbon', () => {
  expect(impact(0.25, { name: 'fixture', restartId: 1, weight: 2, footprint: 100 })).toEqual({ carbon: 12.5, waste: 0.5, fullCarbon: 50, fullWaste: 2 });
  expect(breakEven(0.7, 200)).toBe(140);
  expect(quotePasses(0.7, 200, 140)).toBe(true);
  expect(quotePasses(0.7, 200, 141)).toBe(false);
});
it.each(['swollen battery', 'smoke', 'burning smell', 'sparks', 'gas leak', 'water leak', 'microwave', 'opening mains', 'batterie gonflée', 'fumée', 'étincelles', 'fuite d’eau', 'aufgeblähter Akku, Rauch', 'Funken', 'batería hinchada', 'humo', 'fuga de agua', 'opgezwollen batterij', 'rook', 'waterlekkage', 'batteria gonfia', 'fumo', 'bateria inchada', '电池鼓包', '冒烟', '漏水', '微波炉', '拆开电源'])('safety stops: %s', problem => expect(safety({ ...input, problem }).length).toBeGreaterThan(0));
it('safety catches professional-only category and does not flag Vegas', () => {
  expect(safety({ ...input, problem: 'bought in Las Vegas' })).toEqual([]);
  expect(safety({ ...input, category: 'Large home electrical', problem: '' })).toHaveLength(1);
});
it('ticked smoke and spark chips raise the safety notice; hiding the text keeps the detected symptoms', () => {
  expect(safety({ ...input, problem: '', symptoms: ['smell_smoke'] })).toContain('Smoke, burning or sparks');
  expect(safety({ ...input, problem: '', symptoms: ['sparks_trips'] })).toContain('Smoke, burning or sparks');
  expect(safety({ ...input, problem: '', symptoms: ['battery'] })).toEqual([]);
  const hidden = decodeTicket(encodeTicket({ ...input, problem: 'does not charge, battery' }))!.input;
  expect(hidden.problem).toBe('');
  expect(predict(hidden, model)).toEqual(predict({ ...input, problem: 'does not charge, battery' }, model));
  expect(safety(decodeTicket(encodeTicket({ ...input, problem: 'a burning smell' }))!.input)).toContain('Smoke, burning or sparks');
});
it('ticket privacy, Unicode, malformed and untrusted inputs', () => {
  expect(decodeTicket(encodeTicket(input))?.input.problem).toBe('');
  expect(decodeTicket(encodeTicket(input, true))?.input.problem).toBe(input.problem);
  expect(decodeTicket('#/ticket?d=%E0%A4')).toBeNull();
  expect(decodeTicket('#/ticket?d=' + encodeURIComponent(JSON.stringify({ v: 1, input: { ...input, category: '<script>' } })))).toBeNull();
});
it('exports ORDS fields, exact known age, quotes and safe spreadsheet cells', () => {
  const csv = exportOrds([{ ...entry, input: { ...input, brand: '=HYPERLINK("bad")', problem: 'fault, "test"\nnext' } }]);
  expect(csv.split('\r\n')[0]).toBe('id,data_provider,country,partner_product_category,product_category,product_category_id,brand,year_of_manufacture,product_age,repair_status,repair_barrier_if_end_of_life,group_identifier,event_date,problem');
  expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
  expect(csv).toContain('"fault, ""test""\nnext"');
  expect(csv).toContain('"4","Fixed"');
});
it('counts only actual Fixed outcomes and leaves unavailable factors unquantified', () => {
  const result = logTotals([entry, { ...entry, status: 'Repairable' }, { ...entry, status: 'End of life' }, { ...entry, input: { ...input, category: 'Misc' } }]);
  expect(result.fixed).toBe(2);
  expect(result.unquantified).toBe(1);
  expect(result.carbon).toBeCloseTo(265.32 * 0.5);
  expect(result.waste).toBe(1.83);
});
it('storage errors do not crash and corrupt records are rejected', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw Error(); }, setItem: () => { throw Error(); } });
  expect(readLog().error).toBeTruthy();
  expect(saveLog([])).toBeTruthy();
  vi.stubGlobal('localStorage', { getItem: () => '[{"id":3}]' });
  expect(readLog().entries).toEqual([]);
  expect(readLog().error).toBeTruthy();
  vi.unstubAllGlobals();
});
it('covers all categories by name and uses current factors', () => {
  expect(Object.keys(factors).sort()).toEqual(categories.sort());
  expect(factors.Kettle.variants[0].footprint).toBe(44.32);
  expect(factors['Large home electrical'].variants).toEqual([]);
  expect(factors.Laptop.default).toBe('Laptop medium');
  expect(ageBucket('')).toBe('unknown');
  expect(ageBucket('NaN')).toBe('unknown');
  expect(ageBucket('3')).toBe('3-5');
});

it('README numbers match report.json, stats.json and factors.json (guards against drift)', () => {
  const readme = readFileSync('README.md', 'utf8');
  const n = (v: number) => v.toLocaleString('en-US');
  const pct = (v: number) => (v * 100).toFixed(1) + '%';
  expect(readme).toContain(n(report.knownRows));
  expect(readme).toContain(n(report.split.testN));
  for (const key of ['global', 'category', 'withoutSymptoms', 'model'] as const) {
    const m = report.metrics[key];
    expect(readme).toContain(m.logLoss.toFixed(4));
    expect(readme).toContain(m.brier.toFixed(4));
    expect(readme).toContain(m.aucFixed.toFixed(3));
  }
  for (const b of report.verdictBands) for (const v of [n(b.n), pct(b.observedFixed), pct(b.observedRepairable), pct(b.observedEndOfLife)]) expect(readme).toContain(v);
  expect(readme).toContain(pct(1 - report.verdictBands[2].observedEndOfLife));
  const totals = { Fixed: 0, Repairable: 0, 'End of life': 0 } as Record<string, number>;
  let co2 = 0, kg = 0, quantified = 0;
  for (const c of categories) {
    for (const k of Object.keys(totals)) totals[k] += stats[c].statusCounts[k] || 0;
    const f = factors[c]?.variants.find(v => v.name === factors[c].default);
    if (f) { co2 += stats[c].statusCounts.Fixed * f.footprint * 0.5; kg += stats[c].statusCounts.Fixed * f.weight; quantified += stats[c].statusCounts.Fixed; }
  }
  for (const v of [n(totals.Fixed), n(totals.Repairable), n(totals['End of life']), n(quantified), n(Math.round(co2 / 1000)), n(Math.round(kg / 1000))]) expect(readme).toContain(v);
});
