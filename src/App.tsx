import { t, useLang, langs, type Lang } from './i18n';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import CheckTool from './check';
import { InstallButton } from './home';
import { blankInput, factors, readLog, saveLog, type Input, type Model, type Status } from './core';
import { fromSlug } from './records';
import { blankTicket, decodeRepairTicket, isSharedTicket } from './ticket';
import { Button } from './ui/button';
import { Card } from './ui/card';
const Method = lazy(() => import('./method').then(module => ({ default: module.Method })));
const Ticket = lazy(() => import('./ticket-page'));
const RepairLog = lazy(() => import('./repair-log'));
import { JobsProvider } from './journey';
import type { SaveExtra } from './repair-log';
const EventsPage = lazy(() => import('./events-page'));
const CategoryPage = lazy(() => import('./category-page'));
function useHash() {
  const [hash,setHash] = useState(window.location.hash || '#/');
  useEffect(()=>{ const handler=()=>setHash(window.location.hash||'#/');window.addEventListener('hashchange',handler);return()=>window.removeEventListener('hashchange',handler); },[]);
  return hash;
}
function Groups() {
  useLang();
  const [notice,setNotice] = useState('');
  const snippet=`<iframe src="${window.location.href.split('#')[0]}#/embed" title="FixOdds repair odds" width="100%" height="900" style="border:0" loading="lazy"></iframe>`;
  async function copy() { try { await navigator.clipboard.writeText(snippet);setNotice('Embed code copied.'); } catch { setNotice('Select and copy the code below. Clipboard access is unavailable.'); } }
  return <article className="groups"><p className="eyebrow">{t("Give repair a fair chance")}</p><h1>{t("For councils and repair groups")}</h1><p className="intro">{t("Help people check the repair odds before they replace a broken item.")}</p><Card><h2>{t("A repair check on your website")}</h2><p>{t("The embed shows the same local repair check, environmental estimates and next steps. The model runs in the visitor’s browser. No accounts, no tracking.")}</p><label>{t("Embed code")}<textarea rows={5} readOnly value={snippet} onFocus={e=>e.target.select()}/></label><Button variant="primary" onClick={()=>void copy()}><Copy size={17}/>{t("Copy embed code")}</Button>{notice&&<p role="status">{t(notice)}</p>}<Button asChild variant="ghost"><a href="#/embed" target="_blank" rel="noopener noreferrer">{t("Preview the embed")}<ExternalLink size={16}/></a></Button></Card><Card><h2>{t("What we can offer")}</h2><ul><li>{t("An embeddable repair check for your site.")}</li><li>{t("Branding adapted for your repair group or council.")}</li><li>{t("Reports using repair data, with sources and assumptions shown.")}</li></ul><p>{t("Talk to us about what your community needs.")}</p><Button asChild><a href="https://github.com/yy5652-hash/fixodds/issues/new" target="_blank" rel="noopener noreferrer">{t("Start a conversation")}<ExternalLink size={16}/></a></Button></Card></article>;
}
export default function App() { return <JobsProvider><Site/></JobsProvider>; }
function Site() {
  const { lang, setLang } = useLang();
  const hash=useHash(), path=hash.split('?')[0], embed=path==='#/embed';
  const shared=isSharedTicket(hash)?decodeRepairTicket(hash):null;
  const [input,setInput]=useState<Input>(()=>shared?.input||blankInput);
  const [ticketDetails,setTicketDetails]=useState(shared?.ticket||blankTicket);
  const [model,setModel]=useState<Model>();
  const [loadError,setLoadError]=useState(''), [retry,setRetry]=useState(0);
  const [log,setLog]=useState(()=>readLog());
  const [theme,setTheme]=useState(()=>{try{const value=localStorage.getItem('fixodds-theme');return value&&['auto','light','dark'].includes(value)?value:'auto';}catch{return'auto';}});
  const main=useRef<HTMLElement>(null), priorHash=useRef(hash);
  useEffect(()=>{let active=true;fetch('./model.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then((m:Model)=>{if(active){setModel(m);setLoadError('');}}).catch(()=>{if(active)setLoadError('The repair model could not load. Check your connection and try again.');});return()=>{active=false;};},[retry]);
  useEffect(()=>{if(shared){setInput(shared.input);setTicketDetails(shared.ticket);}},[hash]);
  // Category pages link to #/?item=<slug> to start a check for that item.
  useEffect(()=>{const pick=path==='#/'&&new URLSearchParams(hash.split('?')[1]||'').get('item');const category=pick?fromSlug(pick):undefined;if(category){setInput({...blankInput,category,size:factors[category].default||undefined});setTicketDetails(blankTicket);history.replaceState(null,'','#/');}},[hash]);
  useEffect(()=>{if(priorHash.current!==hash){window.scrollTo(0,0);main.current?.focus();priorHash.current=hash;}},[hash]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('fixodds-theme',theme);}catch{/* optional preference */}},[theme]);
  const current=shared?.input||input;
  function add(status:Status,date:string,extra:SaveExtra={}){const item=extra.input||current;if(!item.category&&!extra.input)return;const entries=[{id:extra.id||crypto.randomUUID(),date,input:item,status,intention:extra.intention,purchasePostponed:extra.purchasePostponed,route:extra.route,...(extra.warranty?{warranty:extra.warranty}:{}),...(extra.where?{where:extra.where}:{})},...log.entries];setLog({entries,error:saveLog(entries)});}
  function updateEntry(id:string,extra:Partial<import('./core').Evidence>){const entries=log.entries.map(e=>e.id===id?{...e,...extra}:e);setLog({entries,error:saveLog(entries)});}
  function remove(id:string){const entries=log.entries.filter(e=>e.id!==id);setLog({entries,error:saveLog(entries)});}
  const invalidShared=isSharedTicket(hash)&&!shared;
  return <><a href="#main" className="skip-link" onClick={e=>{e.preventDefault();main.current?.focus();}}>{t("Skip to content")}</a>{!embed&&<header className="site-header"><a className="brand" href="#/" aria-label={t("FixOdds home")}>FixOdds<span className="brand-dot">.</span></a><nav aria-label={t("Main navigation")}>{[['#/','Check'],['#/events','Repair events'],['#/items','Repair records'],['#/log','My repairs'],['#/method','Method'],['#/groups','For groups']].map(([href,text])=><a key={href} href={href} aria-current={path===href||(href==='#/items'&&path.startsWith('#/item/'))?'page':undefined}>{t(text)}</a>)}</nav><InstallButton/><label className="theme-label"><span>{t("Theme")}</span><select aria-label={t("Colour theme")} value={theme} onChange={e=>setTheme(e.target.value)}><option value="auto">{t("Auto")}</option><option value="light">{t("Light")}</option><option value="dark">{t("Dark")}</option></select></label><label className="theme-label language-label"><span>{t('Language')}</span><select aria-label="Language" value={lang} onChange={e=>setLang(e.target.value as Lang)}>{langs.map(l=><option key={l.code} value={l.code}>{l.name}</option>)}</select></label></header>}<main id="main" ref={main} tabIndex={-1} className={embed?'embed-main':undefined}>{embed&&<div className="embed-heading"><a className="brand" href={window.location.href.split('#')[0]+'#/'} target="_blank" rel="noopener noreferrer">FixOdds<ExternalLink size={13}/></a></div>}{loadError&&<p role="alert" className="notice">{t(loadError)} <Button onClick={()=>setRetry(n=>n+1)}>{t("Retry model")}</Button></p>}<Suspense fallback={<p role="status">{t("Loading…")}</p>}>{invalidShared?<Card><h1>{t("This ticket link is incomplete.")}</h1><p>{t("The contents could not be read. Ask for a new link or")} <a href="#/">{t("check your item")}</a>.</p></Card>:path==='#/method'?<Method/>:path==='#/groups'?<Groups/>:path==='#/events'?<EventsPage input={current.category?current:null}/>:path==='#/items'||path.startsWith('#/item/')?<CategoryPage path={path}/>:path==='#/log'?<RepairLog entries={log.entries} error={log.error} input={current.category?current:null} onSave={add} onRemove={remove} onUpdate={updateEntry}/>:path==='#/ticket'&&current.category?(model?<Ticket key={hash} input={current} model={model} shared={!!shared} details={shared?.ticket||ticketDetails} onDetailsChange={setTicketDetails} onLog={()=>{window.location.hash='/log';}}/>:<p role="status">{t("Loading your ticket…")}</p>):['#/','#/embed','#/result'].includes(path)?<CheckTool input={input} model={model} onChange={next=>{if(next.category!==input.category)setTicketDetails(blankTicket);setInput(next);}}/>:<Card><h1>{t("Start with your item.")}</h1><a href="#/">{t("Tell us what broke")}</a></Card>}</Suspense></main>{!embed&&<footer className="site-footer"><div><span className="brand">FixOdds.</span><p>{t("No accounts, no tracking")}</p><p>{t("Interface in 5 languages; descriptions understood in English, Dutch, German and French")}</p></div><p>{t("Data:")} <a href="https://openrepair.org/">Open Repair Alliance</a> {t("(CC BY-SA 4.0). Factors:")} <a href="https://therestartproject.org/">The Restart Project</a>.<br/>{t("Maps:")} <a href="https://www.openstreetmap.org/copyright">{t("© OpenStreetMap contributors")}</a> {t("(ODbL),")} <a href="https://leafletjs.com/">Leaflet</a>{t(". No endorsement implied.")}<br/><a href="#/method">{t("Read the method and limitations.")}</a></p></footer>}</>;
}
