import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, ExternalLink } from 'lucide-react';
import { AreaSearch, MapView, radii, shortName } from './finder';
import { download, eventCalendar, eventLink, formatWhen, ics, loadEvents, readArea, upcoming, type Area, type RepairEvent } from './events';
import { number } from './format';
export default function EventsPage() {
  const [all, setAll] = useState<RepairEvent[]>();
  const [error, setError] = useState('');
  const [area, setArea] = useState<Area | undefined>(() => readArea());
  const [radius, setRadius] = useState(25);
  useEffect(() => { loadEvents().then(setAll).catch(() => setError('Repair events could not load. Check your connection and try again.')); }, []);
  const now = useMemo(() => new Date(), [all]);
  const list = all ? upcoming(all, now, area, radius, 40) : [];
  const total = all ? upcoming(all, now, undefined, 1e9, 1e9).length : 0;
  function addAll() { download('repair-events.ics', ics(list.map(e => ({ uid: `restarters-${e.id}@fixodds`, start: e.start, end: e.end || undefined, title: `${e.group || 'Repair event'}: ${e.title}`, location: e.location, description: `Details: ${eventLink(e)}`, url: eventLink(e), alarmMinutes: 1440 })))); }
  return <article className="events-page"><p className="eyebrow">Free help, with tools and volunteers</p><h1>Repair events near you.</h1><p className="intro">Bring a broken item to a community repair cafe. Volunteers fix it with you, for free.</p>
    <section className="card"><AreaSearch area={area} onArea={setArea}/>{area && <div className="filter-bar"><label>Within<select value={radius} onChange={e => setRadius(Number(e.target.value))}>{radii.map(r => <option key={r} value={r}>{r} km</option>)}</select></label>{list.length > 0 && <button type="button" className="secondary" onClick={addAll}><CalendarPlus size={16}/>Add these {list.length} to my calendar</button>}</div>}</section>
    {error && <p role="alert" className="notice">{error}</p>}
    {!all && !error && <p role="status">Loading repair events…</p>}
    {all && <>
      <p className="eyebrow">{area ? `${list.length} upcoming within ${radius} km of ${shortName(area.name)}` : `Soonest of ${number(total)} upcoming events`}</p>
      {area && list.length > 0 && <MapView point={area} name="Repair events map" markers={list.flatMap(e => e.lat == null || e.lon == null ? [] : [{ lat: e.lat, lon: e.lon, label: `${e.group}: ${formatWhen(e)}`, tone: 'event' as const }])}/>}
      {area && !list.length && <p className="notice">No listed events within {radius} km yet. Try a wider distance, or check the directories below: many cafes publish dates only there.</p>}
      <ol className="event-list">{list.map(e => <li key={e.id}><time dateTime={e.start}>{formatWhen(e)}</time><div><strong>{e.group || e.title}</strong><span>{e.title !== e.group ? e.title + ' · ' : ''}{e.online ? 'Online' : e.location}{e.distance != null ? ` · ${number(e.distance, 1)} km` : ''}</span></div><div className="actions"><button type="button" className="secondary" onClick={() => download(`repair-event-${e.id}.ics`, eventCalendar(e))}><CalendarPlus size={15}/>Add to calendar</button><a className="button ghost" href={eventLink(e)} target="_blank" rel="noopener noreferrer">Details and booking<ExternalLink size={14}/></a></div></li>)}</ol>
    </>}
    <section className="ruled"><h2>Not listed here?</h2><p>This calendar covers events published on Restarters.net, mostly in the UK, Belgium, France and New Zealand. Calendar reminders arrive one day before. Find more cafes in these directories:</p><div className="help-links"><a href="https://www.repaircafe.org/en/visit/" target="_blank" rel="noopener noreferrer">Repair Café International (worldwide)</a><a href="https://www.reparatur-initiativen.de/" target="_blank" rel="noopener noreferrer">anstiftung Reparatur-Initiativen (Germany)</a><a href="https://restarters.net/group" target="_blank" rel="noopener noreferrer">Restarters groups</a></div><p className="small">Event data: <a href="https://restarters.net/" target="_blank" rel="noopener noreferrer">Restarters.net</a> by The Restart Project, refreshed daily. Organiser contact details are not copied. No endorsement implied.</p></section>
  </article>;
}
