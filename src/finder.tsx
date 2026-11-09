import { t, useLang } from './i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import type L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Clock, Copy, Mail, MessageCircle, Phone, Send } from 'lucide-react';
import { shortTicket } from './ticket';
import { enquiryLinks, enquiryText, firstPhone } from './enquiry';
import { distance, readArea, saveArea, type Area } from './events';
export { distance };
import { number } from './format';
import { openAt } from './hours';
import { englishLabel, type Input } from './core';
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
    // Nominatim can return a city and its district under the same name; keep the first of each.
    const places: Place[] = response.flatMap(r => typeof r.display_name === 'string' && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)) ? [{ display_name: r.display_name, lat: Number(r.lat), lon: Number(r.lon) }] : []).filter((p, i, all) => all.findIndex(q => q.display_name === p.display_name) === i);
    const value = { time: Date.now(), places };
    placeCache.set(key, value);
    try { localStorage.setItem('fixodds-place:' + key, JSON.stringify(value)); } catch { /* optional cache */ }
    return places;
  };
  return navigator.locks ? navigator.locks.request('fixodds-geocode', request) : request();
}
export type PlaceData = { built: string; kinds: string[]; places: [number, number, string, number, string, string, string?, string?][] };
let placeData: Promise<PlaceData> | undefined;
export function loadPlaces(): Promise<PlaceData> {
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
export async function nearby(point: Point, radius?: number): Promise<RepairPlace[]> {
  const config = await services();
  const data = await loadPlaces();
  if (radius) return nearest(data, point, radius, 300);
  // services.json radius is in metres. Sparse areas widen so the list is still useful.
  const close = nearest(data, point, config.radius / 1000);
  return close.length >= 3 ? close : nearest(data, point, config.radius / 250, 10);
}
export type Marker = Point & { label: string; tone?: 'event' | 'place' };
export function MapView({ point, markers, name = 'Nearby repair locations map' }: { point: Point; markers: Marker[]; name?: string }) {
  const { lang } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const key = markers.map(m => `${m.lat},${m.lon}`).join('|');
  useEffect(() => {
    let map: L.Map | undefined;
    let disposed = false;
    Promise.all([services(), import('leaflet')]).then(([config, { default: L }]) => {
      if (disposed || !ref.current) return;
      map = L.map(ref.current, { scrollWheelZoom: false }).setView([point.lat,point.lon], 11);
      L.tileLayer(config.tiles, { maxZoom: 19, attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">${t('OpenStreetMap contributors')}</a>` }).on('tileerror', () => setError('Map tiles could not load. The list below still works.')).addTo(map);
      L.circleMarker([point.lat,point.lon], { radius: 6, color:'#1c1a16', fillColor:'#1c1a16', fillOpacity:1 }).bindPopup(t('Your search area')).addTo(map);
      const bounds = L.latLngBounds([[point.lat, point.lon]]);
      for (const m of markers) {
        const popup = document.createElement('span');
        popup.textContent = m.label;
        L.circleMarker([m.lat,m.lon], { radius:8, color:'#1c1a16', weight:2, fillColor:m.tone==='event'?'#1f7a4d':'#b8400c', fillOpacity:1 }).bindPopup(popup).addTo(map);
        bounds.extend([m.lat, m.lon]);
      }
      if (markers.length) map.fitBounds(bounds.pad(0.15), { maxZoom: 13 });
    }).catch(() => setError('Map settings could not load. Use the list below.'));
    return () => { disposed = true; map?.remove(); };
  }, [point.lat, point.lon, key, lang]);
  return <><div className="map" ref={ref} role="region" aria-label={t(name)} />{error && <p role="status">{t(error)}</p>}</>;
}
// Town search shared by the finder and the events page. The chosen area is remembered on this device only.
export function AreaSearch({ onArea, area }: { onArea: (area: Area) => void; area?: Area }) {
  useLang();
  const [query,setQuery] = useState('');
  const [matches,setMatches] = useState<Place[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function choose(a: Area) { saveArea(a); setMatches([]); setQuery(''); onArea(a); }
  async function search() {
    if (!query.trim() || busy) return;
    setBusy(true); setError(''); setMatches([]);
    try { const result = await geocode(query); if (alive.current) { if (result.length === 1) choose({ ...result[0], name: result[0].display_name }); else setMatches(result); if (!result.length) setError('No matching place. Try a town and country, or use your location.'); } }
    catch { if (alive.current) setError('Place search is unavailable. Try your location or the directories below.'); }
    finally { if (alive.current) setBusy(false); }
  }
  function locate() {
    if (!navigator.geolocation) { setError('Location is not supported here. Enter a town instead.'); return; }
    setBusy(true); setError('');
    navigator.geolocation.getCurrentPosition(p => { if (alive.current) { setBusy(false); choose({ lat:p.coords.latitude, lon:p.coords.longitude, name:'your location' }); } }, () => { if (alive.current) { setBusy(false); setError('Location was not available or permission was denied. Enter a town instead.'); } }, { timeout:10000, maximumAge:300000, enableHighAccuracy:false });
  }
  return <div className="area-search">
    <form onSubmit={e => { e.preventDefault(); void search(); }} className="place-form"><label>{t("Town or place")}<input value={query} onChange={e=>setQuery(e.target.value)} maxLength={120} placeholder={area ? t("Now: {shortName_area_name_}", { shortName_area_name_: shortName(t(area.name)) }) : t("e.g. Bristol, UK")} required /></label><button disabled={busy} type="submit">{t("Search places")}</button><button disabled={busy} type="button" className="secondary" onClick={locate}>{t("Use my location")}</button></form>
    <p className="small">{t("Town-level searches only; avoid a private address. ©")} <a href="https://www.openstreetmap.org/copyright">{t("OpenStreetMap contributors")}</a>. <a href="https://operations.osmfoundation.org/policies/nominatim/">{t("Place-search usage policy")}</a>.</p>
    {busy && <p role="status">{t("Looking for repair help…")}</p>}
    {error && <p role="alert" className="notice">{t(error)}</p>}
    {matches.length>0 && <div className="place-choices"><p>{t("Choose your area:")}</p>{matches.map((p,i)=><button className="secondary" key={i} disabled={busy} onClick={()=>choose({ ...p, name:p.display_name })}>{p.display_name}</button>)}</div>}
  </div>;
}
export const shortName = (name: string) => name.split(',').slice(0, 2).join(',').trim();
export const radii = [10, 25, 50, 100];
function OpenBadge({ hours, now }: { hours: string; now: Date }) {
  useLang();
  const open = hours ? openAt(hours, now) : null;
  if (open === null) return hours ? <span className="hours">{t("Hours:")} {hours}</span> : <span className="hours muted">{t("Hours not listed")}</span>;
  return <span className={`hours ${open ? 'is-open' : 'is-closed'}`}><Clock size={13}/>{open ? t("Open now (your device's time)") : t("Closed now")} · {hours}</span>;
}
function Enquiry({ input, place }: { input: Input; place: RepairPlace }) {
  useLang();
  const ticket = window.location.href.split('#')[0] + shortTicket(input);
  const [text,setText] = useState(() => enquiryText(input, ticket, place.name));
  const [copied,setCopied] = useState('');
  const links = enquiryLinks(text, place.phone, `Repair enquiry: ${englishLabel(input.category)}`);
  async function copy() { try { await navigator.clipboard.writeText(text); setCopied('Message copied.'); } catch { setCopied('Select the message and copy it.'); } }
  return <div className="enquiry"><label>{t("Your message")} <span className="optional">{t("edit before sending")}</span><textarea rows={6} maxLength={2000} value={text} onChange={e=>setText(e.target.value)}/></label><div className="actions">{links.sms&&<a className="button" href={links.sms}><Send size={15}/>{t("Text message")}</a>}{links.whatsapp&&<a className="button" href={links.whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={15}/>WhatsApp</a>}<a className="button" href={links.email}><Mail size={15}/>{t("Email")}</a><button type="button" className="secondary" onClick={()=>void copy()}><Copy size={15}/>{t("Copy")}</button>{place.website&&<a className="button ghost" href={place.website} target="_blank" rel="noreferrer nofollow">{t("Contact page ↗")}</a>}</div>{copied&&<p role="status" className="small">{t(copied)}</p>}<p className="small">{t("Sent from your own phone or mail app. FixOdds does not see or store it. The link opens your repair ticket without your description.")}</p></div>;
}
export default function Finder({ input }: { input?: Input }) {
  useLang();
  const [area,setArea] = useState<Area | undefined>(() => readArea());
  const [radius,setRadius] = useState(25);
  const [places,setPlaces] = useState<RepairPlace[]>([]);
  const [kinds,setKinds] = useState<string[]>([]);
  const [hidden,setHidden] = useState<string[]>([]);
  const [openNow,setOpenNow] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [asking,setAsking] = useState('');
  const now = useMemo(() => new Date(), [places]);
  useEffect(() => {
    if (!area) return;
    let live = true;
    setBusy(true); setError('');
    Promise.all([nearby(area, radius), loadPlaces()]).then(([found, data]) => { if (live) { setPlaces(found); setKinds(data.kinds); } }).catch(() => { if (live) setError('Repair places could not be loaded.'); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [area?.lat, area?.lon, radius]);
  const shown = places.filter(p => !hidden.includes(p.kind) && (!openNow || openAt(p.hours, now) === true)).slice(0, 40);
  const listedHours = places.filter(p => openAt(p.hours, now) !== null).length;
  return <section className="finder" aria-labelledby="finder-heading">
    <h3 id="finder-heading">{t("A repairer near you")}</h3>
    <p>{t("Nearest of 20,000+ mapped repair cafes and repair shops, worked out on this device. A typed town goes to OpenStreetMap place search, and the map loads tiles for that area from OpenStreetMap. Your problem description is never sent.")}</p>
    <AreaSearch area={area} onArea={setArea}/>
    {busy && <p role="status">{t("Looking for repair help…")}</p>}
    {error && <p role="alert" className="notice">{t(error)}</p>}
    {area && !busy && !error && <>
      <div className="filter-bar" role="group" aria-label={t("Filter repair places")}><label>{t("Within")}<select value={radius} onChange={e=>setRadius(Number(e.target.value))}>{radii.map(r=><option key={r} value={r}>{r} km</option>)}</select></label><div className="chip-row">{kinds.map(k=>{const on=!hidden.includes(k);return <button type="button" key={k} className={`chip${on?' is-on':''}`} aria-pressed={on} onClick={()=>setHidden(on?[...hidden,k]:hidden.filter(x=>x!==k))}>{t(k)}</button>;})}<button type="button" className={`chip${openNow?' is-on':''}`} aria-pressed={openNow} onClick={()=>setOpenNow(!openNow)} disabled={!listedHours}><Clock size={13}/>{t("Open now (your device's time)")}</button></div></div>
      <p className="eyebrow">{t('{count} mapped places near {place}', { count: number(shown.length), place: shortName(t(area.name)) })}{shown.length<places.filter(p=>!hidden.includes(p.kind)).length?t(" · {places_length} within {radius} km", { places_length: places.length, radius: radius }):''}</p>
      <MapView point={area} markers={shown.map(p=>({ lat:p.lat, lon:p.lon, label:p.name }))}/>
      <p className="small">{t("Map listings may be incomplete or out of date. Call ahead about your device, opening times and fees. A shop listing is not a repair recommendation. Opening times use this device’s clock.")}</p>
      {shown.length === 0 ? <p className="notice">{places.length ? t("No places match these filters. Widen the distance or clear a filter.") : <>{t('No repair locations are mapped within {radius} km. That does not mean none exist: try a wider distance,', { radius })} <a href="#/events">{t("community repair events")}</a> {t("or the directories below.")}</>}</p> : <ol className="repair-list">{shown.map(p=><li key={p.osm}><div><strong>{p.name}</strong><span>{number(p.distance,1)} {t("km away ·")} {t(p.kind)}</span><OpenBadge hours={p.hours} now={now}/>{p.phone && <a href={`tel:${firstPhone(p.phone)}`}><Phone size={13}/>{p.phone}</a>}<a href={`https://www.openstreetmap.org/directions?to=${p.lat},${p.lon}`} target="_blank" rel="noopener noreferrer">{t("Directions ↗")}</a>{p.website && <a href={p.website} target="_blank" rel="noreferrer nofollow">{t("Website ↗")}</a>}{input?.category && <button type="button" className="secondary ask" aria-expanded={asking===p.osm} onClick={()=>setAsking(asking===p.osm?'':p.osm)}><Send size={14}/>{asking===p.osm?t("Close message"):t("Ask about this repair")}</button>}{input?.category && asking===p.osm && <Enquiry input={input} place={p}/>}</div><a href={`https://www.openstreetmap.org/${p.osm}`} target="_blank" rel="noreferrer">{t("View listing ↗")}</a></li>)}</ol>}
      <a className="small" href="https://www.openstreetmap.org/fixthemap">{t("Report a map issue")}</a></>}
  </section>;
}
