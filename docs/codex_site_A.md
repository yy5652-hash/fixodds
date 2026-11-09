# Task A: trust and safety fixes from an external review (FixOdds, static React site)

Context: an external reviewer tested the live site and found real bugs. Fix them. The UI strings are translated through src/i18n.ts (dictionary keyed by the English string, languages nl, de, fr, zh): every new or changed user-visible English string needs entries in all four languages, written naturally. Keep the code style of the surrounding files (dense JSX, short comments only where logic is non-obvious).

1. Guide matching and safety (src/guides.ts, src/routes.tsx, src/core.ts, src/check.tsx)
   - Broad categories (at least 'Small kitchen item', 'Small home electrical', 'Misc', 'Decorative or safety lights', 'Hair & beauty item', 'Toy', 'Large home electrical' — check the category list) must not map to one specific device such as "microwave". For a broad category, show an optional "What is it exactly?" text field (device type, e.g. "toaster") next to the existing brand field; add an optional "Model number" field for every category. Store both on Input (keep tickets/short links backward compatible: old links without these fields still decode). Use device type and model in the iFixit query when given.
   - A guide counts as a match only if its title names the item (category keyword or the device type the user typed). Otherwise show guides under the heading "Related guides — model compatibility unconfirmed" and never let them make "Fix it yourself" the suggested route.
   - Safety: run the safety rules on the device type field as well as the description, and treat guides whose title mentions microwave, mains, power supply, capacitor, high voltage, gas, or CRT as hazardous: never suggest DIY on them and show the existing safety notice. A "Small kitchen item / won't turn on" case must not suggest DIY with microwave guides (add a unit test reproducing this).
   - Carry model number into the repair ticket, the enquiry text and the ORDS export notes where a free-text field exists.
2. Detected symptoms are suggestions the user controls (src/core.ts detectSymptoms, src/check.tsx toggle)
   - Clicking a detected chip removes it (keep a per-input "rejected" list so it does not come back while the text stays the same). Manual choices take precedence over detection.
   - Conservative negation handling in all four description languages: "battery is fine", "not the battery", "no problem with the screen", "Akku ist in Ordnung", "geen probleem met", "la batterie va bien" etc. must not detect that symptom. Unit tests for English + one other language.
   - When the item category changes, keep brand/age but clear symptoms.
3. Spending guide (src/core.ts breakEven/quotePasses and its UI)
   - Rename to "Illustrative repair-spending guide". Use the probability of "Fixed" only (not fixed + repairable) for the pay-even-if-it-fails case; show the assumption next to the number in one short line. Remove the approving verdict "The quote is within your break-even spend"; instead say "Below this illustrative limit" / "Above this illustrative limit" and add one line: "Ask whether you pay if the repair fails, and about any diagnosis fee." Update tests.
4. Copy fixes
   - Item record pages and anywhere "x/10" is the headline: make the headline "59% fixed" style (share of recorded community repair attempts that ended fixed), keep the 0–10 only as small secondary text or drop it. Label: "fixed at recorded community repair events".
   - "What moved these odds": explanation becomes "Difference compared with the same input without this symptom."
   - Impact block: show the CO2e and kg with matching conditions: "≈73 kg CO2e expected (probability-weighted)" and "1.8 kg kept in use if fixed" style, plus "133 kg if fixed"; the condition line under it: "Category average · half of successful repairs assumed to replace a purchase".
   - Language selector or footer: "Interface in 5 languages; descriptions understood in English, Dutch, German and French" where languages are described.
   - Finder "Open now": label it "Open now (your device's time)".
5. Tests: `npx vitest run` all green; `npx tsc --noEmit` clean; `npm run build` works. Update e2e/flow.spec.ts only where text changed. Do not run npm install / npm ci (node_modules is present; your sandbox has no network). Do not commit, do not deploy.
