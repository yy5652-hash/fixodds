// Home page below the check: live numbers, item shortcuts and what FixOdds promises.
import { useEffect, useState } from 'react';
import { ArrowUpRight, BadgeCheck, CalendarDays, Download, Gift, HandCoins, Lock, Scale } from 'lucide-react';
import report from './data/report.json';
import { categories, label, stats } from './core';
import { loadEvents, readArea, upcoming, type Area } from './events';
import { number, percent } from './format';
import { score, slug } from './records';
const popular = [...categories].filter(c => c !== 'Misc').sort((a, b) => stats[b].n - stats[a].n).slice(0, 12);
function LiveNumbers() {
  const [week, setWeek] = useState<{ all: number; near?: number; area?: Area }>();
  useEffect(() => {
    const area = readArea();
    loadEvents().then(events => {
      const now = new Date(), soon = new Date(now.getTime() + 30 * 86400000);
      const inWeek = events.filter(e => new Date(e.start) < soon);
      setWeek({ all: upcoming(inWeek, now, undefined, 0, 1e9).length, near: area ? upcoming(inWeek, now, area, 50, 1e9).length : undefined, area });
    }).catch(() => setWeek(undefined));
  }, []);
  const fixed = Object.values(stats).reduce((s, x) => s + (x.statusCounts.Fixed || 0), 0);
  const n = Object.values(stats).reduce((s, x) => s + x.n, 0);
  return <div className="live-numbers"><a href="#/events"><CalendarDays size={18}/><strong>{week ? number(week.near || week.all) : '…'}</strong><span>{week?.area && week.near ? `repair events within 50 km of ${week.area.name.split(',')[0]} in the next 30 days` : 'community repair events listed for the next 30 days'}</span></a><a href="#/items"><BadgeCheck size={18}/><strong>{number(fixed)}</strong><span>items fixed at repair events, {percent(fixed / n)} of {number(report.knownRows)} attempts</span></a><a href="#/method"><Scale size={18}/><strong>{number(report.split.testN)}</strong><span>later repairs the odds were tested on, from groups the model never saw</span></a></div>;
}
function PopularItems() {
  return <section className="popular" aria-labelledby="popular-heading"><div className="section-heading"><h2 id="popular-heading">What people bring to be fixed</h2><a href="#/items">All {categories.length} items <ArrowUpRight size={15}/></a></div><ul className="item-grid compact">{popular.map(c => { const s = stats[c]; return <li key={c}><a href={`#/?item=${slug(c)}`}><strong>{label(c)}</strong><span><b>{score(s.n, s.statusCounts.Fixed || 0)}</b>/10 repair record · {number(s.n)}</span></a></li>; })}</ul></section>;
}
export function Promises() {
  const items: [typeof Gift, string, string][] = [
    [Gift, 'Free, with no ads', 'Every feature is free to use. No paid placements and no upsell.'],
    [HandCoins, 'No commission from repairers', 'We do not take referral fees, so free repair cafes rank next to paid shops.'],
    [Lock, 'Your details stay with you', 'No account. Your description, log and repairs stay in this browser. Messages go from your own phone.'],
    [Scale, 'Honest numbers', 'Odds are tested on later repairs from unseen groups, and every figure shows its source and limits.'],
  ];
  return <section className="promises" aria-labelledby="promises-heading"><h2 id="promises-heading">Our promises</h2><ul>{items.map(([Icon, title, text]) => <li key={title}><Icon size={20}/><strong>{title}</strong><span>{text}</span></li>)}</ul><p className="small">Open source on <a href="https://github.com/yy5652-hash/fixodds" target="_blank" rel="noopener noreferrer">GitHub</a>. Data from the Open Repair Alliance, Restarters.net, iFixit and OpenStreetMap, each credited where it is used.</p></section>;
}
export default function HomeExtras() {
  return <div className="home-extras"><LiveNumbers/><PopularItems/><Promises/></div>;
}
type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export function InstallButton() {
  const [prompt, setPrompt] = useState<PromptEvent>();
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone) return;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const h = (e: Event) => { e.preventDefault(); setPrompt(e as PromptEvent); };
    window.addEventListener('beforeinstallprompt', h);
    window.addEventListener('appinstalled', () => setPrompt(undefined));
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  if (!prompt && !ios) return null;
  return <div className="install"><button type="button" className="install-button" onClick={async () => { if (prompt) { await prompt.prompt(); await prompt.userChoice; setPrompt(undefined); } else setHelp(!help); }} aria-expanded={ios ? help : undefined}><Download size={15}/>Install app</button>{help && <p className="install-help" role="status">In Safari, tap Share, then “Add to Home Screen”. FixOdds then opens like an app and works offline.</p>}</div>;
}
