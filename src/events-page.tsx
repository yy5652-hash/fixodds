import { t, useLang, locale } from './i18n';
import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, ExternalLink } from 'lucide-react';
import { AreaSearch, MapView, radii, shortName } from './finder';
import { download, eventCalendar, eventLink, formatWhen, ics, loadEvents, readArea, upcoming, type Area, type RepairEvent, eventsBuilt, eventStatuses } from './events';
import { IntentionField, SaveStepButton } from './journey';
import type { Input, Intention } from './core';
import { number } from './format';
export default function EventsPage({ input }: { input?: Input | null }) {
  useLang();
  const [all, setAll] = useState<RepairEvent[]>();
  const [built,setBuilt] = useState(''), [intention,setIntention] = useState<Intention>();
  const [error, setError] = useState('');
  const [area, setArea] = useState<Area | undefined>(() => readArea());
  const [radius, setRadius] = useState(25);
  useEffect(() => { let live=true; loadEvents().then(data=>{if(live)setAll(data);}).catch(() => {if(live)setError('Repair events could not load. Check your connection and try again.');}); eventsBuilt().then(date=>{if(live)setBuilt(date);}); return()=>{live=false;}; }, []);
  const now = useMemo(() => new Date(), [all]);
  const list = all ? upcoming(all, now, area, radius, 40) : [];
  const total = all ? upcoming(all, now, undefined, 1e9, 1e9).length : 0;
  function addAll() { download('repair-events.ics', ics(list.map(e => ({ uid: `restarters-${e.id}@fixodds`, start: e.start, end: e.end || undefined, title: `${e.group || 'Repair event'}: ${e.title}`, location: e.location, description: `Details: ${eventLink(e)}`, url: eventLink(e), alarmMinutes: 1440 })))); }
  return <article className="events-page"><p className="eyebrow">{t("Free help, with tools and volunteers")}</p><h1>{t("Repair events near you.")}</h1><p className="intro">{t("Bring a broken item to a community repair cafe. Volunteers fix it with you, for free.")}</p>
    <section className="card"><AreaSearch area={area} onArea={setArea}/>{area && <div className="filter-bar"><label>{t("Within")}<select value={radius} onChange={e => setRadius(Number(e.target.value))}>{radii.map(r => <option key={r} value={r}>{r} km</option>)}</select></label></div>}</section>
    {error && <p role="alert" className="notice">{t(error)}</p>}
    {!all && !error && <p role="status">{t("Loading repair events…")}</p>}
    {all && <>
      <p className="eyebrow">{area ? t("{list_length} upcoming within {radius} km of {shortName_area_name_}", { list_length: list.length, radius: radius, shortName_area_name_: shortName(t(area.name)) }) : t("Soonest of {number_total_} upcoming events", { number_total_: number(total) })}</p>
      {area && list.length > 0 && <MapView point={area} name={t('Repair events map')} markers={list.flatMap(e => e.lat == null || e.lon == null ? [] : [{ lat: e.lat, lon: e.lon, label: `${e.group}: ${formatWhen(e, locale())}`, tone: 'event' as const }])}/>}
      {area && !list.length && <p className="notice">{t('No listed events within {radius} km yet. Try a wider distance, or check the directories below: many cafes publish dates only there.', { radius })}</p>}
      <IntentionField value={intention} onChange={setIntention}/>
      <ol className="event-list">{list.map(e => { const statuses=eventStatuses(e), unavailable=statuses.includes('FULL')||statuses.includes('Cancelled'); return <li key={e.id}><time dateTime={e.start}>{formatWhen(e, locale())}</time><div><strong>{e.group || e.title}</strong><div className="chip-row">{statuses.map(status=><span className="chip event-status" key={status}>{t(status)}</span>)}</div><span>{e.title !== e.group ? e.title + ' · ' : ''}{e.online ? t("Online") : e.location}{e.distance != null ? t(" · {number_e_distance__1_} km", { number_e_distance__1_: number(e.distance, 1) }) : ''}</span></div><div className="actions"><a className="button primary" href={eventLink(e)} target="_blank" rel="noopener noreferrer">{t("Details and booking")}<ExternalLink size={14}/></a><button type="button" className="secondary" onClick={() => download(`repair-event-${e.id}.ics`, eventCalendar(e))}><CalendarPlus size={15}/>{t(unavailable?"Add anyway":"Add to calendar")}</button><SaveStepButton input={input} step={{route:'cafe',intention,event:{id:e.id,group:e.group||e.title,date:formatWhen(e,locale()),start:e.start,link:eventLink(e)}}}/></div></li>;})}</ol>
      {!!list.length&&<button type="button" className="text-button small" onClick={addAll}>{t('Add these {count} to my calendar', { count: number(list.length) })}</button>}{built&&<p className="small">{t('Events snapshot updated {date}', {date:new Date(built).toLocaleDateString(locale())})}</p>}
    </>}
    <section className="ruled"><h2>{t("Not listed here?")}</h2><p>{t("This calendar covers events published on Restarters.net, mostly in the UK, Belgium, France and New Zealand. Calendar reminders arrive one day before. Find more cafes in these directories:")}</p><div className="help-links"><a href="https://www.repaircafe.org/en/visit/" target="_blank" rel="noopener noreferrer">{t("Repair Café International (worldwide)")}</a><a href="https://www.reparatur-initiativen.de/" target="_blank" rel="noopener noreferrer">{t("anstiftung Reparatur-Initiativen (Germany)")}</a><a href="https://restarters.net/group" target="_blank" rel="noopener noreferrer">{t("Restarters groups")}</a></div><p className="small">{t("Event data:")} <a href="https://restarters.net/" target="_blank" rel="noopener noreferrer">Restarters.net</a> {t("by The Restart Project, refreshed daily. Organiser contact details are not copied. No endorsement implied.")}</p></section>
  </article>;
}
