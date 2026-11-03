# FixOdds

**Will a repair work? Check the odds before you replace it.**

**Live:** https://yy5652-hash.github.io/fixodds/

FixOdds is a free, static web app. You say what broke (an item, optionally its age and brand, and the symptoms), and it shows the chance that the repair works, based on 403,558 real repair attempts recorded by community repair groups. It then shows the emissions and e-waste a successful repair could avoid, what could stop the repair, a printable repair ticket, a repairer finder, and a personal log you can export in the Open Repair Data Standard.

It runs entirely in your browser. There is no account, no backend and no analytics. Your description never leaves the device.

Built for the Green Shift Hacks hackathon. FixOdds is new: it has not been used in the field, and no real-world impact has been measured. Everything below describes what the tool is built to do and what its data shows.

## The environmental case

Electrical and electronic waste is among the fastest-growing waste streams, and most of an electronic item's lifetime emissions come from making it. Keeping a working item in use longer is one of the most direct ways to avoid both the waste and those emissions, but people rarely know whether a repair is worth trying. Volunteers at repair events have recorded the answers for years. FixOdds turns that record into a decision aid.

What the data says, from the Open Repair Alliance aggregate used here:

- Of the 403,558 attempts with a known outcome, 226,733 (56.2%) were fixed and 72,504 (18.0%) were judged repairable with more work or parts. 104,321 (25.8%) were end of life.
- Applying FixOdds's own category factors (The Restart Project weights and footprints, with their 0.5 displacement assumption) to the 202,076 fixed repairs in categories that have a factor gives about 5,392 tonnes CO2e and 699 tonnes of e-waste kept in use. This is an illustration of what those past community repairs represent, not an impact claim for FixOdds.
- A single repair can matter: a successful laptop repair is estimated at 132.7 kg CO2e avoided (medium laptop, footprint 265.32 kg CO2e x 0.5), a kettle at 22.2 kg.

How FixOdds tries to turn that into avoided waste: it gives an honest chance of success up front (so people try repairs that are likely to work and plan around those that are not), points at the concrete obstacle for the item (spare parts, repair information, opening it safely), helps find a nearby repairer, and for items that cannot be saved it steers to warranty, refurbished replacement and proper e-waste recycling.

## What is in the box

- **Live check.** Search an item by name or common alias (MacBook, iPhone, Hoover), then tap symptoms to update the odds immediately, without submitting a form. Pick the item and tap the symptoms that fit (21 symptoms), or describe the problem in your own words in English, Dutch, German or French and matching symptoms are ticked automatically.
- **Result.** A verdict, the three odds (fixed, repairable with more work or parts, end of life) as one bar, the number of real attempts behind them, and each selected symptom’s change in fixed-or-repairable percentage points, calculated by removing that symptom. Mobile devices get a sticky verdict and a full-result drawer.
- **Impact.** Expected kg CO2e avoided and kg of e-waste kept in use, with the full-success figure beside each and the formula one tap away.
- **Money (optional).** Enter a replacement price and optionally a repair quote to see the break-even repair spend. No prices are built in.
- **What stops this repair.** The top recorded barriers for the item, each with a concrete action.
- **Safety.** Smoke, burning, sparks, gas, water near electrics, swollen batteries, microwaves and opening mains-powered equipment (typed or ticked) override the verdict with a stop-and-get-a-professional notice.
- **Find help.** Phone, opening hours and OSM directions when available. On click only: the nearest of 20,034 mapped repair cafes and repair shops worldwide, computed on the device from a bundled OpenStreetMap extract (`scripts/build_places.py`) and shown on a Leaflet map, plus links to iFixit, Repair Cafe International and Restarters groups.
- **Repair ticket.** A printable hand-over ticket with agreed maximum spend, quote, condition checkboxes, notes and a QR code. A share link keeps these fields in the URL fragment and old links still open. Your written description is left out of the link unless you tick a box.
- **My repair log.** Local to the browser. Totals of estimated CO2e and e-waste for repairs you completed, and CSV export using the Open Repair Data Standard column names.
- **The method page.** The split, scores against baselines, a table of what actually happened for each verdict, a calibration chart, formulas, sources and limitations. All numbers on it come from `src/data/report.json`.

- **Share an outlook.** Download a 1200×630 PNG with the item, verdict and available environmental estimates. File sharing is offered when the browser supports it. Images are created on the device.
- **For repair groups.** An iframe snippet for the same check without the site navigation, with a GitHub contact link for embed, branding and data-report discussions.
- **Theme and offline shell.** Auto, Light and Dark modes, local Inter fonts, keyboard item search, reduced-motion support and print styles. The service worker precaches the current hashed shell and model; optional pages and the finder are available offline after visiting them online. Place search and map tiles need a connection.
- **Dataset context.** Before choosing an item, see 416,282 raw repair attempts and the impact estimated for the 202,076 successful repairs with a default category factor. This is past community repair activity, not FixOdds impact.

## How good is it? (held out, out of time and across groups)

The model is trained on attempts made before 2025-02-01 at some repair groups and tested on attempts from 2025-02-01 to 2026-07-31 at other groups: nothing is shared between the two. Scores are on 41,047 test attempts.

| Model | Log loss | Brier | Fixed AUC | End-of-life AUC |
|---|---:|---:|---:|---:|
| Global rates only | 0.9810 | 0.5837 | 0.500 | 0.500 |
| Item category only | 0.9628 | 0.5720 | 0.585 | 0.597 |
| Category + age + brand | 0.9571 | 0.5694 | 0.592 | 0.603 |
| FixOdds (+ 21 symptoms) | 0.9350 | 0.5544 | 0.640 | 0.650 |

The ranking power is modest, and that is deliberate (next section). The probabilities are well calibrated, and the verdicts separate outcomes clearly:

| Verdict | Attempts | Fixed | Repairable | End of life |
|---|---:|---:|---:|---:|
| Repair first (F at least 0.80) | 11,130 | 69.7% | 17.9% | 12.3% |
| Worth a try (F at least 0.65) | 22,383 | 55.1% | 18.4% | 26.5% |
| Harder repair, check first | 7,534 | 41.5% | 19.1% | 39.4% |

F is P(Fixed) + P(Repairable). Even the lowest band is not "throw it away": 60.6% of those items were still fixed or repairable, so the advice there is to check parts and a quote first, then warranty, refurbished replacement and proper recycling.

### Why the model does not use free text

In the source data the "problem" field is mostly written after the repair, so words such as "replaced" or "not repairable" describe the outcome. A model trained on free words scored a held-out Fixed AUC of 0.81, but only because it was reading the answer, which nobody can know beforehand. FixOdds therefore uses only item category, age, brand and 21 curated symptoms that a person can report before a repair. A test checks that no symptom term contains outcome language.

## Run it

Requires Node.js 20 or newer.

```sh
npm install
npm run dev          # http://127.0.0.1:5173
npm test             # unit tests, including 200 Python-to-TypeScript parity checks
npm run build        # type-check and production build into dist/
npx playwright install chromium
npm run test:e2e     # end-to-end flow, map services mocked
```

The build is static with relative paths: copy `dist/` to any static host.
Every push to `main` deploys to GitHub Pages through `.github/workflows/pages.yml`.

The demo film is rendered from the real build: `film/render.cjs` steps a headless browser frame by frame, `film/mix.py` lays the narration over the music.

## Retrain the model

The training script is deterministic and runs locally. It writes `public/model.json` and everything in `src/data/`.

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
mkdir -p data/raw && cd data/raw
curl -L -o eee.csv https://media.githubusercontent.com/media/openrepair/data/main/OpenRepairData_v0.3_aggregate_202607_eee.csv
B=https://raw.githubusercontent.com/TheRestartProject/restarters.net/master
curl -L -o lca_migration.php $B/database/migrations/2021_08_13_000439_update_lca_unpowered_categories.php
curl -L -o init_db.php $B/database/migrations/2018_04_19_102108_initialise_fixometer_db.php
curl -L -o fix_names.php $B/database/migrations/2021_10_04_124708_fix_category_names.php
curl -L -o env.example $B/.env.example
# Any other file placed in data/raw is only hashed into report.json for provenance.
cd ../.. && .venv/bin/python scripts/train.py
```

`docs/factors.md` shows the full mapping from Open Repair Alliance categories to Restart weights and footprints so a person can audit it.

## Data sources and licences

- **Open Repair Alliance** repair data, [July 2026 aggregate v0.3](https://openrepair.org/open-data/downloads/), CC BY-SA 4.0. The model and statistics derived from it are shared under CC BY-SA 4.0 (see `DATA-LICENSE.md`).
- **The Restart Project** ([restarters.net](https://github.com/TheRestartProject/restarters.net), GPL-3.0): category weights, footprints and the 0.5 displacement factor.
- **OpenStreetMap** contributors (ODbL) bundled as `public/places.json` (extract via QLever) for the finder, with Nominatim for typed place search, shown with **Leaflet** (BSD-2-Clause). Nominatim is used lightly: one request per user action, throttled and cached.
- Interface: **Tailwind CSS** and **@tailwindcss/vite** (MIT), **Motion** (MIT), **cmdk** (MIT), **Vaul** (MIT), **Radix UI** (MIT), **lucide-react** (ISC), **Inter / @fontsource-variable/inter** (SIL Open Font License 1.1), **qrcode-generator** (MIT), **clsx** (MIT), **tailwind-merge** (MIT), and **class-variance-authority** (Apache-2.0). The small `src/ui/` components follow the **shadcn/ui** pattern (MIT).
- Code: GPL-3.0 (`LICENSE`).

FixOdds is not endorsed by, affiliated with or reviewed by the Open Repair Alliance, The Restart Project, OpenStreetMap or Leaflet.

## Limitations

- The data comes from community repair events, not paid repair shops, and outcomes are self-reported by volunteers. Selection bias applies.
- Accuracy is modest (Fixed AUC 0.64) because only information available before a repair is used. The probabilities are calibrated on held-out data; that is not a guarantee for any one item.
- Impact figures use category-average weights and footprints with a 0.5 displacement assumption, and ignore transport, parts, rebound effects and changes in running energy. They are estimates, not measurements.
- Four categories (battery/charger/adapter, large home electrical, small home electrical, misc) have no factor: odds are shown, savings are not.
- Safety keyword checks cover eight languages but cannot recognise every hazard; no notice does not mean an item is safe.
- The tool has not been validated prospectively and has no measured real-world impact.

## Layout

```
src/            React app, core.ts (prediction, verdict, impact, safety), method page, finder
src/data/       generated: report.json, stats.json, factors.json, golden.json; symptoms.json (curated)
public/         model.json, services.json, manifest, icon, service worker
scripts/        train.py
e2e/            Playwright flow test
docs/           factor mapping audit
```
