// Reads the common OpenStreetMap opening_hours forms ("Mo-Fr 09:00-18:00; Sa 10:00-14:00", "24/7", "Su off").
// Anything else (months, weeks, holidays, sunrise) returns null, so the UI says "hours unknown" instead of guessing.
const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
type Week = ([number, number][] | undefined)[];
function daySet(selector: string): number[] | null {
  const out = new Set<number>();
  for (const part of selector.split(',').map(s => s.trim()).filter(Boolean)) {
    if (part === 'PH') continue;
    const m = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(part);
    if (!m) return null;
    const a = days.indexOf(m[1]), b = m[2] ? days.indexOf(m[2]) : a;
    for (let d = a; ; d = (d + 1) % 7) { out.add(d); if (d === b) break; }
  }
  return [...out];
}
function minutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v <= 1440 && Number(m[2]) < 60 ? v : null;
}
export function parseHours(text: string): Week | null {
  const value = text.trim().replace(/(\d)\s*-\s*(\d)/g, '$1-$2');
  if (!value) return null;
  const week: Week = Array.from({ length: 7 }, () => undefined);
  const rules = value.split(';').flatMap(r => r.split(/(?<=\d|off|closed),\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/)).map(r => r.trim()).filter(Boolean);
  for (const rule of rules) {
    if (rule === '24/7') { for (let d = 0; d < 7; d++) week[d] = [[0, 1440]]; continue; }
    const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)?\s*(.*)$/.exec(rule);
    if (!m) return null;
    const selector = (m[1] || '').replace(/\s+/g, '');
    if (selector && selector.split(',').every(s => s === 'PH' || !s)) continue;
    const ds = selector ? daySet(selector) : [0, 1, 2, 3, 4, 5, 6];
    if (!ds) return null;
    const body = m[2].trim();
    let spans: [number, number][];
    if (/^(off|closed)$/i.test(body)) spans = [];
    else if (body === '24/7' || body === '00:00-24:00') spans = [[0, 1440]];
    else {
      spans = [];
      for (const range of body.split(',').map(s => s.trim())) {
        const r = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(range);
        const a = r && minutes(r[1]), b = r && minutes(r[2]);
        if (a == null || b == null) return null;
        spans.push([a, b]);
      }
    }
    for (const d of ds) week[d] = spans;
  }
  return week;
}
// Open at the given local time? Ranges past midnight ("18:00-02:00") carry into the next morning.
export function openAt(text: string, when: Date): boolean | null {
  const week = parseHours(text);
  if (!week) return null;
  const day = (when.getDay() + 6) % 7, now = when.getHours() * 60 + when.getMinutes();
  const today = week[day] || [], yesterday = week[(day + 6) % 7] || [];
  if (today.some(([a, b]) => b > a ? now >= a && now < b : now >= a)) return true;
  if (yesterday.some(([a, b]) => b <= a && now < b)) return true;
  return false;
}
