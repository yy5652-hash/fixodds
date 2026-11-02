# Data licence and attribution

The source code of FixOdds is licensed under GPL-3.0 (see `LICENSE`). This file covers the data, the trained model and the statistics derived from the data.

## What is covered

- `public/model.json` (trained model coefficients)
- `src/data/stats.json`, `src/data/report.json`, `src/data/golden.json` (statistics, evaluation results and test predictions derived from the Open Repair Alliance data)
- `src/data/symptoms.json` (curated symptom term lists written for this project)

These are licensed under the **Creative Commons Attribution-ShareAlike 4.0 International** licence (CC BY-SA 4.0): https://creativecommons.org/licenses/by-sa/4.0/legalcode . You may share and adapt them, including commercially, if you give attribution, indicate changes and license your adaptation under the same terms.

This is a share-alike licence because the model and statistics are derived from CC BY-SA 4.0 data.

## Attribution

Derived in part from **Open Repair Data** published by the [Open Repair Alliance](https://openrepair.org/) (aggregate v0.3, July 2026, electrical and electronic equipment), licensed CC BY-SA 4.0: https://openrepair.org/open-data/downloads/ . The data is contributed by repair organisations and repair events in the alliance. Changes made: records with an unknown outcome were dropped; records were reduced to category, age, brand, repair status, barrier and event date; a multinomial logistic regression model, per-category counts and evaluation statistics were computed from them.

Suggested credit when reusing the model or statistics: "FixOdds model and statistics, derived from Open Repair Alliance data (CC BY-SA 4.0)".

The Open Repair Alliance and its members have not endorsed FixOdds, reviewed its results or verified its use of their data.

## Other sources

- **Category weights and footprints** (`src/data/factors.json`, `docs/factors.md`): values from [The Restart Project restarters.net](https://github.com/TheRestartProject/restarters.net) (lifecycle values in its database migrations, and the displacement and powered-emission settings in `.env.example`). That repository is licensed GPL-3.0, so these values are included under GPL-3.0 terms and are not covered by the CC BY-SA grant above. They are category averages and are not endorsed by The Restart Project.
- **Map data**: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the Open Database Licence (ODbL). `public/places.json` is an extract of that data and is itself under the ODbL. Typed place searches go to Nominatim, and results get a short-lived browser cache. OpenStreetMap map tiles are shown through [Leaflet](https://leafletjs.com/) (BSD-2-Clause).
- **iFixit, Repair Cafe International and Restarters** are linked to as external resources only. No data from them is used.

## Open Repair Data Standard export

The repair log export uses the column names of the [Open Repair Data Standard](https://standard.openrepair.org/). Exported files contain only what the user entered; a repair group must review and complete them before contributing them anywhere.
