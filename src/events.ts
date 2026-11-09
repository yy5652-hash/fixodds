// Upcoming community repair events (Restarters.net snapshot, rebuilt daily) and calendar files for them.
export type Point = { lat: number; lon: number };
export type Area = Point & { name: string };
export type RepairEvent = { id: number; start: string; end: string; timezone: string; title: string; location: string; lat: number | null; lon: number | null; group: string; online: boolean; country: string; distance?: number; description?: string };
type Row = [number, string, string, string, string, string, number | null, number | null, string, number, string, string?];
type EventData = { built: string; events: Row[] };
export function distance(a: Point, b: Point): number {
  const radians = (v: number) => v * Math.PI / 180;
  const h = Math.sin(radians(b.lat - a.lat) / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lon - a.lon) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export const eventLink = (e: RepairEvent) => `https://restarters.net/party/view/${e.id}`;
export function readRows(data: EventData): RepairEvent[] {
  return data.events.map(([id, start, end, timezone, title, location, lat, lon, group, online, country, description]) => ({ id, start, end, timezone, title, location, lat, lon, group, online: !!online, country, ...(description ? { description } : {}) }));
}
// Events that have not ended, nearest first within the radius; online events are listed after in-person ones.
export function upcoming(events: RepairEvent[], now: Date, area?: Point, radius = 50, limit = 30): RepairEvent[] {
  const live = events.filter(e => new Date(e.end || e.start).getTime() > now.getTime());
  if (!area) return live.slice(0, limit);
  const near = live.flatMap(e => e.lat == null || e.lon == null ? [] : [{ ...e, distance: distance(area, { lat: e.lat, lon: e.lon }) }]).filter(e => e.distance <= radius);
  return near.sort((a, b) => a.start.localeCompare(b.start) || a.distance - b.distance).slice(0, limit);
}
export function nextNear(events: RepairEvent[], now: Date, area: Point, radius = 25) { return upcoming(events, now, area, radius, 1)[0]; }
let cache: Promise<{ built: string; events: RepairEvent[] }> | undefined;
function loadSnapshot() {
  if (!cache) cache = fetch('./events.json').then(r => { if (!r.ok) throw Error('Repair events could not be loaded.'); return r.json(); }).then((data: EventData) => ({ built: data.built, events: readRows(data) })).catch(e => { cache = undefined; throw e; });
  return cache;
}
export const loadEvents = (): Promise<RepairEvent[]> => loadSnapshot().then(d => d.events);
export const eventsBuilt = () => loadSnapshot().then(d => d.built).catch(() => '');
export type EventStatus = 'FULL' | 'Cancelled' | 'Booking required';
export function eventStatuses(event: Pick<RepairEvent, 'title' | 'description'>): EventStatus[] {
  const text = `${event.title} ${event.description || ''}`.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ');
  const labels: EventStatus[] = [];
  if (/\b(full(?:y booked)?|sold[ -]out)\b/i.test(text.replace(/\b(?:not|never)\s+full\b/gi, ''))) labels.push('FULL');
  if (/\bcancell?ed\b/i.test(text.replace(/\b(?:not|never)\s+cancell?ed\b/gi, ''))) labels.push('Cancelled');
  const booking = text.replace(/\b(?:no\s+(?:booking(?:s)?|registration|reservation)(?:\s+is)?\s+(?:required|essential|mandatory)|(?:booking(?:s)?|registration|reservation)(?:\s+is)?\s+not\s+(?:required|essential|mandatory))\b/gi, '');
  if (/\b(?:booking(?:s)?|registration|reservation)(?:\s+is)?\s+(?:required|essential|mandatory)\b|\bmust\s+book\b|\bbook(?:ing)?\s+in\s+advance\b/i.test(booking)) labels.push('Booking required');
  return labels;
}
export function formatWhen(e: RepairEvent, locale = 'en-GB') {
  const start = new Date(e.start), end = e.end ? new Date(e.end) : undefined;
  const opts: Intl.DateTimeFormatOptions = { timeZone: e.timezone || undefined };
  try {
    const day = start.toLocaleDateString(locale, { ...opts, weekday: 'short', day: 'numeric', month: 'short' });
    const time = (d: Date) => d.toLocaleTimeString(locale, { ...opts, hour: '2-digit', minute: '2-digit' });
    return `${day} · ${time(start)}${end ? '–' + time(end) : ''}`;
  } catch { return start.toISOString().slice(0, 16).replace('T', ' '); }
}
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// Lines over 75 octets are folded as RFC 5545 requires.
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 74;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--;
    out.push(rest.slice(0, cut)); rest = ' ' + rest.slice(cut);
  }
  return [...out, rest].join('\r\n');
}
export type CalendarItem = { uid: string; start: string; end?: string; allDay?: boolean; title: string; location?: string; description?: string; url?: string; alarmMinutes?: number };
export function ics(items: CalendarItem[], stamp = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FixOdds//Repair calendar//EN', 'CALSCALE:GREGORIAN'];
  for (const item of items) {
    lines.push('BEGIN:VEVENT', `UID:${item.uid}`, `DTSTAMP:${icsDate(stamp.toISOString())}`);
    if (item.allDay) { const d = item.start.slice(0, 10).replace(/-/g, ''); lines.push(`DTSTART;VALUE=DATE:${d}`); }
    else { lines.push(`DTSTART:${icsDate(item.start)}`); if (item.end) lines.push(`DTEND:${icsDate(item.end)}`); }
    lines.push(`SUMMARY:${icsText(item.title)}`);
    if (item.location) lines.push(`LOCATION:${icsText(item.location)}`);
    if (item.description) lines.push(`DESCRIPTION:${icsText(item.description)}`);
    if (item.url) lines.push(`URL:${item.url}`);
    if (item.alarmMinutes != null) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(item.title)}`, `TRIGGER:-PT${item.alarmMinutes}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
export const eventCalendar = (e: RepairEvent, extra = '') => ics([{ uid: `restarters-${e.id}@fixodds`, start: e.start, end: e.end || undefined, title: `${e.group || 'Repair event'}: ${e.title}`, location: e.location, description: [extra, `Details and booking: ${eventLink(e)}`].filter(Boolean).join('\n\n'), url: eventLink(e), alarmMinutes: 24 * 60 }]);
export function download(name: string, text: string, type = 'text/calendar;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// The last searched town is kept on this device so the finder, events and routes share it.
const AREA_KEY = 'fixodds-area-v1';
export function readArea(): Area | undefined {
  try { const v = JSON.parse(localStorage.getItem(AREA_KEY) || 'null'); return v && Number.isFinite(v.lat) && Number.isFinite(v.lon) && typeof v.name === 'string' ? v : undefined; } catch { return undefined; }
}
export function saveArea(area: Area) {
  try { localStorage.setItem(AREA_KEY, JSON.stringify({ lat: +area.lat.toFixed(3), lon: +area.lon.toFixed(3), name: area.name.slice(0, 120) })); } catch { /* optional */ }
  window.dispatchEvent(new Event('fixodds-area'));
}
