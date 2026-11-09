import { t } from './i18n';
import statsData from './data/stats.json';
import factorData from './data/factors.json';
import symptomJson from './data/symptoms.json';
export const symptomData = symptomJson as Record<string, { label: string; terms: string[] }>;
export const symptomIds = Object.keys(symptomData);
export const categories = Object.keys(statsData);
export const ages = ['unknown', '0-2', '3-5', '6-10', '11-20', '21+'] as const;
export const statuses = ['Fixed', 'Repairable', 'End of life'] as const;
export type Status = typeof statuses[number];
export type Input = { category: string; age: string; brand: string; problem: string; deviceType?: string; modelNumber?: string; size?: string; years?: string; symptoms?: string[]; rejectedSymptoms?: string[] };
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
  // Keep negation local so a healthy battery does not hide a screen fault.
  const clauses = problem.split(/[.!?;,\n]|\b(?:but|however|maar|aber|sondern|mais|pourtant)\b/iu).map(symptomText);
  const before = /(?:no |not |geen |kein(?:e|en)? |nicht |pas de |aucun(?:e)? |not (?:the |a |an )?|no (?:problem|issue|trouble)s? (?:with )?(?:the )?|geen (?:probleem|problemen) (?:met )?(?:(?:de|het|een) )?|nicht (?:der |die |das |am |den )?|kein(?:e|en)? problem(?:e)? (?:mit )?(?:dem |der )?|pas (?:de (?:problème|probleme|souci) (?:avec )?)?(?:la |le |les |l )?)$/u;
  const after = /^\s*(?:(?:is|are|works?|seems?)\s+(?:fine|ok(?:ay)?|well|normally|working (?:fine|well|normally|properly))|(?:ist|sind|funktioniert)\s+(?:in ordnung|gut|ok(?:ay)?|einwandfrei)|(?:is|werkt)\s+(?:goed|prima|in orde)|(?:va|fonctionne)\s+bien|(?:est|sont)\s+(?:en bon état|en bon etat|ok)|(?:has|have) no (?:problem|issue))/u;
  return symptomIds.filter(id => clauses.some(text => symptomData[id].terms.some(term => {
    let start = text.indexOf(term);
    while (start !== -1) {
      if (!before.test(text.slice(0, start).trimEnd() + ' ') && !after.test(text.slice(start + term.length))) return true;
      start = text.indexOf(term, start + term.length);
    }
    return false;
  })));
};
export const inputSymptoms = (input: Input) => [...new Set([...detectSymptoms(input.problem).filter(id => !input.rejectedSymptoms?.includes(id)), ...(input.symptoms || [])])].filter(id => symptomIds.includes(id)).sort();
export function toggleSymptom(input: Input, id: string): Input {
  const on = inputSymptoms(input).includes(id);
  return { ...input, symptoms: on ? (input.symptoms || []).filter(s => s !== id) : [...(input.symptoms || []), id], rejectedSymptoms: on ? [...new Set([...(input.rejectedSymptoms || []), id])] : (input.rejectedSymptoms || []).filter(s => s !== id) };
}
export function changeCategory(input: Input, category: string): Input {
  return category === input.category ? input : { ...input, category, size: factors[category]?.default || undefined, problem: '', symptoms: [], rejectedSymptoms: [], deviceType: '', modelNumber: '' };
}
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
export const breakEven = (pFixed: number, replacement: number) => pFixed * replacement;
export function quotePasses(pFixed: number, replacement: number, quote: number) { return quote <= breakEven(pFixed, replacement); }
export const friendly: Record<string, string> = { 'Mobile': 'Mobile phone', 'Flat screen': 'TV or monitor', 'Misc': 'Other electrical item', 'PC accessory': 'Computer accessory', 'Large home electrical': 'Large household appliance', 'Small home electrical': 'Small household appliance', 'Hi-Fi integrated': 'Hi-fi system', 'Hi-Fi separates': 'Hi-fi component', 'Hair & beauty item': 'Hair & beauty appliance', 'Battery/charger/adapter': 'Battery, charger or adapter' };
export const englishLabel = (category: string) => friendly[category] || category;
export const label = (category: string) => t(englishLabel(category));

const safetyRules: [string, RegExp][] = [
  ['Swollen or damaged battery', /swoll\w*|bulg\w*|bloated|hinchad\w*|gonfi\w*|inchad\w*|opgezwoll\w*|aufgebl\w*|geschwoll\w*|battery.{0,20}(leak|punctur)|batter\w*.{0,20}(gonfl|geschwoll|aufgebl|hinch|opgezwoll|inflat|inchad)|accu.{0,15}(bol|opgezwoll)|鼓包|电池.{0,6}(膨胀|漏液)|電池.{0,6}(膨脹|漏液)/iu],
  ['Smoke, burning or sparks', /\b(smoke|smoking|sparks?|sparking|burning|rauch|raucht|funken|schmor\w*|fumée|fume|brûlé|brûlure|étincelle\w*|humo|quemado|chispas?|rook|vonken|brandlucht|fumo|bruciato|scintille|fumaça|queimado|faísca\w*)\b|étincelle\w*|冒烟|冒煙|焦味|烧焦|燒焦|火花/iu],
  ['Possible gas hazard', /\b(gas|gaz|gás|gasse|gaslek)\b|煤气|煤氣|燃气|燃氣|漏气|漏氣/iu],
  ['Water leak near electrics', /water.{0,20}leak|leak.{0,20}water|fuite.{0,10}eau|fuga.{0,10}(agua|água)|wasser.{0,15}(leck|tritt|läuft)|waterlekkage|lekt|perdita.{0,10}acqua|漏水/iu],
  ['Microwave high-voltage parts', /microwave|micro[ -]?ondes?|mikrowelle|microondas|magnetron|microonde|微波炉|微波爐/iu],
  ['Opening mains-powered equipment', /\b(mains|power[ -]suppl(?:y|ies)|capacitors?|high[ -]voltage|crt)\b|open.{0,25}(plug|socket|charger|kettle|toaster|appliance)|ouvr.{0,25}(secteur|alimentation)|öffn.{0,25}(netz|steck)|abrir.{0,25}(red|enchufe|fuente)|open.{0,25}(netspann|stekker)|alta tension|netspanning|netzspannung|市电|市電|拆.{0,6}(插座|电源|電源)|高压|高壓/iu],
];
export function safety(input: Input): string[] {
  const text = normalize(`${input.deviceType || ''}\n${input.problem}`);
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
  'Spare parts too expensive': 'Get a written parts-and-labour quote and compare it with the illustrative repair-spending guide.',
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
  const deviceType = typeof v.deviceType === 'string' ? Array.from(v.deviceType).slice(0, 80).join('') : '';
  const modelNumber = typeof v.modelNumber === 'string' ? Array.from(v.modelNumber).slice(0, 80).join('') : '';
  const rejectedSymptoms = Array.isArray(v.rejectedSymptoms) ? v.rejectedSymptoms.filter((x): x is string => typeof x === 'string' && symptomIds.includes(x)) : [];
  return { category: v.category, age: v.age, brand: v.brand.slice(0, 80), problem: Array.from(v.problem).slice(0, 1000).join(''), deviceType, modelNumber, size, years, symptoms, rejectedSymptoms };
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
export const intentions = ['replace', 'discard', 'repair', 'undecided'] as const;
export type Intention = typeof intentions[number];
export type Answer = 'yes' | 'no' | 'not sure';
export type Evidence = { intention?: Intention; purchasePostponed?: Answer; stillWorking?: Answer; checkedOn?: string };
const answer = (v: unknown): v is Answer => v === 'yes' || v === 'no' || v === 'not sure';
const dateOnly = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
function evidence(x: Evidence): Evidence {
  return { ...(intentions.includes(x.intention!) ? { intention: x.intention } : {}), ...(answer(x.purchasePostponed) ? { purchasePostponed: x.purchasePostponed } : {}), ...(answer(x.stillWorking) ? { stillWorking: x.stillWorking } : {}), ...(dateOnly(x.checkedOn) ? { checkedOn: x.checkedOn } : {}) };
}
export type Route = 'diy' | 'cafe' | 'shop';
export type LogEntry = Evidence & { id: string; date: string; input: Input; status: Status; warranty?: string; where?: string; route?: Route };
const validRoute = (v: unknown): v is Route => v === 'diy' || v === 'cafe' || v === 'shop';
export function readLog(): { entries: LogEntry[]; error: string } {
  try {
    const raw = localStorage.getItem('fixodds-log-v1');
    if (!raw) return { entries: [], error: '' };
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('invalid');
    const entries = parsed.flatMap((r: unknown) => {
      if (!r || typeof r !== 'object') return [];
      const x = r as LogEntry;
      const input = cleanSavedInput(x.input);
      return input && typeof x.id === 'string' && typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && statuses.includes(x.status) ? [{ id: x.id, date: x.date, status: x.status, input, ...evidence(x), ...(validRoute(x.route) ? { route: x.route } : {}), ...(typeof x.warranty === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.warranty) ? { warranty: x.warranty } : {}), ...(typeof x.where === 'string' && x.where ? { where: x.where.slice(0, 120) } : {}) }] : [];
    });
    return { entries, error: entries.length !== parsed.length ? 'Some damaged entries could not be read. Export the readable records before changing this log.' : '' };
  } catch { return { entries: [], error: 'This browser could not read your repair log. Storage may be blocked or damaged. New entries will stay in this tab; export CSV before leaving.' }; }
}
// Pending enquiries are explicit: opening a messaging app does not establish that anything was sent.
export const stages = ['Planned', 'Enquiry sent', 'Booked', 'With the repairer', 'Waiting for parts', 'Done'] as const;
export type Stage = typeof stages[number] | 'Enquiry sent?';
export type Job = Evidence & { id: string; created: string; input: Input; stage: Stage; where: string; appointment: string; route?: Route; next?: string; stepDone?: boolean; eventId?: number; eventLink?: string; eventStart?: string; beforeEnquiry?: Stage };
const validStage = (v: unknown): v is Stage => v === 'Enquiry sent?' || stages.includes(v as typeof stages[number]);
export const sameItem = (a: Input, b: Input) => a.category === b.category && ['brand', 'deviceType', 'modelNumber'].every(k => normalize(a[k as keyof Input] as string || '') === normalize(b[k as keyof Input] as string || ''));
function cleanSavedInput(value: Input): Input | null {
  const unknown = value?.category === '', input=cleanInput(unknown ? {...value,category:'Misc'} : value);
  return input && unknown ? {...input,category:''} : input;
}
export function readJobs(): Job[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('fixodds-jobs-v1') || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((r: unknown) => {
      if (!r || typeof r !== 'object') return [];
      const x = r as Job, input = cleanSavedInput(x.input);
      return input && typeof x.id === 'string' && validStage(x.stage) && typeof x.created === 'string' ? [{ id: x.id, created: x.created, input, stage: x.stage, where: typeof x.where === 'string' ? x.where.slice(0, 120) : '', appointment: typeof x.appointment === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(x.appointment) ? x.appointment : '', ...evidence(x), ...(validRoute(x.route) ? { route: x.route } : {}), ...(typeof x.next === 'string' ? { next: x.next.slice(0, 500) } : {}), ...(x.stepDone === true ? { stepDone: true } : {}), ...(Number.isInteger(x.eventId) ? { eventId: x.eventId } : {}), ...(typeof x.eventLink === 'string' && /^https:\/\/restarters\.net\/party\/view\/\d+$/.test(x.eventLink) ? { eventLink: x.eventLink } : {}), ...(typeof x.eventStart === 'string' && Number.isFinite(Date.parse(x.eventStart)) ? { eventStart: x.eventStart } : {}), ...(validStage(x.beforeEnquiry) && x.beforeEnquiry !== 'Enquiry sent?' ? { beforeEnquiry: x.beforeEnquiry } : {}) }] : [];
    });
  } catch { return []; }
}
export type SavedStep = { route: Route; guideTitle?: string; intention?: Intention; event?: { id: number; group: string; date: string; start: string; link: string } };
export function saveStep(jobs: Job[], input: Input, step: SavedStep, id: string = crypto.randomUUID(), created = new Date().toISOString().slice(0, 10)): Job[] {
  const old = jobs.find(j => j.stage !== 'Done' && sameItem(j.input, input));
  const event = step.route === 'cafe' ? step.event : undefined;
  const changed = !!old?.route && (old.route !== step.route || !!event && old.eventId !== event.id);
  const next = step.route === 'diy' ? step.guideTitle ? `Follow the guide: ${step.guideTitle}` : 'Find a matching guide' : step.route === 'cafe' ? event ? `${event.group}, ${event.date}` : 'Find a repair event' : 'Ask a repairer for a diagnosis and quote';
  const local = event ? new Date(event.start) : undefined;
  const appointment = local ? `${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}-${String(local.getDate()).padStart(2,'0')}T${String(local.getHours()).padStart(2,'0')}:${String(local.getMinutes()).padStart(2,'0')}` : '';
  const job: Job = { ...old, id: old?.id || id, created: old?.created || created, input, stage: changed ? 'Planned' : old?.stage || 'Planned', beforeEnquiry: changed ? undefined : old?.beforeEnquiry, where: event?.group || (changed ? '' : old?.where || ''), route: step.route, next, stepDone: false, appointment: event ? appointment : changed ? '' : old?.appointment || '', eventId: event?.id, eventLink: event?.link, eventStart: event?.start, ...(step.intention ? { intention: step.intention } : {}) };
  return old ? jobs.map(j => j.id === old.id ? job : j) : [job, ...jobs];
}
export function openEnquiry(job: Job, where: string): Job { return { ...job, where, stage: 'Enquiry sent?', beforeEnquiry: job.stage === 'Enquiry sent?' ? job.beforeEnquiry : job.stage }; }
export function confirmEnquiry(job: Job, sent: boolean): Job {
  if (job.stage !== 'Enquiry sent?') return job;
  const prior = job.beforeEnquiry || 'Planned';
  return { ...job, stage: sent ? stages.indexOf(prior as typeof stages[number]) > 1 ? prior : 'Enquiry sent' : prior, beforeEnquiry: undefined, stepDone: sent || job.stepDone };
}
export function outcomeJob(job: Job, status: Status): Job {
  return { ...job, stage: status === 'Repairable' ? 'Waiting for parts' : 'Done', next: status === 'Repairable' ? 'Order or ask about the part' : '', stepDone: false, beforeEnquiry: undefined };
}
export function followupDue(entry: LogEntry, now = new Date()): boolean {
  return entry.status === 'Fixed' && !entry.checkedOn && now.getTime() >= Date.parse(entry.date + 'T00:00:00Z') + 30 * 86400000;
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
    if (entry.purchasePostponed === 'yes') total.postponed++;
    if (entry.stillWorking === 'yes') total.inUse++;
    const factor = factorFor(entry.input);
    if (factor) { const saved = impact(1, factor); total.carbon += saved.carbon; total.waste += saved.waste; }
    else total.unquantified++;
    return total;
  }, { carbon: 0, waste: 0, fixed: 0, postponed: 0, inUse: 0, unquantified: 0 });
}
export const ordsColumns = ['id', 'data_provider', 'country', 'partner_product_category', 'product_category', 'product_category_id', 'brand', 'year_of_manufacture', 'product_age', 'repair_status', 'repair_barrier_if_end_of_life', 'group_identifier', 'event_date', 'problem'];
function csvCell(value: string) {
  // Prevent spreadsheet formula execution; double quotes preserve commas/newlines.
  const safe = /^[\s]*[=+@\-]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function exportOrds(entries: LogEntry[]): string {
  return [ordsColumns.join(','), ...entries.map(e => [e.id, 'FixOdds personal log', '', '', e.input.category, stats[e.input.category]?.ordsId || '', e.input.brand, '', e.input.years || '', e.status, '', '', e.date, [e.input.problem, e.input.deviceType && `${t('Device type')}: ${e.input.deviceType}`, e.input.modelNumber && `${t('Model number')}: ${e.input.modelNumber}`].filter(Boolean).join('\n')].map(csvCell).join(','))].join('\r\n') + '\r\n';
}

export const pilotColumns = ['id', 'created', 'outcome_date', 'category', 'device_type', 'brand', 'model_number', 'problem', 'route', 'stage', 'next_step', 'intention', 'outcome', 'purchase_postponed', 'still_working', 'checked_on'];
export function exportPilot(entries: LogEntry[], jobs: Job[] = []): string {
  const rows = [...entries.map(e => [e.id, '', e.date, e.input.category, e.input.deviceType || '', e.input.brand, e.input.modelNumber || '', e.input.problem, e.route || '', 'Done', '', e.intention || '', e.status, e.purchasePostponed || '', e.stillWorking || '', e.checkedOn || '']), ...jobs.map(j => [j.id, j.created, '', j.input.category, j.input.deviceType || '', j.input.brand, j.input.modelNumber || '', j.input.problem, j.route || '', j.stage, j.next || '', j.intention || '', '', '', '', ''])];
  return [pilotColumns.join(','), ...rows.map(row => row.map(csvCell).join(','))].join('\r\n') + '\r\n';
}
export function endOfLifeLinks(input: Input, area = '') {
  const model = [input.brand, input.deviceType || englishLabel(input.category), input.modelNumber, 'parts'].filter(Boolean).join(' ');
  return { parts: `https://www.ifixit.com/Search?query=${encodeURIComponent(model)}`, recycling: /\b(?:UK|United Kingdom|Great Britain|England|Scotland|Wales|Northern Ireland)\b/i.test(area) ? 'https://www.recyclenow.com/recycling-locator' : `https://www.google.com/search?q=${encodeURIComponent(`e-waste recycling near ${area || 'me'}`)}` };
}
