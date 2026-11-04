import { t, useLang } from './i18n';
import report from './data/report.json';
import golden from './data/golden.json';
import { categories, factors, englishLabel, symptomData, symptomIds } from './core';
import { number, percent } from './format';

const rows = [
  ['global', 'Global rates only'],
  ['category', 'Item category only'],
  ['withoutSymptoms', 'Category + age + brand'],
  ['model', 'FixOdds: + 21 symptoms'],
] as const;

function Mini({ values }: { values: number[] }) {
  return <span className="mini-stack" aria-hidden="true">{values.map((v, i) => <span key={i} className={`segment segment-${i}`} style={{ width: `${v * 100}%` }} />)}</span>;
}

function Calibration() {
  const bins = report.metrics.model.calibration.filter(b => b.n && b.predicted !== null && b.observed !== null);
  const x = (v: number) => 60 + v * 370, y = (v: number) => 300 - v * 250;
  return <svg className="calibration" viewBox="0 0 480 360" role="img" aria-label="Calibration chart: predicted probability of Fixed against the fixed rate observed on held-out events. Points follow the diagonal.">
    <title>P(Fixed) calibration on held-out events</title>
    {[0, .2, .4, .6, .8, 1].map(t => <g key={t}><line x1="60" y1={y(t)} x2="430" y2={y(t)} className="chart-grid" /><text x="52" y={y(t) + 4} textAnchor="end">{Math.round(t * 100)}%</text><text x={x(t)} y="320" textAnchor="middle">{Math.round(t * 100)}%</text></g>)}
    <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="chart-diagonal" />
    <polyline fill="none" className="chart-line" points={bins.map(b => `${x(b.predicted!)},${y(b.observed!)}`).join(' ')} />
    {bins.map((b, i) => <circle key={i} cx={x(b.predicted!)} cy={y(b.observed!)} r={3 + 5 * Math.sqrt(b.n / report.split.testN)} className="chart-point"><title>{percent(b.predicted!)} predicted, {percent(b.observed!)} observed; n={number(b.n)}</title></circle>)}
    <text x="245" y="350" textAnchor="middle">Predicted probability of Fixed</text>
    <text x="8" y="26">Observed fixed rate</text>
  </svg>;
}

export function Method() {
  const { lang } = useLang();
  const m = report.metrics;
  const leakAuc = report.limitations.join(' ').match(/AUC (\d\.\d+)/)?.[1];
  const unquantified = categories.filter(c => !factors[c].variants.length);
  const lowest = report.verdictBands[report.verdictBands.length - 1];
  const gain = (1 - m.model.logLoss / m.category.logLoss) * 100;
  const modelBetter = m.model.logLoss < m.category.logLoss;
  const limitations = report.limitations.filter(l => !/free[- ]text|^Community events|^Brier|^Impact is/.test(l));
  return <article className="method">
    {lang!=='en'&&<p className="notice">{t('This page is in English so the method stays exact.')}</p>}
    <p className="eyebrow">{t('Open evidence / Honest limits')}</p>
    <h1>{t("Odds, with the working shown.")}</h1>
    <p className="intro">{t("FixOdds uses the outcomes of past community repairs to help you decide what to try next. It cannot diagnose a fault or promise a repair. Every number on this page is read from the files the model was built from.")}</p>

    <section className="ruled" id="evidence">
      <h2>{t("Tested on later events, at different repair groups")}</h2>
      <p>Source: {number(report.rawRows)} Open Repair Alliance attempts (July 2026 aggregate, v0.3). {number(report.unknownDropped)} with an unknown outcome are dropped, leaving {number(report.knownRows)}. For testing, the model learns from {number(report.split.trainN)} attempts made before {report.split.cutoff} at {number(report.split.trainGroups)} repair groups, and is scored on {number(report.split.testN)} attempts from {report.split.testStart} to {report.split.testEnd} at {number(report.split.testGroups)} other groups. No group appears on both sides ({report.split.groupOverlap} overlap), and 30% of repair groups are held out for evaluation.</p>
      <p>{number(report.split.excludedByDesign)} records are left out by design (older records from held-out groups, and later records from training groups). This is strict on purpose: it tests the model on groups and months it has never seen. The shipped model is then refit on all {number(report.model.trainedOnRows)} usable records with the same recipe.</p>
      <div className="table-scroll"><table>
        <caption>Held-out scores. Lower log loss and Brier are better; higher AUC is better.</caption>
        <thead><tr><th scope="col">Model</th><th scope="col">Log loss</th><th scope="col">Brier</th><th scope="col">Fixed AUC</th><th scope="col">End-of-life AUC</th></tr></thead>
        <tbody>{rows.map(([key, name]) => { const r = m[key]; return <tr key={key} className={key === 'model' ? 'highlight' : ''}><th scope="row">{name}</th><td>{number(r.logLoss, 4)}</td><td>{number(r.brier, 4)}</td><td>{number(r.aucFixed, 3)}</td><td>{number(r.aucEndOfLife, 3)}</td></tr>; })}</tbody>
      </table></div>
      <p>{modelBetter ? `With symptoms the model beats the item-category baseline on held-out log loss by ${number(gain, 1)}%.` : 'With symptoms the model does not beat the item-category baseline on held-out log loss.'} Its ability to rank one repair above another is modest (Fixed AUC {number(m.model.aucFixed, 2)}): a repair outcome depends on things nobody can type into a form beforehand. What it does well is be honest about the odds, as the next two sections show.</p>
      <p className="small">Multiclass Brier is the mean sum of three squared errors (range 0 to 2). AUC is one class against the rest. Baselines are fitted on training data only: global rates use Laplace smoothing; category rates use 10 pseudo-observations at the global rate. Nothing was tuned or recalibrated on the test set.</p>
    </section>

    <section className="ruled" id="bands">
      <h2>{t("When FixOdds says Repair first, what happened?")}</h2>
      <p>Each held-out attempt was given a verdict from the model alone, then compared with what actually happened. This is the most direct evidence that the verdict means something.</p>
      <div className="table-scroll"><table className="bands">
        <caption>Held-out outcomes by verdict (F is the chance of Fixed plus Repairable).</caption>
        <thead><tr><th scope="col">Verdict</th><th scope="col">F at least</th><th scope="col">Attempts</th><th scope="col">Fixed</th><th scope="col">Repairable</th><th scope="col">End of life</th><th scope="col"><span className="sr-only">Share of each outcome</span></th></tr></thead>
        <tbody>{report.verdictBands.map(b => <tr key={b.verdict}><th scope="row">{b.verdict}</th><td>{number(b.low, 2)}</td><td>{number(b.n)} <small>({percent(b.share)})</small></td><td>{percent(b.observedFixed)}</td><td>{percent(b.observedRepairable)}</td><td>{percent(b.observedEndOfLife)}</td><td><Mini values={[b.observedFixed, b.observedRepairable, b.observedEndOfLife]} /></td></tr>)}</tbody>
      </table></div>
      <p>The fixed rate falls from {percent(report.verdictBands[0].observedFixed)} to {percent(lowest.observedFixed)} across the three bands, and the end-of-life rate rises from {percent(report.verdictBands[0].observedEndOfLife)} to {percent(lowest.observedEndOfLife)}. Even in the lowest band, {percent(1 - lowest.observedEndOfLife)} of items were fixed or repairable. So the lowest verdict is not “throw it away”. It means: check parts and a quote first, then look at warranty, a refurbished replacement and proper recycling.</p>
    </section>

    <section className="ruled" id="calibration">
      <h2>{t("Do the probabilities match reality?")}</h2>
      <p>Held-out attempts were sorted into ten equal-width bins of predicted P(Fixed). Each point is the fixed rate actually observed in that bin; the diagonal is perfect calibration, and larger points hold more attempts. This describes past records, not future users.</p>
      <Calibration />
      <details><summary>Read all calibration values</summary><div className="table-scroll"><table>
        <thead><tr><th scope="col">Predicted bin</th><th scope="col">Attempts</th><th scope="col">Mean predicted</th><th scope="col">Observed fixed</th></tr></thead>
        <tbody>{m.model.calibration.map(b => <tr key={b.lower}><th scope="row">{Math.round(b.lower * 100)}–{Math.round(b.upper * 100)}%</th><td>{number(b.n)}</td><td>{b.predicted === null ? '—' : percent(b.predicted)}</td><td>{b.observed === null ? '—' : percent(b.observed)}</td></tr>)}</tbody>
      </table></div></details>
    </section>

    <section className="ruled" id="words">
      <h2>{t("Why free-text words are not used")}</h2>
      <p>In the repair data the “problem” field is mostly written after the repair is over. Words such as “replaced”, “soldered” or “not repairable” therefore describe the outcome rather than the fault. {leakAuc ? `A model trained on those words scored a held-out AUC of ${leakAuc}, but only because it was reading the answer. ` : 'A model trained on those words looks far more accurate, but only because it is reading the answer. '}That is not something a person could know before deciding, so it is excluded.</p>
      <p>Instead FixOdds uses {symptomIds.length} symptoms that a person can report before any repair: {symptomIds.map(id => symptomData[id].label.toLowerCase()).join('; ')}. Each is matched against fixed word lists in English, Dutch, German and French, and a test checks that no list contains outcome language. The honest consequence is that the headline accuracy is modest. We chose a modest number we can defend over a high one that would not survive contact with a real user.</p>
    </section>

    <section className="ruled" id="verdicts">
      <h2>{t("How an estimate becomes a next step")}</h2>
      <p>F = P(Fixed) + P(Repairable). “Repairable” means more work or parts are needed; it is not a completed repair.</p>
      <ul>{report.verdictBands.map(b => <li key={b.verdict}>F at least {number(b.low, 2)}: <strong>{b.verdict}</strong>{b.low === 0 ? ' (the rest)' : ''}</li>)}</ul>
      <p>The cut-offs are fixed in the code, and the table above reports what actually happened in each band on data the model never saw. Safety notices override the verdict at every level. Keyword checks cover English, French, German, Spanish, Dutch, Italian, Portuguese and Chinese but cannot recognise every hazard or language, so the absence of a notice does not mean an item is safe.</p>
      <h3>{t("Environmental and money formulas")}</h3>
      <p>Expected kg CO₂e avoided = P(Fixed) × category footprint × 0.5.<br />Expected kg of e-waste kept in use = P(Fixed) × category weight.<br />The full-success figure and every logged Fixed outcome use P(Fixed) = 1.<br />Break-even repair spend = F × the replacement price you enter. No prices are built in.</p>
      <p>Weights and footprints are category averages from The Restart Project’s current <code>up()</code> migration values, matched by category name. The 0.5 is their displacement factor: the assumption that half of repairs prevent a new purchase. Laptop defaults to medium and flat screens to 22–24 inches; hair dryer and food processor use labelled broader-category proxies. {unquantified.length} categories have no factor and are left unquantified rather than invented: {unquantified.map(c => englishLabel(c).toLowerCase()).join(', ')}.</p>
      <details><summary>Audit every category factor</summary><div className="table-scroll"><table>
        <thead><tr><th scope="col">Category</th><th scope="col">Restart factor</th><th scope="col">kg</th><th scope="col">kg CO₂e</th></tr></thead>
        <tbody>{categories.flatMap(cat => factors[cat].variants.length ? factors[cat].variants.map(v => <tr key={cat + v.name}><th scope="row">{englishLabel(cat)}{factors[cat].estimated ? ' (estimated)' : ''}</th><td>{v.name}{v.name === factors[cat].default ? ' · default' : ''}</td><td>{v.weight}</td><td>{v.footprint}</td></tr>) : [<tr key={cat}><th scope="row">{englishLabel(cat)}</th><td colSpan={3}>Unquantified</td></tr>])}</tbody>
      </table></div></details>
    </section>

    <section className="ruled" id="model">
      <h2>{t("What goes into the model")}</h2>
      <p>Multinomial logistic regression with {number(report.model.features)} binary features: item category, age bucket (including unknown), the most common brands in the training data plus other and unknown, the {report.model.symptoms} symptoms, and category-by-symptom pairs. Provider, country, group and event date are never inputs. Browser predictions match {golden.length} exported Python predictions within 0.000001.</p>
      <p>The model file is {number(report.model.gzipBytes / 1024, 1)} KiB gzipped. Predictions run on your device; there are no accounts, no analytics and no backend. The optional finder sends only your place or coordinates to OpenStreetMap services; outbound guide links include the item category and brand, never your description.</p>
    </section>

    <section className="ruled" id="limits">
      <h2>{t("Limitations")}</h2>
      <ul>
        <li>The data comes from community repair events, not paid repair shops. Volunteers, visitors and the items they bring are not a random sample of broken things.</li>
        <li>Outcomes are self-reported and recorded by volunteers, and the categories are broad.</li>
        {limitations.map(l => <li key={l}>{l}</li>)}
        <li>Impact figures use category averages and a 0.5 displacement assumption: an estimate of what a repair might avoid, not a measurement. Repair travel, parts, rebound effects and changes in running energy are not counted, and for inefficient appliances running energy can outweigh manufacturing savings.</li>
        <li>{unquantified.length} categories have no weight or footprint factor, so FixOdds shows odds but no savings for them.</li>
        <li>The tool has not been validated prospectively, and no real-world impact has been measured. A logged repair counts as avoided emissions only as an estimate.</li>
      </ul>
    </section>

    <section className="ruled" id="sources">
      <h2>{t("Sources and reuse")}</h2>
      <p><a href="https://openrepair.org/open-data/downloads/">Open Repair Alliance data</a> (<a href="https://media.githubusercontent.com/media/openrepair/data/main/OpenRepairData_v0.3_aggregate_202607_eee.csv">July 2026 aggregate</a>), CC BY-SA 4.0. <a href="https://github.com/TheRestartProject/restarters.net">The Restart Project restarters.net</a>, GPL-3.0, for the category factors and displacement assumption. <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (ODbL) for the optional finder, shown with <a href="https://leafletjs.com/">Leaflet</a>. None of these organisations has endorsed or reviewed FixOdds.</p>
      <p>Code is GPL-3.0. The model and statistics derived from Open Repair Alliance data are CC BY-SA 4.0. See DATA-LICENSE.md in the repository.</p>
    </section>
  </article>;
}
