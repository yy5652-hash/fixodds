import { useEffect, useRef, useState } from 'react';
import type L from 'leaflet';
import 'leaflet/dist/leaflet.css';
export type Point = { lat: number; lon: number };
export type Place = Point & { display_name: string };
export type RepairPlace = Point & { name: string; kind: string; website: string; osm: string; phone: string; hours: string; distance: number };
type Services = { geocoder: string; tiles: string; radius: number };
let configPromise: Promise<Services> | undefined;
export async function services(): Promise<Services> {
  if (!configPromise) configPromise = fetch('./services.json').then(r => { if (!r.ok) throw Error('Service settings could not be loaded.'); return r.json(); }).catch(e => { configPromise = undefined; throw e; });
  return configPromise;
}
async function jsonFetch(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 16000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, referrerPolicy: 'strict-origin-when-cross-origin' });
    if (!response.ok) throw Error(`Service unavailable (${response.status}).`);
    return await response.json();
  } finally { clearTimeout(timer); }
}
let lastGeocode = 0;
const placeCache = new Map<string, { time: number; places: Place[] }>();
export async function geocode(query: string): Promise<Place[]> {
  const config = await services();
  const key = config.geocoder + ':' + query.trim().toLowerCase();
  let cached = placeCache.get(key);
  try { cached ||= JSON.parse(localStorage.getItem('fixodds-place:' + key) || 'null'); } catch { /* optional cache */ }
  if (cached && Date.now() - cached.time < 30 * 86400000 && Array.isArray(cached.places)) return cached.places;
  const request = async () => {
    let last = lastGeocode;
    try { last = Math.max(last, Number(localStorage.getItem('fixodds-geocode-last')) || 0); } catch { /* memory throttle remains */ }
    const wait = Math.min(1100, Math.max(0, 1100 - (Date.now() - last)));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastGeocode = Date.now();
    try { localStorage.setItem('fixodds-geocode-last', String(lastGeocode)); } catch { /* optional shared throttle */ }
    const url = new URL(config.geocoder);
    url.search = new URLSearchParams({ q: query.trim().slice(0, 120), format: 'jsonv2', limit: '5' }).toString();
    const response: unknown = await jsonFetch(url.href);
    if (!Array.isArray(response)) throw Error('Place search returned an unexpected response.');
    const places: Place[] = response.flatMap(r => typeof r.display_name === 'string' && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)) ? [{ display_name: r.display_name, lat: Number(r.lat), lon: Number(r.lon) }] : []);
    const value = { time: Date.now(), places };
    placeCache.set(key, value);
    try { localStorage.setItem('fixodds-place:' + key, JSON.stringify(value)); } catch { /* optional cache */ }
    return places;
  };
  return navigator.locks ? navigator.locks.request('fixodds-geocode', request) : request();
}
export function distance(a: Point, b: Point): number {
  const radians = (v: number) => v * Math.PI / 180;
  const h = Math.sin(radians(b.lat-a.lat)/2)**2 + Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(radians(b.lon-a.lon)/2)**2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0,1-h)));
}
type PlaceData = { built: string; kinds: string[]; places: [number, number, string, number, string, string, string?, string?][] };
let placeData: Promise<PlaceData> | undefined;
function loadPlaces(): Promise<PlaceData> {
  if (!placeData) placeData = fetch('./places.json').then(r => { if (!r.ok) throw Error('Repair places could not be loaded.'); return r.json(); }).catch(e => { placeData = undefined; throw e; });
  return placeData;
}
// The whole directory ships with the site, so the nearest places are worked out on this device.
export function nearest(data: PlaceData, point: Point, radius: number, limit = 40): RepairPlace[] {
  const found: RepairPlace[] = [];
  for (const [lat, lon, name, kind, website, osm, phone = '', hours = ''] of data.places) {
    if (Math.abs(lat - point.lat) * 111 > radius) continue;
    const d = distance(point, { lat, lon });
    if (d <= radius) found.push({ lat, lon, name: name || data.kinds[kind], kind: data.kinds[kind], website, osm, phone, hours, distance: d });
  }
  return found.sort((a, b) => a.distance - b.distance).slice(0, limit);
}
export async function nearby(point: Point): Promise<RepairPlace[]> {
  const config = await services();
  const data = await loadPlaces();
  // services.json radius is in metres. Sparse areas widen so the list is still useful.
  const close = nearest(data, point, config.radius / 1000);
  return close.length >= 3 ? close : nearest(data, point, config.radius / 250, 10);
}
function RepairMap({ point, places }: { point: Point; places: RepairPlace[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let map: L.Map | undefined;
    let disposed = false;
    Promise.all([services(), import('leaflet')]).then(([config, { default: L }]) => {
      if (disposed || !ref.current) return;
      map = L.map(ref.current, { scrollWheelZoom: false }).setView([point.lat,point.lon], 11);
      L.tileLayer(config.tiles, { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' }).on('tileerror', () => setError('Map tiles could not load. The list below still works.')).addTo(map);
      L.circleMarker([point.lat,point.lon], { radius: 6, color:'#1c1a16', fillColor:'#1c1a16', fillOpacity:1 }).bindPopup('Your search area').addTo(map);
      for (const place of places) {
        const popup = document.createElement('span');
        popup.textContent = place.name;
        L.circleMarker([place.lat,place.lon], { radius:8, color:'#1c1a16', weight:2, fillColor:'#b8400c', fillOpacity:1 }).bindPopup(popup).addTo(map);
      }
    }).catch(() => setError('Map settings could not load. Use the list below.'));
    return () => { disposed = true; map?.remove(); };
  }, [point, places]);
  return <><div className="map" ref={ref} role="region" aria-label="Nearby repair locations map" />{error && <p role="status">{error}</p>}</>;
}
export default function Finder() {
  const [query,setQuery] = useState('');
  const [matches,setMatches] = useState<Place[]>([]);
  const [point,setPoint] = useState<Point>();
  const [places,setPlaces] = useState<RepairPlace[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [searched,setSearched] = useState(false);
  const [area,setArea] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function find(p: Point, name: string) {
    setBusy(true); setError(''); setMatches([]); setSearched(false); setPoint(undefined);
    try { const result = await nearby(p); if (alive.current) { setPlaces(result); setPoint(p); setArea(name); setSearched(true); } }
    catch(e) { if (alive.current) setError(e instanceof Error ? e.message : 'Search failed.'); }
    finally { if (alive.current) setBusy(false); }
  }
  async function search() {
    if (!query.trim() || busy) return;
    setBusy(true); setError(''); setMatches([]);
    try { const result = await geocode(query); if (alive.current) { setMatches(result); if (!result.length) setError('No matching place. Try a town and country, or use your location.'); } }
    catch { if (alive.current) setError('Place search is unavailable. Try your location or the directories below.'); }
    finally { if (alive.current) setBusy(false); }
  }
  function locate() {
    if (!navigator.geolocation) { setError('Location is not supported here. Enter a town instead.'); return; }
    setBusy(true); setError('');
    navigator.geolocation.getCurrentPosition(p => { if (alive.current) void find({ lat:p.coords.latitude,lon:p.coords.longitude }, 'your location'); }, () => { if (alive.current) { setBusy(false); setError('Location was not available or permission was denied. Enter a town instead.'); } }, { timeout:10000, maximumAge:300000, enableHighAccuracy:false });
  }
  return <section className="finder" aria-labelledby="finder-heading">
    <h3 id="finder-heading">A repairer near you</h3>
    <p>Nearest of 20,000+ mapped repair cafes and repair shops, worked out on this device. A typed town goes to OpenStreetMap place search, and the map loads tiles for that area from OpenStreetMap. Your problem description is never sent.</p>
    <form onSubmit={e => { e.preventDefault(); void search(); }} className="place-form"><label>Town or place<input value={query} onChange={e=>setQuery(e.target.value)} maxLength={120} placeholder="e.g. Bristol, UK" required /></label><button disabled={busy} type="submit">Search places</button><button disabled={busy} type="button" className="secondary" onClick={locate}>Use my location</button></form>
    <p className="small">Town-level searches only; avoid a private address. © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>. <a href="https://operations.osmfoundation.org/policies/nominatim/">Place-search usage policy</a>.</p>
    {busy && <p role="status">Looking for repair help…</p>}
    {error && <p role="alert" className="notice">{error}</p>}
    {matches.length>0 && <div className="place-choices"><p>Choose your area:</p>{matches.map((p,i)=><button className="secondary" key={i} disabled={busy} onClick={()=>void find(p,p.display_name)}>{p.display_name}</button>)}</div>}
    {searched && point && <><p className="eyebrow">{places.length} mapped places near {area}</p><RepairMap point={point} places={places}/><p className="small">Map listings may be incomplete or out of date. Call ahead about your device, opening times and fees. A shop listing is not a repair recommendation.</p>{places.length === 0 ? <p className="notice">No repair locations are mapped nearby. That does not mean none exist: check Repair Cafe International or Restarters below.</p> : <ol className="repair-list">{places.map(p=><li key={p.osm}><div><strong>{p.name}</strong><span>{p.distance.toFixed(1)} km away · {p.kind}</span>{p.phone && <a href={`tel:${p.phone}`}>{p.phone}</a>}{p.hours && <span>Hours: {p.hours}</span>}<a href={`https://www.openstreetmap.org/directions?to=${p.lat},${p.lon}`} target="_blank" rel="noopener noreferrer">Directions ↗</a>{p.website && <a href={p.website} target="_blank" rel="noreferrer nofollow">Website ↗</a>}</div><a href={`https://www.openstreetmap.org/${p.osm}`} target="_blank" rel="noreferrer">View listing ↗</a></li>)}</ol>}<a className="small" href="https://www.openstreetmap.org/fixthemap">Report a map issue</a></>}
  </section>;
}
