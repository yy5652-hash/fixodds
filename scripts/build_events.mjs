// Snapshot upcoming community repair events from the Restarters.net public API into public/events.json.
// Runs before each deploy and on a daily schedule. Only event fields are kept: no organiser emails or phone numbers.
import { writeFileSync } from 'node:fs';
const api = 'https://restarters.net/api/v2';
const today = new Date().toISOString().slice(0, 10);
async function get(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'FixOdds/1.0 (+https://github.com/yy5652-hash/fixodds)' }, signal: AbortSignal.timeout(30000) });
      if (response.ok) return response.json();
      if (response.status < 500) throw Error(`${url}: ${response.status}`);
    } catch (error) { if (attempt === 2) throw error; }
    await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
  }
}
const networks = (await get(`${api}/networks`)).data;
const seen = new Map();
for (const network of networks) {
  const body = await get(`${api}/networks/${network.id}/events?start=${today}`);
  for (const e of Array.isArray(body) ? body : body.data || []) {
    const lat = Number(e.lat), lng = Number(e.lng);
    if (!e.approved || seen.has(e.id) || typeof e.start !== 'string') continue;
    if (!e.online && !(Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng))) continue;
    seen.set(e.id, [e.id, e.start, e.end || '', e.timezone || '', String(e.title || '').slice(0, 120), String(e.location || '').slice(0, 200), e.online ? null : +lat.toFixed(5), e.online ? null : +lng.toFixed(5), String(e.group?.name || '').slice(0, 120), e.online ? 1 : 0, String(e.group?.location?.country || '')]);
  }
}
const events = [...seen.values()].sort((a, b) => a[1].localeCompare(b[1]));
if (events.length < 20) throw Error(`Only ${events.length} events returned; keeping the previous snapshot.`);
writeFileSync('public/events.json', JSON.stringify({ built: new Date().toISOString(), source: 'Restarters.net (The Restart Project) public events API', networks: networks.length, fields: ['id', 'start', 'end', 'timezone', 'title', 'location', 'lat', 'lng', 'group', 'online', 'country'], events }));
console.log(`${events.length} upcoming events from ${networks.length} networks`);
