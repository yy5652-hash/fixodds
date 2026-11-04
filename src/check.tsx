import { t, useLang, locale } from './i18n';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Command } from 'cmdk';
import { Drawer } from 'vaul';
import { ArrowUpRight, Check, Leaf, MapPin, Search, Share2, Ticket, X } from 'lucide-react';
import report from './data/report.json';
import { aliases } from './data/aliases';
import { ageBucket, barrierActions, categories, detectSymptoms, factorFor, factors, inputSymptoms, label, englishLabel, predict, safety, stats, symptomData, symptomIds, verdict, type Input, type Model } from './core';
import { datasetImpact, symptomEffects } from './insights';
import { number, percent } from './format';
import { AnimatedNumber, Money, Odds, SafetyNotice } from './outlook';
import { Accordion } from './ui/accordion';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input as InputField } from './ui/input';
const Finder = lazy(() => import('./finder'));
import { GuideList, Routes } from './routes';
import HomeExtras from './home';
import { PartsNotice, SimilarCases, useInsights } from './category-page';
import { brandRecord, score, slug } from './records';
const common = ['battery','no_power','screen','too_hot','noise','button'];
const examples: { name: string; input: Input }[] = [
  { name:'Kettle', input:{ category:'Kettle',age:'3-5',years:'4',brand:'',problem:'',symptoms:['no_heat','button'] } },
  { name:'Laptop', input:{ category:'Laptop',age:'3-5',years:'5',brand:'',problem:'',size:'Laptop medium',symptoms:['battery'] } },
  { name:'Vacuum', input:{ category:'Vacuum',age:'6-10',years:'7',brand:'',problem:'',symptoms:['no_motion','stuck'] } },
];
function ItemSearch({ input, onChange }: { input: Input; onChange: (input: Input) => void }) {
  const { lang } = useLang();
  const [search, setSearch] = useState(input.category ? label(input.category) : '');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.setAttribute('aria-expanded', String(open)); }, [open]);
  useEffect(() => { setSearch(input.category ? label(input.category) : ''); }, [input.category, lang]);
  function choose(category: string) {
    onChange({ ...input, category, size: factors[category].default || undefined });
    setSearch(label(category)); setOpen(false); ref.current?.blur();
  }
  return <div className="item-search"><Command label={t("What broke?")} loop onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);ref.current?.blur();}}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}><div className="search-field"><Search size={19} aria-hidden="true"/><Command.Input ref={ref} value={search} onValueChange={value=>{setSearch(value);setOpen(true);}} onFocus={()=>setOpen(true)} placeholder={t("Search an item, e.g. MacBook")} aria-expanded={open} autoComplete="off"/>{input.category&&<Check size={18} aria-label={t("Item chosen")}/>}</div><Command.List hidden={!open} className="search-results"><Command.Empty>{t("No item found. Try its general name.")}</Command.Empty>{categories.map(category=><Command.Item key={category} value={label(category)} keywords={[englishLabel(category),category,...Object.keys(aliases).filter(a=>aliases[a]===category)]} onSelect={()=>choose(category)}>{label(category)}{input.category===category&&<Check size={16}/>}</Command.Item>)}</Command.List></Command></div>;
}
function DatasetCard() {
  useLang();
  const total = datasetImpact();
  return <Card className="dataset-card"><span className="eyebrow"><Leaf size={16}/> {t("A longer life starts with a repair")}</span><h2>{t("Repair has already")}<br/>{t("made a difference.")}</h2><p className="dataset-total">{number(report.rawRows)}<span>{t("real repair attempts")}</span></p><div className="dataset-numbers"><div><strong>{number(total.fixed)}</strong><span>{t("fixes with an impact factor")}</span></div><div><strong>{number(total.carbonTonnes)} t</strong><span>{t("estimated CO₂e avoided")}</span></div><div><strong>{number(total.wasteTonnes)} t</strong><span>{t("e-waste kept in use")}</span></div></div><p className="small">{t("What past community repairs represent, using category-average factors. These are estimates of repair’s contribution, not FixOdds’ own impact.")}</p><a href="#/method" className="method-link">{t("See the data and assumptions")} <ArrowUpRight size={16}/></a><div className="start-hint">{t("Choose your item to see its odds. No account needed.")}</div></Card>;
}
export function ResultCard({ input, model, onFind }: { input: Input; model: Model; onFind: () => void }) {
  useLang();
  const p = predict(input,model), feasible = p[0]+p[1];
  const v = verdict(feasible), factor = factorFor(input);
  const band = report.verdictBands.find(b=>b.verdict===v);
  const [shareNotice,setShareNotice] = useState('');
  const [sharing,setSharing] = useState(false);
  async function share() {
    setSharing(true);
    try { const { shareCard } = await import('./share-card'); setShareNotice(await shareCard(input,model)); }
    catch { setShareNotice('Could not create the image. Try again in this browser.'); }
    finally { setSharing(false); }
  }
  return <Card className="result-card"><SafetyNotice input={input}/><p className="eyebrow">{t("Your repair outlook ·")} {label(input.category)}</p><div aria-live="polite" aria-atomic="true"><h2 className={`verdict${safety(input).length?' safety-verdict':''}`}>{safety(input).length?t("Let a professional assess it."):t(v)}</h2><span className="sr-only">{percent(feasible)} {t("fixed or repairable.")}</span></div><p className="sub">{t("Updates as you tap. Runs on this device.")}</p><Odds probabilities={p}/>{band&&<p className="proof">{t('Tested on {count} repairs it never saw:', { count: number(band.n) })} <strong>{percent(band.observedFixed+band.observedRepairable)}</strong> {t("in this band were fixed or repairable.")}</p>}{factor?<div className="impact-block"><div><strong><AnimatedNumber value={p[0]*factor.footprint*.5}/> kg</strong><span>{t("expected CO₂e avoided")}</span><small>{number(factor.footprint*.5,1)} {t("kg if fixed")}</small></div><div><strong><AnimatedNumber value={factor.weight} digits={2}/> kg</strong><span>{t("e-waste kept in use if fixed")}</span></div></div>:<p className="notice">{t("We do not have a reliable footprint or weight for this category. A successful repair can keep an item in use, but we will not invent a savings figure.")}</p>}<div className="result-actions"><Button variant="primary" onClick={onFind}><MapPin size={17}/>{t("Find a repairer near me")}</Button><Button onClick={()=>{window.location.hash='/ticket';}}><Ticket size={17}/>{t("Make a repair ticket")}</Button><Button variant="ghost" onClick={()=>void share()} disabled={sharing}><Share2 size={17}/>{sharing?t("Preparing PNG…"):t("Share this")}</Button></div>{shareNotice&&<p role="status" className="small">{t(shareNotice)}</p>}<Money feasible={feasible}/><p className="small disclaimer">{t("Estimated from past community repair events. Not a diagnosis.")}</p></Card>;
}
function BrandLine({ input }: { input: Input }) {
  useLang();
  const { data } = useInsights();
  const record = data?.categories[input.category];
  if (!record || !input.brand.trim()) return null;
  const b = brandRecord(record, input.brand), all = record.all;
  return <p className="brand-line">{b ? <><strong>{b[0]}</strong> {t('{item}: fixed in {rate} of {count} attempts ({score}/10), against {all} for all brands.', { item: label(input.category), rate: percent(b[2]/b[1]), count: number(b[1]), score: score(b[1],b[2]), all: percent(all[1]/all[0]) })} <a href={`#/item/${slug(input.category)}`}>{t("Compare brands")}</a></> : <>{t('No repair record for this brand yet (fewer than {count} attempts).', { count: number(data.minBrand) })} <a href={`#/item/${slug(input.category)}`}>{t("See brands with records")}</a></>}</p>;
}
function ResultDetails({ input, model, onFind }: { input: Input; model: Model; onFind: () => void }) {
  useLang();
  const effects = symptomEffects(input,model), stat=stats[input.category], factor=factorFor(input);
  const guide = `https://www.ifixit.com/Search?query=${encodeURIComponent([englishLabel(input.category),...inputSymptoms(input).map(id=>symptomData[id].label)].join(' '))}`;
  return <Card className="result-details"><BrandLine input={input}/><PartsNotice category={input.category}/><h2>{t("What moved these odds")}</h2>{effects.length?<ul className="moved-list">{effects.map(effect=><li key={effect.id}><span>{t(symptomData[effect.id].label)}</span><strong>{effect.points>=0?'+':'−'}{number(Math.abs(effect.points),1)} {t('pp')}</strong></li>)}</ul>:<p className="small">{t("No symptoms selected. The estimate uses the item, age and brand only.")}</p>}<p className="small">{t("Change in fixed-or-repairable odds when each symptom is removed. These are associations in past repairs, not causes.")}</p><GuideList input={input}/><SimilarCases input={input}/><Accordion title={t("What usually stops this repair")}><p>{t('Among {count} end-of-life records with a stated barrier. Missing barriers are excluded; these are not your personal failure probabilities.', { count: number(stat.barrierN) })}</p>{stat.barriers.length?stat.barriers.map(b=><div className="barrier" key={b.name}><h3>{t(b.name)}</h3><small>{percent(b.share)} {t("of recorded barriers")}</small><p>{t(barrierActions[b.name] || "Ask a repair professional to assess this obstacle before paying for work.")}</p><div className="actions"><Button asChild><a href={guide} target="_blank" rel="noopener noreferrer">{t("Search iFixit guides")} <ArrowUpRight size={15}/></a></Button><Button onClick={onFind}>{t("Find a repairer")}</Button></div></div>):<p>{t("Too little barrier information for this category. Start by collecting the model number and checking your warranty.")}</p>}<p>{t("First, record the model number and check the warranty. For powered items, ask a qualified repairer before opening a housing. If it cannot be repaired, choose a refurbished replacement and an authorised e-waste collection point.")}</p><div className="help-links"><a href="https://www.repaircafe.org/en/visit/" target="_blank" rel="noopener noreferrer">Repair Cafe International</a><a href="https://restarters.net/groups" target="_blank" rel="noopener noreferrer">{t("Restarters groups")}</a></div></Accordion><Accordion title={t("How these figures are worked out")}>{factor&&<><p>{t('Expected CO₂e = P(Fixed) × {footprint} kg CO₂e × 0.5 displacement. Expected e-waste = P(Fixed) × {weight} kg. Full-success figures use P(Fixed) = 1.', { footprint: number(factor.footprint), weight: number(factor.weight,2) })}</p><p>{factors[input.category].estimated?t("Estimated proxy"):t("Category-average estimate")} · {t(factor.name)}{t(". Avoided waste means delayed disposal, not permanent elimination.")}</p><p>{factors[input.category].source}</p></>}<p>{t("Displacement assumes half of repairs prevent a new purchase. Repairable is not yet fixed, so it contributes no environmental saving here. Parts, travel and differences in running energy are not included.")}</p><p>{t('Backed by {count} real attempts in this category. “Repairable” means more work or parts were needed; it is not a completed repair.', { count: number(stat.n) })}</p><a href="#/method">{t("Read the full method and limitations")}</a></Accordion><Button asChild variant="ghost"><a href="#/log">{t("Log an outcome")}</a></Button></Card>;
}
export default function CheckTool({ input, model, onChange }: { input: Input; model?: Model; onChange: (input: Input) => void }) {
  useLang();
  const [more,setMore] = useState(false), [find,setFind] = useState(false), [drawer,setDrawer] = useState(false);
  const finder = useRef<HTMLDivElement>(null);
  const detected=detectSymptoms(input.problem), chosen=new Set(inputSymptoms(input));
  const selected=factors[input.category];
  const shown=more?symptomIds:[...common,...symptomIds.filter(id=>chosen.has(id)&&!common.includes(id))];
  function toggle(id: string) { if(detected.includes(id))return; const ids=input.symptoms||[];onChange({...input,symptoms:ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]}); }
  function openFinder() { setFind(true);setDrawer(false);setTimeout(()=>finder.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}),0); }
  return <><div className="check-layout"><Card className="check-form"><h1>{t("Broken? See the odds before you replace it.")}</h1><ItemSearch input={input} onChange={onChange}/><fieldset className="symptoms"><legend>{t("What’s going wrong? Tap any that fit.")}</legend><div className="chip-row">{shown.map(id=><Button type="button" key={id} className={`chip${chosen.has(id)?' is-on':''}${detected.includes(id)?' is-auto':''}`} aria-pressed={chosen.has(id)} onClick={()=>toggle(id)}>{chosen.has(id)&&<Check size={14}/>} {t(symptomData[id].label)}{detected.includes(id)&&<span className="sr-only"> {t("(picked up from your description)")}</span>}</Button>)}<Button type="button" className="chip more" onClick={()=>setMore(!more)} aria-expanded={more}>{more?t("Fewer"):t("More")}</Button></div></fieldset><label>{t("Or describe it")} <span className="optional">{t("optional, in English, Dutch, German or French")}</span><textarea rows={2} maxLength={1000} value={input.problem} onChange={e=>onChange({...input,problem:e.target.value})} placeholder={t("e.g. It clicks but does not heat.")}/></label><p className="small privacy">{t("Your description stays on this device. Matching symptoms tick live.")}</p><Accordion title={t("Sharpen the odds")}><div className="field-pair"><label>{t("Age in years")}<InputField type="number" min="0" max="150" step="0.5" value={input.years||''} onChange={e=>onChange({...input,years:e.target.value,age:ageBucket(e.target.value)})} placeholder={t("Unknown")}/></label><label>{t("Brand")}<InputField maxLength={80} value={input.brand} onChange={e=>onChange({...input,brand:e.target.value})} placeholder={t("Optional")}/></label></div>{selected&&selected.variants.length>1&&<label>{t("Size for the impact estimate")}<select value={input.size||selected.default||''} onChange={e=>onChange({...input,size:e.target.value})}>{selected.variants.map(f=><option key={f.name} value={f.name}>{t(f.name)}</option>)}</select><small>{t('Default: {size}. Choose the closest listed size; other sizes are not specifically modelled.', { size: t(selected.default||'') })}</small></label>}</Accordion><div className="examples"><span className="small">{t("Try an example")}</span>{examples.map(e=><Button key={e.name} variant="ghost" onClick={()=>onChange({...e.input})}>{t(e.name)}<ArrowUpRight size={14}/></Button>)}</div></Card><div className="result-column">{input.category?(model?<ResultCard input={input} model={model} onFind={openFinder}/>:<Card><p role="status">{t("Loading the repair model…")}</p></Card>):<DatasetCard/>}</div>{input.category&&model&&<div className="details-column"><Routes input={input} model={model} onFind={openFinder}/><ResultDetails input={input} model={model} onFind={openFinder}/></div>}</div>{!input.category&&<HomeExtras/>}<div ref={finder}>{find&&<Suspense fallback={<p role="status">{t("Loading the repair finder…")}</p>}><Finder input={input}/></Suspense>}</div>{input.category&&model&&<Drawer.Root open={drawer} onOpenChange={setDrawer}><Drawer.Trigger className="mobile-result"><span>{safety(input).length?t("Professional assessment"):t(verdict(predict(input,model)[0]+predict(input,model)[1]))}</span><strong>{percent(predict(input,model)[0]+predict(input,model)[1])}</strong><span className="sr-only">{t("Open full result")}</span></Drawer.Trigger><Drawer.Portal><Drawer.Overlay className="drawer-overlay"/><Drawer.Content className="drawer-content"><div className="drawer-handle"/><div className="drawer-heading"><Drawer.Title>{t("Your full repair outlook")}</Drawer.Title><Drawer.Close aria-label={t("Close result")}><X size={20}/></Drawer.Close></div><Drawer.Description className="sr-only">{t("Live odds, environmental estimates and repair options.")}</Drawer.Description><div className="drawer-scroll"><ResultCard input={input} model={model} onFind={openFinder}/></div></Drawer.Content></Drawer.Portal></Drawer.Root>}</>;
}
