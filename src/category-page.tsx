import { t, useLang, locale } from './i18n';
// Category pages: the measured repair record of an item type, by age, brand and problem, with real cases.
import { useEffect, useState } from 'react';
import { ArrowUpRight, PackageSearch } from 'lucide-react';
import { barrierActions, categories, inputSymptoms, label, englishLabel, stats, statuses, symptomData, type Input } from './core';
import { countryName, fromSlug, loadCases, loadInsights, partsBarriers, similarCases, slug, wilson, type Case, type CategoryRecord, type Insights, type Row } from './records';
import { GuideList } from './routes';
import { number, percent } from './format';
import { Card } from './ui/card';
export function useInsights() {
  const [data, setData] = useState<Insights>();
  const [error, setError] = useState(false);
  useEffect(() => { loadInsights().then(setData).catch(() => setError(true)); }, []);
  return { data, error };
}
export function Bar({ row, compact }: { row: Row; compact?: boolean }) {
  useLang();
  const [, n, fixed, repairable] = row, eol = n - fixed - repairable;
  return <div className={`record-bar${compact ? ' compact' : ''}`} role="img" aria-label={t("{percent_fixed___n_} fixed, {value2} more work or parts, {percent_eol___n_} end of life, from {number_n_} attempts", { percent_fixed___n_: percent(fixed / n), value2: percent(repairable / n), percent_eol___n_: percent(eol / n), number_n_: number(n) })}><span className="segment segment-0" style={{ width: `${fixed / n * 100}%` }}/><span className="segment segment-1" style={{ width: `${repairable / n * 100}%` }}/><span className="segment segment-2" style={{ width: `${eol / n * 100}%` }}/></div>;
}
function RecordTable({ rows, name, caption, min = 1 }: { rows: Row[]; name: (s: string) => string; caption: string; min?: number }) {
  useLang();
  const shown = rows.filter(r => r[1] >= min);
  if (!shown.length) return null;
  return <div className="record-table" role="table" aria-label={caption}>{shown.map(r => { const [lo, hi] = wilson(r[2], r[1]); return <div role="row" key={r[0]}><span role="cell" className="record-name">{name(r[0])}</span><span role="cell" className="record-bar-cell"><Bar row={r} compact/></span><span role="cell" className="record-score" title={t("95% interval {percent_lo_}–{percent_hi_}", { percent_lo_: percent(lo), percent_hi_: percent(hi) })}><strong>{percent(r[2] / r[1])}</strong> {t("fixed")}</span><span role="cell" className="record-n">{number(r[1])}</span></div>; })}</div>;
}
export function PartsNotice({ category }: { category: string }) {
  useLang();
  const stat = stats[category];
  const parts = stat?.barriers.filter(b => partsBarriers.includes(b.name)).reduce((s, b) => s + b.share, 0) || 0;
  if (!stat || stat.barrierN < 30 || parts < 0.25) return null;
  const q = encodeURIComponent(englishLabel(category));
  return <aside className="parts-notice"><PackageSearch size={20}/><div><strong>{t("Spare parts are the usual blocker.")}</strong><p>{t('{share} of stated end-of-life barriers for {item} were parts that were unavailable or too expensive ({count} records). Find the exact model number on the label first, then search for the part before you book.', { share: percent(parts), item: label(category), count: number(stat.barrierN) })}</p><div className="help-links"><a href={`https://www.ifixit.com/Parts?q=${q}`} target="_blank" rel="noopener noreferrer">{t("iFixit parts ↗")}</a><a href={`https://www.ifixit.com/Search?query=${q}%20parts`} target="_blank" rel="noopener noreferrer">{t("Parts guides ↗")}</a></div></div></aside>;
}
export function CaseList({ cases, empty }: { cases: Case[]; empty: string }) {
  useLang();
  if (!cases.length) return <p className="small">{t(empty)}</p>;
  return <ul className="case-list">{cases.map((c, i) => <li key={i}><span className={`case-status status-${c.status}`}>{t(c.status === 1 ? 'More work or parts' : statuses[c.status])}</span><blockquote>{c.problem}</blockquote><small>{[c.brand, c.age && t('{age} years old', { age: c.age }), countryName(c.country), c.year, c.provider].filter(Boolean).join(' · ')}</small></li>)}</ul>;
}
export function SimilarCases({ input }: { input: Input }) {
  useLang();
  const [cases, setCases] = useState<Case[]>();
  const index = categories.indexOf(input.category);
  useEffect(() => { let live = true; setCases(undefined); loadCases(index).then(c => { if (live) setCases(c); }).catch(() => { if (live) setCases([]); }); return () => { live = false; }; }, [index]);
  const found = cases ? similarCases(cases, input, 4) : [];
  const by = inputSymptoms(input).length ? 'the same symptoms' : input.brand ? 'the same brand' : 'this item';
  return <section className="similar" aria-labelledby="similar-heading"><h2 id="similar-heading">{t("Real repairs like yours")}</h2><p className="small">{t('Records with {match}, written by volunteers at repair events. Shown as recorded, in their own language.', { match: t(by) })}</p>{!cases ? <p role="status" className="small">{t("Loading cases…")}</p> : <CaseList cases={found} empty={t("No close match in the sample of 300 records for this item.")}/>}<a className="method-link" href={`#/item/${slug(input.category)}`}>{t('Full repair record for {item}', { item: label(input.category) })} <ArrowUpRight size={15}/></a></section>;
}
function Index({ data }: { data?: Insights }) {
  useLang();
  const list = [...categories].sort((a, b) => label(a).localeCompare(label(b),locale()));
  return <article className="items-page"><p className="eyebrow">{t("403,558 real repair attempts")}</p><h1>{t("Repair records by item.")}</h1><p className="intro">{t("How often each kind of item was fixed at community repair events, with the brands, ages and problems behind it.")}</p><ul className="item-grid">{list.map(c => { const r = data?.categories[c]; return <li key={c}><a href={`#/item/${slug(c)}`}><strong>{label(c)}</strong>{r ? <><Bar row={[c, ...r.all]} compact/><span><b>{percent(r.all[1]/r.all[0])} {t("fixed")}</b> · {number(r.all[0])} {t("attempts")}</span><small>{t("fixed at recorded community repair events")}</small></> : <span>&nbsp;</span>}</a></li>; })}</ul><p className="small">{t("Fixed percentage = share of recorded community repair attempts that ended fixed. It measures past repair outcomes, not product design. Source: Open Repair Alliance (CC BY-SA 4.0).")}</p></article>;
}
export default function CategoryPage({ path }: { path: string }) {
  useLang();
  const { data, error } = useInsights();
  const category = fromSlug(path.replace('#/item/', ''));
  const [cases, setCases] = useState<Case[]>([]);
  useEffect(() => { if (category) loadCases(categories.indexOf(category)).then(setCases).catch(() => setCases([])); }, [category]);
  if (path === '#/items' || !category) return <>{!category && path !== '#/items' && <p className="notice">{t("That item page was not found. Choose one below.")}</p>}<Index data={data}/></>;
  const r: CategoryRecord | undefined = data?.categories[category];
  const stat = stats[category], name = label(category);
  const input: Input = { category, age: 'unknown', brand: '', problem: '' };
  return <article className="item-page"><a className="back-link" href="#/items">{t("All items")}</a><p className="eyebrow">{t("Repair record")}</p><h1>{name}</h1>
    {error && <p className="notice">{t("Repair records could not load. Check your connection.")}</p>}
    {r && <><div className="item-hero"><div><strong className="item-score">{percent(r.all[1]/r.all[0])}<small> {t("fixed")}</small></strong><span>{t("fixed at recorded community repair events")}</span><span>{t('fixed in {rate} of {count} attempts', { rate: percent(r.all[1]/r.all[0]), count: number(r.all[0]) })}</span></div><div><Bar row={[category, ...r.all]}/><dl className="odds-labels"><div><dd>{percent(r.all[1] / r.all[0])}</dd><dt>{t("Fixed")}</dt></div><div><dd>{percent(r.all[2] / r.all[0])}</dd><dt>{t("More work or parts")}</dt></div><div><dd>{percent(1 - (r.all[1] + r.all[2]) / r.all[0])}</dd><dt>{t("End of life")}</dt></div></dl></div><a className="button primary" href={`#/?item=${slug(category)}`}>{t('Check my {item}', { item: locale()==='de-DE'?name:name.toLowerCase() })}</a></div>
      <PartsNotice category={category}/>
      <div className="item-grid-2">
        <Card><h2>{t("By age")}</h2><RecordTable rows={r.ages} name={a => t('{age} years', { age: a })} caption={t("Outcomes by age")} min={30}/><p className="small">{stat.medianAge != null ? t("Median age at repair: {value1} years ({number_stat_ageN_} with an age).", { value1: number(stat.medianAge, 1), number_stat_ageN_: number(stat.ageN) }) : ''} {t("Older items were often fixed too: age alone is rarely the reason to replace.")}</p></Card>
        <Card><h2>{t("By problem")}</h2><RecordTable rows={r.symptoms} name={s => t(symptomData[s]?.label || s)} caption={t("Outcomes by problem")}/><p className="small">{t("Problems picked up from the volunteers’ notes. One record can mention several.")}</p></Card>
      </div>
      <Card><h2>{t("By brand")}</h2>{r.brands.length ? <RecordTable rows={r.brands} name={b => b} caption={t("Outcomes by brand")}/> : <p>{t("Not enough branded records to compare brands.")}</p>}<p className="small">{t('Brands with at least {count} recorded attempts. Hover a score for its 95% interval: overlapping intervals are not clearly different. Records reflect what people brought in, not a brand test.', { count: data?.minBrand||0 })}</p></Card>
      <div className="item-grid-2">
        <Card><h2>{t("What stops the repair")}</h2>{stat.barriers.length ? <ul className="barrier-list">{stat.barriers.map(b => <li key={b.name}><span>{t(b.name)}</span><strong>{percent(b.share)}</strong><small>{t(barrierActions[b.name])}</small></li>)}</ul> : <p>{t("Too little barrier information.")}</p>}<p className="small">{t('Share of {count} end-of-life records that state a barrier.', { count: number(stat.barrierN) })}</p></Card>
        <Card><h2>{t("Where it was repaired")}</h2><RecordTable rows={r.countries} name={c => countryName(c)} caption={t("Outcomes by country")}/><p className="small">{t("Recording practice differs by network; Denmark does not use “more work or parts”.")}</p></Card>
      </div>
      <Card><GuideList input={input}/></Card>
      <Card><h2>{t("Real cases")}</h2><CaseList cases={cases.slice(0, 8)} empty={t("Loading cases…")}/><p className="small">{t("A random sample of records with a written description. Source: Open Repair Alliance (CC BY-SA 4.0).")}</p></Card>
    </>}
    {!r && !error && <p role="status">{t("Loading the repair record…")}</p>}
  </article>;
}
