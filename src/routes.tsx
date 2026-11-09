import { t, useLang, locale } from './i18n';
// Three ways to get it fixed: yourself, a free community repair event, or a paid repairer.
import { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarDays, Hammer, Store, Users, Wrench } from 'lucide-react';
import { inputSymptoms, label, englishLabel, predict, safety, stats, type Input, type Intention, type Model } from './core';
import { easiest, guideHazards, queries, useGuides, type Guide } from './guides';
import { formatWhen, loadEvents, nextNear, readArea, eventLink, type Area, type RepairEvent } from './events';
import { number, percent } from './format';
import { SafetyNotice } from './outlook';
import { IntentionField, SaveStepButton } from './journey';
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
  useLang();
  const { guides, error } = useGuides(input);
  const search = `https://www.ifixit.com/Search?query=${encodeURIComponent(queries(input)[0] || englishLabel(input.category))}`;
  const matched = guides?.filter(g => g.matched) || [], related = guides?.filter(g => !g.matched) || [];
  const list = (list: Guide[]) => <ul className="guide-list">{list.map(g => <li key={g.id}><a href={g.url} target="_blank" rel="noopener noreferrer">{g.image ? <img src={g.image} alt="" loading="lazy" width={96} height={72} referrerPolicy="no-referrer"/> : <span className="guide-thumb" aria-hidden="true"><Wrench size={20}/></span>}<span><strong>{g.title}</strong><small>{[t(g.difficulty), g.minutes ? t('about {time}', { time: duration(g.minutes) }) : '', g.author && t('by {author}', { author: g.author })].filter(Boolean).join(' · ')}</small></span></a></li>)}</ul>;
  return <section className="guides" aria-labelledby="guides-heading"><div className="section-heading"><h2 id="guides-heading"><Wrench size={18}/>{t(guides?.length && !matched.length ? "Related guides — model compatibility unconfirmed" : "Repair guides for this")}</h2><a href={search} target="_blank" rel="noopener noreferrer">{t("More on iFixit ↗")}</a></div>
    {!guides && !error && <p role="status" className="small">{t("Searching iFixit…")}</p>}
    {error && <p className="small">{t("iFixit could not be reached.")} <a href={search} target="_blank" rel="noopener noreferrer">{t("Search iFixit directly ↗")}</a></p>}
    {guides && !guides.length && <p className="small">{t("No matching step-by-step guide yet. Repair cafe volunteers often fix items without one.")}</p>}
    {!!matched.length && list(matched)}
    {!!related.length && <>{!!matched.length && <h3>{t("Related guides — model compatibility unconfirmed")}</h3>}{list(related)}</>}
    <SafetyNotice input={input} reasons={guideHazards(guides || [])}/>
    <p className="small">{t("Guides from")} <a href="https://www.ifixit.com/" target="_blank" rel="noopener noreferrer">iFixit</a>{t(", written by its community under CC BY-NC-SA 3.0. Linked, not copied. Check that a guide matches your model before you start.")}</p></section>;
}
const duration = (minutes: number) => minutes < 90 ? t('{count} min', { count: number(minutes) }) : t('{count} h', { count: number(Math.round(minutes / 60)) });
function diyLine(guides: Guide[] | undefined, error: boolean | undefined) {
  if (error) return t('Guides could not load right now.');
  if (!guides) return t('Looking for guides…');
  if (!guides.length) return t('No matching guide found.');
  const g = easiest(guides);
  return t('{count} matching guide(s); easiest: {difficulty}{time}.', { count: number(guides.length), difficulty: t(g.difficulty || 'unrated'), time: g.minutes ? t(', about {time}', { time: duration(g.minutes) }) : '' });
}
export function suggestRoute(feasible: number, unsafe: boolean, guides?: Guide[], next?: RepairEvent | null, symptomatic = true): 'diy' | 'cafe' | 'shop' {
  if (unsafe || guideHazards(guides || []).length) return 'shop';
  // Guides found from the item name alone may not match the fault, so DIY is suggested only once a symptom is known.
  const matched = guides?.filter(g => g.matched);
  const g = symptomatic && matched?.length ? easiest(matched) : undefined;
  if (g && ['Very easy', 'Easy'].includes(g.difficulty) && feasible >= 0.65) return 'diy';
  if (next || feasible >= 0.5) return 'cafe';
  return 'shop';
}
export function Routes({ input, model, onFind }: { input: Input; model: Model; onFind: () => void }) {
  useLang();
  const [intention,setIntention] = useState<Intention>();
  const p = predict(input, model), feasible = p[0] + p[1];
  const { guides, error } = useGuides(input);
  const unsafe = safety(input).length > 0 || guideHazards(guides || []).length > 0;
  const area = useArea(), next = useNextEvent(area);
  const best = suggestRoute(feasible, unsafe, guides, next, inputSymptoms(input).length > 0);
  const n = stats[input.category]?.n || 0;
  const tag = (route: string) => best === route ? <span className="route-tag">{t("Suggested first step")}</span> : null;
  return <Card className="routes"><p className="eyebrow">{t("Three ways to get it fixed")}</p><h2>{t("Pick the route that fits.")}</h2><IntentionField value={intention} onChange={setIntention}/><div className="route-grid">
    <section className={`route${best === 'diy' ? ' is-best' : ''}${unsafe ? ' is-off' : ''}`}>{tag('diy')}<h3><Hammer size={18}/>{t("Fix it yourself")}</h3><dl><div><dt>{t("Cost")}</dt><dd>{t("Parts and tools only")}</dd></div><div><dt>{t("Help")}</dt><dd>{unsafe ? t("Not advised: the safety signs above need a professional.") : diyLine(guides?.filter(g => g.matched), error)}</dd></div></dl>{!unsafe && <a href="#guides-heading" className="route-link">{t("See the guides")} <ArrowUpRight size={14}/></a>}<SaveStepButton input={input} step={{route:'diy',intention,guideTitle:guides?.find(g=>g.matched)?.title}}/></section>
    <section className={`route${best === 'cafe' ? ' is-best' : ''}`}>{tag('cafe')}<h3><Users size={18}/>{t("Free repair cafe")}</h3><dl><div><dt>{t("Odds")}</dt><dd><strong>{percent(feasible)}</strong> {t("fixed or repairable at community repair events, from")} {number(n)} {t("past attempts")}</dd></div><div><dt>{t("Cost")}</dt><dd>{t("Free; donations welcome")}</dd></div><div><dt>{t("Next")}</dt><dd>{!area ? t("Search your town to see the next event.") : next === undefined ? t("Checking the calendar…") : next ? <>{formatWhen(next, locale())} · {next.group} · {number(next.distance || 0, 1)} km <a href={eventLink(next)} target="_blank" rel="noopener noreferrer">{t("Details ↗")}</a></> : t("No listed event within 30 km. Many cafes publish their dates elsewhere.")}</dd></div></dl><a href="#/events" className="route-link"><CalendarDays size={14}/>{t("All repair events")}</a><SaveStepButton input={input} step={{route:'cafe',intention,event:next?{id:next.id,group:next.group||next.title,date:formatWhen(next,locale()),start:next.start,link:eventLink(next)}:undefined}}/></section>
    <section className={`route${best === 'shop' ? ' is-best' : ''}`}>{tag('shop')}<h3><Store size={18}/>{t("Paid repairer")}</h3><dl><div><dt>{t("Cost")}</dt><dd>{t("Diagnosis fee plus parts and labour. Use the illustrative repair-spending guide to consider a limit.")}</dd></div><div><dt>{t("Best for")}</dt><dd>{unsafe ? t("Safety-related faults, which need a qualified technician.") : t("Warranty work, sealed or mains-powered parts, and when you need it back fast.")}</dd></div></dl><button type="button" className="route-link" onClick={onFind}>{t("Find and message a repairer")} <ArrowUpRight size={14}/></button><SaveStepButton input={input} step={{route:'shop',intention}}/></section>
  </div><p className="small">{t("Odds come from community repair events, where volunteers help. Doing it alone or paying a shop can differ. The suggestion weighs safety, guide difficulty, the odds and whether an event is coming up near you.")}</p></Card>;
}
