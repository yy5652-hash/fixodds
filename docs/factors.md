# Auditable factor mapping

All weights are kg and footprints kg CO2e before displacement. **Only `up()` values** are read: `up()` updates category revision to 2; `down()` reverses the migration and contains the previous values. ORDS IDs are never used to join Restart IDs.

Sources: [LCA migration](https://github.com/TheRestartProject/restarters.net/blob/master/database/migrations/2021_08_13_000439_update_lca_unpowered_categories.php), [initial category names](https://github.com/TheRestartProject/restarters.net/blob/master/database/migrations/2018_04_19_102108_initialise_fixometer_db.php), [name corrections](https://github.com/TheRestartProject/restarters.net/blob/master/database/migrations/2021_10_04_124708_fix_category_names.php), [.env.example](https://github.com/TheRestartProject/restarters.net/blob/master/.env.example). Local source SHA-256 hashes are in report.json.

Default laptop: medium. Default screen: 22–24 inches. These are explicit choices, not averages or inferred sizes. Screens outside the supported sizes have no specific factor. Hair dryer uses the broader Hair & beauty item category (the Restart description explicitly includes dryers); Food processor uses Small kitchen item. Both are labelled estimated. Battery/charger/adapter, Large home electrical, Small home electrical and Misc remain unquantified. No measured weight is available, so the powered emission ratio (32.06679233 kg CO2e/kg) is documented but not used to invent weights.

Expected CO2e = P(Fixed) × footprint × 0.5. Full-success CO2e = footprint × 0.5. Expected e-waste = P(Fixed) × weight; full success = weight. Logged Fixed outcomes use full-success estimates, not measured environmental savings.

| ORDS name | Restart name (Restart ID) | kg | kg CO2e | Default / qualification |
|---|---|---:|---:|---|
| Aircon/dehumidifier | Aircon/dehumidifier (35) | 7.6 | 99.41 | Default |
| Battery/charger/adapter | — | — | — | Unquantified |
| Coffee maker | Coffee maker (10) | 1.28 | 17.5 | Default |
| DSLR/video camera | DSLR/video camera (22) | 0.59 | 16.03 | Default |
| Decorative or safety lights | Decorative or safety lights (36) | 0.46 | 14.72 | Default |
| Desktop computer | Desktop computer (11) | 6.69 | 414.17 | Default |
| Digital compact camera | Digital compact camera (21) | 0.48 | 29.73 | Default |
| Fan | Fan (37) | 3.9 | 15.6 | Default |
| Flat screen | Flat screen 22-24" (14) | 5.23 | 343.49 | Default |
| Flat screen | Flat screen 15-17" (12) | 3.15 | 262.56 | Size option |
| Flat screen | Flat screen 19-20" (13) | 3.66 | 304.88 | Size option |
| Flat screen | Flat screen 26-30" (27) | 10.6 | 284.25 | Size option |
| Flat screen | Flat screen 32-37" (28) | 18.7 | 349.58 | Size option |
| Food processor | Small kitchen item (42) | 2.95 | 30.9 | Default · estimated proxy |
| Games console | Games console (6) | 3.22 | 140.67 | Default |
| Hair & beauty item | Hair & beauty item (38) | 0.67 | 10.28 | Default |
| Hair dryer | Hair & beauty item (38) | 0.67 | 10.28 | Default · estimated proxy |
| Handheld entertainment device | Handheld entertainment device (23) | 0.14 | 22.71 | Default |
| Headphones | Headphones (24) | 0.4 | 3.0 | Default |
| Hi-Fi integrated | Hi-Fi integrated (29) | 8.95 | 186.5 | Default |
| Hi-Fi separates | Hi-Fi separates (30) | 8.72 | 123.86 | Default |
| Iron | Iron (9) | 1.17 | 11.0 | Default |
| Kettle | Kettle (39) | 1.25 | 44.32 | Default |
| Lamp | Lamp (40) | 2.68 | 14.96 | Default |
| Laptop | Laptop medium (16) | 1.83 | 265.32 | Default |
| Laptop | Laptop small (17) | 1.39 | 221.15 | Size option |
| Laptop | Laptop large (15) | 2.53 | 414.7 | Size option |
| Large home electrical | — | — | — | Unquantified |
| Misc | — | — | — | Unquantified |
| Mobile | Mobile (25) | 0.15 | 50.51 | Default |
| Musical instrument | Musical instrument (31) | 17.7 | 109.5 | Default |
| PC accessory | PC accessory (19) | 0.44 | 15.94 | Default |
| Paper shredder | Paper shredder (18) | 3.8 | 59.5 | Default |
| Portable radio | Portable radio (32) | 2.06 | 54.65 | Default |
| Power tool | Power tool (41) | 1.65 | 26.65 | Default |
| Printer/scanner | Printer/scanner (20) | 12.47 | 100.69 | Default |
| Projector | Projector (33) | 2.68 | 57.58 | Default |
| Sewing machine | Sewing machine (8) | 8.6 | 35.0 | Default |
| Small home electrical | — | — | — | Unquantified |
| Small kitchen item | Small kitchen item (42) | 2.95 | 30.9 | Default |
| TV and gaming-related accessories | TV and gaming-related accessories (34) | 1.99 | 51.33 | Default |
| Tablet | Tablet (26) | 0.77 | 114.49 | Default |
| Toaster | Toaster (43) | 1.47 | 8.13 | Default |
| Toy | Toy (44) | 0.93 | 10.4 | Default |
| Vacuum | Vacuum (45) | 6.8 | 36.01 | Default |
| Watch/clock | Watch/clock (7) | 1.3 | 28.29 | Default |
