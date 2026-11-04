import statsData from './data/stats.json';
import factorData from './data/factors.json';
import symptomJson from './data/symptoms.json';
export const symptomData = symptomJson as Record<string, { label: string; terms: string[] }>;
export const symptomIds = Object.keys(symptomData);
export const categories = Object.keys(statsData);
export const ages = ['unknown', '0-2', '3-5', '6-10', '11-20', '21+'] as const;
export const statuses = ['Fixed', 'Repairable', 'End of life'] as const;
export type Status = typeof statuses[number];
export type Input = { category: string; age: string; brand: string; problem: string; size?: string; years?: string; symptoms?: string[] };
export type Probabilities = [number, number, number];
export type Model = { version: number; classes: string[]; brands: string[]; features: string[]; coefficients: number[][]; intercept: number[] };
export type Factor = { name: string; restartId: number; weight: number; footprint: number };
export type FactorRow = { default: string | null; estimated: boolean; variants: Factor[]; source: string };
export type Stat = { n: number; statusCounts: Record<string, number>; barrierN: number; barriers: { name: string; n: number; share: number }[]; medianAge: number | null; ageN: number; ordsId: string };
export const stats = statsData as Record<string, Stat>;
export const factors = factorData.categories as Record<string, FactorRow>;
export const displacement = factorData.displacement;
export const blankInput: Input = { category: '', age: 'unknown', brand: '', problem: '', years: '' };
export const normalize = (s: string) => s.normalize('NFKC').toLowerCase().trim();
// Mirrors symptom_text() in scripts/train.py: terms match against ' word word '.
export function symptomText(s: string): string {
  const text = normalize(Array.from(s).slice(0, 1000).join(''));
  const words: string[] = [];
  let word = '';
  for (const char of text) {
    if (/[\p{L}\p{N}]/u.test(char)) word += char;
    else { if (word) words.push(word); word = ''; }
  }
  if (word) words.push(word);
  return ` ${words.join(' ')} `;
}
export const detectSymptoms = (problem: string) => {
  const text = symptomText(problem);
  return symptomIds.filter(id => symptomData[id].terms.some(t => text.includes(t)));
};
export const inputSymptoms = (input: Input) => [...new Set([...detectSymptoms(input.problem), ...(input.symptoms || [])])].sort();
export function ageBucket(value: string): string {
  if (!value.trim()) return 'unknown';
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 150) return 'unknown';
  return n < 3 ? '0-2' : n < 6 ? '3-5' : n < 11 ? '6-10' : n < 21 ? '11-20' : '21+';
}
export function features(input: Input, model: Model): string[] {
  const brand = normalize(input.brand);
  return [`c:${input.category}`, `a:${input.age}`, `b:${model.brands.includes(brand) ? brand : brand ? 'other' : 'unknown'}`, ...inputSymptoms(input).flatMap(s => [`s:${s}`, `x:${input.category}|${s}`])];
}
const indices = new WeakMap<Model, Map<string, number>>();
function index(model: Model) {
  let lookup = indices.get(model);
  if (!lookup) { lookup = new Map(model.features.map((f, i) => [f, i])); indices.set(model, lookup); }
  return lookup;
}
export function predict(input: Input, model: Model): Probabilities {
  const lookup = index(model);
  const scores = [...model.intercept];
  // Same ascending sparse-column accumulation as Python/SciPy.
  const columns = features(input, model).map(f => lookup.get(f)).filter((i): i is number => i !== undefined).sort((a, b) => a - b);
  for (const i of columns) for (let k = 0; k < 3; k++) scores[k] += model.coefficients[i][k];
  const max = Math.max(...scores);
  const exp = scores.map(s => Math.exp(s - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(v => v / sum) as Probabilities;
}
export function contributions(input: Input, model: Model) {
  const lookup = index(model);
  return inputSymptoms(input).map(id => {
    const w = [`s:${id}`, `x:${input.category}|${id}`].flatMap(f => { const i = lookup.get(f); return i === undefined ? [] : [model.coefficients[i]]; });
    const effect = w.reduce((sum, c) => sum + c[0] - (c[1] + c[2]) / 2, 0);
    return { id, label: symptomData[id].label, effect };
  }).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 6);
}
// Bands mirror VERDICT_BANDS in scripts/train.py; report.json holds their held-out outcomes.
export function verdict(f: number): string {
  return f >= 0.8 ? 'Repair first' : f >= 0.65 ? 'Worth a try' : 'Harder repair, check first';
}
export function factorFor(input: Input): Factor | undefined {
  const row = factors[input.category];
  return row?.variants.find(v => v.name === (input.size || row.default));
}
export function impact(pFixed: number, factor: Factor) {
  const fullCarbon = factor.footprint * displacement;
  return { carbon: pFixed * fullCarbon, waste: pFixed * factor.weight, fullCarbon, fullWaste: factor.weight };
}
export const breakEven = (feasible: number, replacement: number) => feasible * replacement;
export function quotePasses(feasible: number, replacement: number, quote: number) { return quote <= breakEven(feasible, replacement); }
export const friendly: Record<string, string> = { 'Mobile': 'Mobile phone', 'Flat screen': 'TV or monitor', 'Misc': 'Other electrical item', 'PC accessory': 'Computer accessory', 'Large home electrical': 'Large household appliance', 'Small home electrical': 'Small household appliance', 'Hi-Fi integrated': 'Hi-fi system', 'Hi-Fi separates': 'Hi-fi component', 'Hair & beauty item': 'Hair & beauty appliance', 'Battery/charger/adapter': 'Battery, charger or adapter' };
export const label = (category: string) => friendly[category] || category;

const safetyRules: [string, RegExp][] = [
  ['Swollen or damaged battery', /swoll\w*|bulg\w*|bloated|hinchad\w*|gonfi\w*|inchad\w*|opgezwoll\w*|aufgebl\w*|geschwoll\w*|battery.{0,20}(leak|punctur)|batter\w*.{0,20}(gonfl|geschwoll|aufgebl|hinch|opgezwoll|inflat|inchad)|accu.{0,15}(bol|opgezwoll)|鼓包|电池.{0,6}(膨胀|漏液)|電池.{0,6}(膨脹|漏液)/iu],
  ['Smoke, burning or sparks', /\b(smoke|smoking|sparks?|sparking|burning|rauch|raucht|funken|schmor\w*|fumée|fume|brûlé|brûlure|étincelle\w*|humo|quemado|chispas?|rook|vonken|brandlucht|fumo|bruciato|scintille|fumaça|queimado|faísca\w*)\b|étincelle\w*|冒烟|冒煙|焦味|烧焦|燒焦|火花/iu],
  ['Possible gas hazard', /\b(gas|gaz|gás|gasse|gaslek)\b|煤气|煤氣|燃气|燃氣|漏气|漏氣/iu],
  ['Water leak near electrics', /water.{0,20}leak|leak.{0,20}water|fuite.{0,10}eau|fuga.{0,10}(agua|água)|wasser.{0,15}(leck|tritt|läuft)|waterlekkage|lekt|perdita.{0,10}acqua|漏水/iu],
  ['Microwave high-voltage parts', /microwave|micro[ -]?ondes?|mikrowelle|microondas|magnetron|microonde|微波炉|微波爐/iu],
  ['Opening mains-powered equipment', /\b(mains|power supply|high voltage)\b|open.{0,25}(plug|socket|charger|kettle|toaster|appliance)|ouvr.{0,25}(secteur|alimentation)|öffn.{0,25}(netz|steck)|abrir.{0,25}(red|enchufe|fuente)|open.{0,25}(netspann|stekker)|alta tension|netspanning|netzspannung|市电|市電|拆.{0,6}(插座|电源|電源)|高压|高壓/iu],
];
export function safety(input: Input): string[] {
  const text = normalize(input.problem);
  const found = safetyRules.filter(([, pattern]) => pattern.test(text)).map(([reason]) => reason);
  // A ticked chip is as serious as the same words typed in.
  if (input.symptoms?.some(id => id === 'smell_smoke' || id === 'sparks_trips')) found.push('Smoke, burning or sparks');
  if (input.category === 'Large home electrical') found.push('Large appliance: professional assessment required');
  return [...new Set(found)];
}
export const barrierActions: Record<string, string> = {
  'Spare parts not available': 'Note the exact model number and search the manufacturer’s spares catalogue. Ask a repair group about donor parts.',
  'Product too worn out': 'Ask a technician to check whether several parts have failed before paying for a single replacement.',
  'Repair information not available': 'Search iFixit for the model number, then ask the manufacturer for a service manual.',
  'No way to open product': 'Find a teardown guide and ask a repairer about safe access. Do not force sealed or mains-powered housings.',
  'Spare parts too expensive': 'Get a written parts-and-labour quote and compare it with your break-even spend below.',
  'Lack of equipment': 'Ask a repair cafe or professional whether they have the diagnostic tools for this item.',
};
export function cleanInput(value: unknown): Input | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.category !== 'string' || !categories.includes(v.category)) return null;
  if (typeof v.age !== 'string' || !ages.includes(v.age as typeof ages[number])) return null;
  if (typeof v.brand !== 'string' || typeof v.problem !== 'string') return null;
  const size = typeof v.size === 'string' && factors[v.category]?.variants.some(f => f.name === v.size) ? v.size : undefined;
  const symptoms = Array.isArray(v.symptoms) ? v.symptoms.filter((x): x is string => typeof x === 'string' && symptomIds.includes(x)) : [];
  const years = typeof v.years === 'string' && ageBucket(v.years) !== 'unknown' ? v.years.slice(0, 6) : '';
  return { category: v.category, age: v.age, brand: v.brand.slice(0, 80), problem: Array.from(v.problem).slice(0, 1000).join(''), size, years, symptoms };
}
export function encodeTicket(input: Input, includeProblem = false): string {
  return '#/ticket?d=' + encodeURIComponent(JSON.stringify({ v: 1, input: { ...input, problem: includeProblem ? input.problem : '', symptoms: inputSymptoms(input) }, includesProblem: includeProblem }));
}
export function decodeTicket(hash: string): { input: Input; includesProblem: boolean } | null {
  try {
    if (hash.length > 18000) return null;
    const raw = new URLSearchParams(hash.split('?')[1]).get('d');
    if (!raw) return null;
    const payload = JSON.parse(raw);
    const input = cleanInput(payload.input);
    return payload.v === 1 && input ? { input, includesProblem: payload.includesProblem === true } : null;
  } catch { return null; }
}
export type LogEntry = { id: string; date: string; input: Input; status: Status; warranty?: string; where?: string };
export function readLog(): { entries: LogEntry[]; error: string } {
  try {
    const raw = localStorage.getItem('fixodds-log-v1');
    if (!raw) return { entries: [], error: '' };
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('invalid');
    const entries = parsed.flatMap((r: unknown) => {
      if (!r || typeof r !== 'object') return [];
      const x = r as LogEntry;
      const input = cleanInput(x.input);
      return input && typeof x.id === 'string' && typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && statuses.includes(x.status) ? [{ id: x.id, date: x.date, status: x.status, input, ...(typeof x.warranty === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.warranty) ? { warranty: x.warranty } : {}), ...(typeof x.where === 'string' && x.where ? { where: x.where.slice(0, 120) } : {}) }] : [];
    });
    return { entries, error: entries.length !== parsed.length ? 'Some damaged entries could not be read. Export the readable records before changing this log.' : '' };
  } catch { return { entries: [], error: 'This browser could not read your repair log. Storage may be blocked or damaged. New entries will stay in this tab; export CSV before leaving.' }; }
}
// Repairs in progress: planned, booked or with a repairer. Finishing one moves it into the log.
export const stages = ['Planned', 'Booked', 'With the repairer'] as const;
export type Stage = typeof stages[number];
export type Job = { id: string; created: string; input: Input; stage: Stage; where: string; appointment: string };
export function readJobs(): Job[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('fixodds-jobs-v1') || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((r: unknown) => {
      const x = r as Job; const input = r && typeof r === 'object' ? cleanInput(x.input) : null;
      return input && typeof x.id === 'string' && stages.includes(x.stage) && typeof x.created === 'string' ? [{ id: x.id, created: x.created, input, stage: x.stage, where: typeof x.where === 'string' ? x.where.slice(0, 120) : '', appointment: typeof x.appointment === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(x.appointment) ? x.appointment : '' }] : [];
    });
  } catch { return []; }
}
export function saveJobs(jobs: Job[]): string {
  try { localStorage.setItem('fixodds-jobs-v1', JSON.stringify(jobs)); return ''; }
  catch { return 'Your browser could not save repairs in progress. They remain in this tab only.'; }
}
export function saveLog(entries: LogEntry[]): string {
  try { localStorage.setItem('fixodds-log-v1', JSON.stringify(entries)); return ''; }
  catch { return 'Your browser could not save this log. Entries remain in this tab only; export CSV before leaving.'; }
}
export function logTotals(entries: LogEntry[]) {
  return entries.reduce((total, entry) => {
    if (entry.status !== 'Fixed') return total;
    total.fixed++;
    const factor = factorFor(entry.input);
    if (factor) { const saved = impact(1, factor); total.carbon += saved.carbon; total.waste += saved.waste; }
    else total.unquantified++;
    return total;
  }, { carbon: 0, waste: 0, fixed: 0, unquantified: 0 });
}
export const ordsColumns = ['id', 'data_provider', 'country', 'partner_product_category', 'product_category', 'product_category_id', 'brand', 'year_of_manufacture', 'product_age', 'repair_status', 'repair_barrier_if_end_of_life', 'group_identifier', 'event_date', 'problem'];
function csvCell(value: string) {
  // Prevent spreadsheet formula execution; double quotes preserve commas/newlines.
  const safe = /^[\s]*[=+@\-]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function exportOrds(entries: LogEntry[]): string {
  return [ordsColumns.join(','), ...entries.map(e => [e.id, 'FixOdds personal log', '', '', e.input.category, stats[e.input.category]?.ordsId || '', e.input.brand, '', e.input.years || '', e.status, '', '', e.date, e.input.problem].map(csvCell).join(','))].join('\r\n') + '\r\n';
}
