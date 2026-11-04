// Three ways to get it fixed: yourself, a free community repair event, or a paid repairer.
import { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarDays, Hammer, Store, Users, Wrench } from 'lucide-react';
import { label, predict, safety, stats, type Input, type Model } from './core';
import { easiest, useGuides, type Guide } from './guides';
import { formatWhen, loadEvents, nextNear, readArea, eventLink, type Area, type RepairEvent } from './events';
import { number, percent } from './format';
import { Card } from './ui/card';
function useArea() {
  const [area, setArea] = useState<Area | undefined>(() => readArea());
  useEffect(() => { const h = () => setArea(readArea()); window.addEventListener('fixodds-area', h); return () => window.removeEventListener('fixodds-area', h); }, []);
  return area;
}
function useNextEvent(area?: Area) {
  const [next, setNext] = useState<RepairEvent | null>();
  useEffect(() => {
    if (!area) { setNext(undefined); return; }
    let live = true;
    loadEvents().then(all => { if (live) setNext(nextNear(all, new Date(), area, 30) || null); }).catch(() => { if (live) setNext(null); });
    return () => { live = false; };
  }, [area?.lat, area?.lon]);
  return next;
}
export function GuideList({ input }: { input: Input }) {
  const { guides, error } = useGuides(input);
  const search = `https://www.ifixit.com/Search?query=${encodeURIComponent(label(input.category))}`;
  return <section className="guides" aria-labelledby="guides-heading"><div className="section-heading"><h2 id="guides-heading"><Wrench size={18}/>Repair guides for this</h2><a href={search} target="_blank" rel="noopener noreferrer">More on iFixit ↗</a></div>
    {!guides && !error && <p role="status" className="small">Searching iFixit…</p>}
    {error && <p className="small">iFixit could not be reached. <a href={search} target="_blank" rel="noopener noreferrer">Search iFixit directly ↗</a></p>}
    {guides && !guides.length && <p className="small">No matching step-by-step guide yet. Repair cafe volunteers often fix items without one.</p>}
    {guides && guides.length > 0 && <ul className="guide-list">{guides.map(g => <li key={g.id}><a href={g.url} target="_blank" rel="noopener noreferrer">{g.image ? <img src={g.image} alt="" loading="lazy" width={96} height={72} referrerPolicy="no-referrer"/> : <span className="guide-thumb" aria-hidden="true"><Wrench size={20}/></span>}<span><strong>{g.title}</strong><small>{[g.difficulty, g.minutes ? `about ${g.minutes < 90 ? g.minutes + ' min' : Math.round(g.minutes / 60) + ' h'}` : '', g.author && `by ${g.author}`].filter(Boolean).join(' · ')}</small></span></a></li>)}</ul>}
    <p className="small">Guides from <a href="https://www.ifixit.com/" target="_blank" rel="noopener noreferrer">iFixit</a>, written by its community under CC BY-NC-SA 3.0. Linked, not copied. Check that a guide matches your model before you start.</p></section>;
}
function diyLine(guides: Guide[] | undefined, error: boolean | undefined) {
  if (error) return 'Guides could not load right now.';
  if (!guides) return 'Looking for guides…';
  if (!guides.length) return 'No matching guide found.';
  const g = easiest(guides);
  return `${guides.length} matching guide${guides.length > 1 ? 's' : ''}; easiest rated ${g.difficulty || 'unrated'}${g.minutes ? `, about ${g.minutes < 90 ? g.minutes + ' min' : Math.round(g.minutes / 60) + ' h'}` : ''}.`;
}
export function suggestRoute(feasible: number, unsafe: boolean, guides?: Guide[], next?: RepairEvent | null): 'diy' | 'cafe' | 'shop' {
  if (unsafe) return 'shop';
  const g = guides?.length ? easiest(guides) : undefined;
  if (g && ['Very easy', 'Easy'].includes(g.difficulty) && feasible >= 0.65) return 'diy';
  if (next || feasible >= 0.5) return 'cafe';
  return 'shop';
}
export function Routes({ input, model, onFind }: { input: Input; model: Model; onFind: () => void }) {
  const p = predict(input, model), feasible = p[0] + p[1];
  const unsafe = safety(input).length > 0;
  const { guides, error } = useGuides(input);
  const area = useArea(), next = useNextEvent(area);
  const best = suggestRoute(feasible, unsafe, guides, next);
  const n = stats[input.category]?.n || 0;
  const tag = (route: string) => best === route ? <span className="route-tag">Suggested first step</span> : null;
  return <Card className="routes"><p className="eyebrow">Three ways to get it fixed</p><h2>Pick the route that fits.</h2><div className="route-grid">
    <section className={`route${best === 'diy' ? ' is-best' : ''}${unsafe ? ' is-off' : ''}`}>{tag('diy')}<h3><Hammer size={18}/>Fix it yourself</h3><dl><div><dt>Cost</dt><dd>Parts and tools only</dd></div><div><dt>Help</dt><dd>{unsafe ? 'Not advised: the safety signs above need a professional.' : diyLine(guides, error)}</dd></div></dl>{!unsafe && <a href="#guides-heading" className="route-link">See the guides <ArrowUpRight size={14}/></a>}</section>
    <section className={`route${best === 'cafe' ? ' is-best' : ''}`}>{tag('cafe')}<h3><Users size={18}/>Free repair cafe</h3><dl><div><dt>Odds</dt><dd><strong>{percent(feasible)}</strong> fixed or repairable at community repair events, from {number(n)} past attempts</dd></div><div><dt>Cost</dt><dd>Free; donations welcome</dd></div><div><dt>Next</dt><dd>{!area ? 'Search your town to see the next event.' : next === undefined ? 'Checking the calendar…' : next ? <>{formatWhen(next)} · {next.group} · {number(next.distance || 0, 1)} km <a href={eventLink(next)} target="_blank" rel="noopener noreferrer">Details ↗</a></> : 'No listed event within 30 km. Many cafes publish their dates elsewhere.'}</dd></div></dl><a href="#/events" className="route-link"><CalendarDays size={14}/>All repair events</a></section>
    <section className={`route${best === 'shop' ? ' is-best' : ''}`}>{tag('shop')}<h3><Store size={18}/>Paid repairer</h3><dl><div><dt>Cost</dt><dd>Diagnosis fee plus parts and labour. Set your ceiling with the break-even guide.</dd></div><div><dt>Best for</dt><dd>{unsafe ? 'Safety-related faults, which need a qualified technician.' : 'Warranty work, sealed or mains-powered parts, and when you need it back fast.'}</dd></div></dl><button type="button" className="route-link" onClick={onFind}>Find and message a repairer <ArrowUpRight size={14}/></button></section>
  </div><p className="small">Odds come from community repair events, where volunteers help. Doing it alone or paying a shop can differ. The suggestion weighs safety, guide difficulty, the odds and whether an event is coming up near you.</p></Card>;
}
