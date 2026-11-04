import { t, useLang } from './i18n';
import { useEffect, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { number, percent } from './format';
import { breakEven, factorFor, factors, impact, quotePasses, safety, statuses, type Input, type Probabilities } from './core';
export function AnimatedNumber({ value, digits = 1 }: { value: number; digits?: number }) {
  const { lang } = useLang();
  const reduced = useReducedMotion();
  const current = useMotionValue(value);
  const formatted = useTransform(current, n => number(n, digits));
  useEffect(() => { const controls = animate(current, value, { duration: reduced ? 0 : .25 }); return () => controls.stop(); }, [value, reduced, current, lang]);
  return <motion.span>{formatted}</motion.span>;
}
export function Odds({ probabilities }: { probabilities: Probabilities }) {
  useLang();
  const reduced = useReducedMotion();
  return <div className="odds"><div className="stack" role="img" aria-label={statuses.map((s,i)=>`${t(s==='Repairable'?'More work or parts':s)}: ${percent(probabilities[i])}`).join(', ')}>{probabilities.map((p,i)=><motion.span key={i} className={`segment segment-${i}`} initial={false} animate={{width:`${p*100}%`}} transition={{duration:reduced?0:.25}}/>)}</div><dl className="odds-labels">{statuses.map((s,i)=><div key={s}><dd><AnimatedNumber value={probabilities[i]*100}/>%</dd><dt>{t(s==='Repairable'?'More work or parts':s)}</dt></div>)}</dl></div>;
}
export function SafetyNotice({ input }: { input: Input }) {
  useLang();
  const reasons = safety(input);
  if (!reasons.length) return null;
  return <aside className="safety" role="alert"><p className="eyebrow">{t("Safety comes first")}</p><h2>{t("Stop using it. Get professional help.")}</h2><p>{reasons.map(reason=>t(reason)).join(' · ')}{t(". Do not open, charge or test the item. Disconnect power only if it is safe. For active fire or a suspected gas leak, move away and contact local emergency services.")}</p><p>{t("A high repair probability does not mean it is safe to repair yourself. A microwave can retain lethal voltage even when unplugged.")}</p><details><summary>{t("Safety message in other languages")}</summary><p lang="fr">Cessez de l’utiliser. Ne l’ouvrez pas et ne le rechargez pas. Consultez un professionnel.</p><p lang="de">Nicht weiter benutzen, öffnen oder laden. Wenden Sie sich an eine Fachkraft.</p><p lang="es">Deje de usarlo. No lo abra ni lo cargue. Acuda a un profesional.</p><p lang="nl">Niet meer gebruiken, openen of opladen. Vraag professionele hulp.</p><p lang="it">Non utilizzarlo, aprirlo o ricaricarlo. Rivolgiti a un professionista.</p><p lang="pt">Pare de usar. Não abra nem carregue. Procure um profissional.</p><p lang="zh">停止使用，不要拆开或充电，请交由专业人员处理。</p></details></aside>;
}
export function ImpactBlock({ input, probabilities }: { input: Input; probabilities: Probabilities }) {
  useLang();
  const factor = factorFor(input);
  const row = factors[input.category];
  return <section className="impact-section"><p className="eyebrow">{t("The reason to try")}</p><h2>{t("A longer life. A smaller footprint.")}</h2>{factor ? <><div className="impact-numbers"><div><strong>{number(impact(probabilities[0],factor).carbon,1)}<small> kg CO₂e</small></strong><p>{t("expected emissions avoided")}</p><span>{number(impact(1,factor).carbon,1)} {t("kg if successfully fixed")}</span></div><div><strong>{number(impact(probabilities[0],factor).waste,2)}<small> kg</small></strong><p>{t("expected e-waste kept in use")}</p><span>{number(factor.weight,2)} {t("kg if successfully fixed")}</span></div></div><p className="small">{row.estimated?t("Estimated proxy"):t("Category-average estimate")} · {t(factor.name)}{t(". Avoided waste means delayed disposal, not permanent elimination.")}</p><details><summary>{t("See the assumptions and formulas")}</summary><p>{t('Expected CO₂e = P(Fixed) × {footprint} kg CO₂e × 0.5 displacement. Expected e-waste = P(Fixed) × {weight} kg. Full-success figures use P(Fixed) = 1.', { footprint: number(factor.footprint), weight: number(factor.weight,2) })}</p><p>{t("Displacement assumes half of repairs prevent a new purchase. Repairable is not yet fixed, so it contributes no environmental saving here. Parts, travel and differences in running energy are not included.")}</p><p className="small">{row.source}</p></details></> : <p className="notice">{t("We do not have a reliable footprint or weight for this category. A successful repair can keep an item in use, but we will not invent a savings figure.")}</p>}</section>;
}
export function Money({ feasible }: { feasible: number }) {
  useLang();
  const [replacement,setReplacement] = useState('');
  const [quote,setQuote] = useState('');
  const validReplacement = replacement.trim()!=='' && Number.isFinite(Number(replacement)) && Number(replacement)>=0;
  const validQuote = quote.trim()!=='' && Number.isFinite(Number(quote)) && Number(quote)>=0;
  return <section className="ruled"><p className="eyebrow">{t("Set your limit")}</p><h2>{t("What is a repair worth to you?")}</h2><p>{t("Use your own prices, in the same currency. Nothing is filled in for you.")}</p><div className="field-pair"><label>{t("Replacement price")} <span className="optional">{t("optional")}</span><input type="number" min="0" step="0.01" inputMode="decimal" value={replacement} onChange={e=>setReplacement(e.target.value)}/></label><label>{t("Repair quote")} <span className="optional">{t("optional")}</span><input type="number" min="0" step="0.01" inputMode="decimal" value={quote} onChange={e=>setQuote(e.target.value)}/></label></div>{validReplacement&&<div className="money-result" aria-live="polite"><p>{t("Break-even repair spend")} <strong>{number(breakEven(feasible,Number(replacement)),2)}</strong></p>{validQuote&&<p>{quotePasses(feasible,Number(replacement),Number(quote))?t("The quote is within your break-even spend."):t("The quote is above your break-even spend. Ask about a lower-cost option.")}</p>}</div>}<details><summary>{t("How this spending guide works")}</summary><p>{t("Break-even = [P(Fixed) + P(Repairable)] × your replacement price. This optimistic budget treats “repairable” as a possible eventual success; it is not a guarantee. Include diagnosis fees, labour and parts in the quote. Warranty, remaining lifespan and personal value also matter.")}</p></details></section>;
}
