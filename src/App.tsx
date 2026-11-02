import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import CheckTool from './check';
import { blankInput, readLog, saveLog, type Input, type Model, type Status } from './core';
import { blankTicket, decodeRepairTicket } from './ticket';
import { Button } from './ui/button';
import { Card } from './ui/card';
const Method = lazy(() => import('./method').then(module => ({ default: module.Method })));
const Ticket = lazy(() => import('./ticket-page'));
const RepairLog = lazy(() => import('./repair-log'));
function useHash() {
  const [hash,setHash] = useState(window.location.hash || '#/');
  useEffect(()=>{ const handler=()=>setHash(window.location.hash||'#/');window.addEventListener('hashchange',handler);return()=>window.removeEventListener('hashchange',handler); },[]);
  return hash;
}
function Groups() {
  const [notice,setNotice] = useState('');
  const snippet=`<iframe src="${window.location.href.split('#')[0]}#/embed" title="FixOdds repair odds" width="100%" height="900" style="border:0" loading="lazy"></iframe>`;
  async function copy() { try { await navigator.clipboard.writeText(snippet);setNotice('Embed code copied.'); } catch { setNotice('Select and copy the code below. Clipboard access is unavailable.'); } }
  return <article className="groups"><p className="eyebrow">Give repair a fair chance</p><h1>For councils and repair groups</h1><p className="intro">Help people check the repair odds before they replace a broken item.</p><Card><h2>A repair check on your website</h2><p>The embed shows the same local repair check, environmental estimates and next steps. The model runs in the visitor’s browser. No accounts, no tracking.</p><label>Embed code<textarea rows={5} readOnly value={snippet} onFocus={e=>e.target.select()}/></label><Button variant="primary" onClick={()=>void copy()}><Copy size={17}/>Copy embed code</Button>{notice&&<p role="status">{notice}</p>}<Button asChild variant="ghost"><a href="#/embed" target="_blank" rel="noopener noreferrer">Preview the embed<ExternalLink size={16}/></a></Button></Card><Card><h2>What we can offer</h2><ul><li>An embeddable repair check for your site.</li><li>Branding adapted for your repair group or council.</li><li>Reports using repair data, with sources and assumptions shown.</li></ul><p>Talk to us about what your community needs.</p><Button asChild><a href="https://github.com/yy5652-hash/fixodds/issues/new" target="_blank" rel="noopener noreferrer">Start a conversation<ExternalLink size={16}/></a></Button></Card></article>;
}
export default function App() {
  const hash=useHash(), path=hash.split('?')[0], embed=path==='#/embed';
  const shared=hash.includes('?d=')?decodeRepairTicket(hash):null;
  const [input,setInput]=useState<Input>(()=>shared?.input||blankInput);
  const [ticketDetails,setTicketDetails]=useState(shared?.ticket||blankTicket);
  const [model,setModel]=useState<Model>();
  const [loadError,setLoadError]=useState(''), [retry,setRetry]=useState(0);
  const [log,setLog]=useState(()=>readLog());
  const [theme,setTheme]=useState(()=>{try{const value=localStorage.getItem('fixodds-theme');return value&&['auto','light','dark'].includes(value)?value:'auto';}catch{return'auto';}});
  const main=useRef<HTMLElement>(null), priorHash=useRef(hash);
  useEffect(()=>{let active=true;fetch('./model.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then((m:Model)=>{if(active){setModel(m);setLoadError('');}}).catch(()=>{if(active)setLoadError('The repair model could not load. Check your connection and try again.');});return()=>{active=false;};},[retry]);
  useEffect(()=>{if(shared){setInput(shared.input);setTicketDetails(shared.ticket);}},[hash]);
  useEffect(()=>{if(priorHash.current!==hash){window.scrollTo(0,0);main.current?.focus();priorHash.current=hash;}},[hash]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('fixodds-theme',theme);}catch{/* optional preference */}},[theme]);
  const current=shared?.input||input;
  function add(status:Status,date:string){if(!current.category)return;const entries=[{id:crypto.randomUUID(),date,input:current,status},...log.entries];setLog({entries,error:saveLog(entries)});}
  function remove(id:string){const entries=log.entries.filter(e=>e.id!==id);setLog({entries,error:saveLog(entries)});}
  const invalidShared=hash.includes('?d=')&&!shared;
  return <><a href="#main" className="skip-link" onClick={e=>{e.preventDefault();main.current?.focus();}}>Skip to content</a>{!embed&&<header className="site-header"><a className="brand" href="#/" aria-label="FixOdds home">FixOdds<span className="brand-dot">.</span></a><nav aria-label="Main navigation">{[['#/','Check'],['#/log','My log'],['#/method','Method'],['#/groups','For repair groups']].map(([href,text])=><a key={href} href={href} aria-current={path===href?'page':undefined}>{text}</a>)}</nav><label className="theme-label"><span>Theme</span><select aria-label="Colour theme" value={theme} onChange={e=>setTheme(e.target.value)}><option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select></label></header>}<main id="main" ref={main} tabIndex={-1} className={embed?'embed-main':undefined}>{embed&&<div className="embed-heading"><a className="brand" href={window.location.href.split('#')[0]+'#/'} target="_blank" rel="noopener noreferrer">FixOdds<ExternalLink size={13}/></a></div>}{loadError&&<p role="alert" className="notice">{loadError} <Button onClick={()=>setRetry(n=>n+1)}>Retry model</Button></p>}<Suspense fallback={<p role="status">Loading…</p>}>{invalidShared?<Card><h1>This ticket link is incomplete.</h1><p>The contents could not be read. Ask for a new link or <a href="#/">check your item</a>.</p></Card>:path==='#/method'?<Method/>:path==='#/groups'?<Groups/>:path==='#/log'?<RepairLog entries={log.entries} error={log.error} input={current.category?current:null} onSave={add} onRemove={remove}/>:path==='#/ticket'&&current.category?(model?<Ticket key={hash} input={current} model={model} shared={!!shared} details={shared?.ticket||ticketDetails} onDetailsChange={setTicketDetails} onLog={()=>{window.location.hash='/log';}}/>:<p role="status">Loading your ticket…</p>):['#/','#/embed','#/result'].includes(path)?<CheckTool input={input} model={model} onChange={next=>{if(next.category!==input.category)setTicketDetails(blankTicket);setInput(next);}}/>:<Card><h1>Start with your item.</h1><a href="#/">Tell us what broke</a></Card>}</Suspense></main>{!embed&&<footer className="site-footer"><div><span className="brand">FixOdds.</span><p>No accounts, no tracking</p></div><p>Data: <a href="https://openrepair.org/">Open Repair Alliance</a> (CC BY-SA 4.0). Factors: <a href="https://therestartproject.org/">The Restart Project</a>.<br/>Maps: <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> (ODbL), <a href="https://leafletjs.com/">Leaflet</a>. No endorsement implied.<br/><a href="#/method">Read the method and limitations.</a></p></footer>}</>;
}
