# Task B: finish the repair journey (FixOdds, static React site, no backend)

Read src/routes.tsx, src/repair-log.tsx, src/core.ts (Job, stages, readJobs/saveJobs, LogEntry), src/events-page.tsx, src/events.ts, src/finder.tsx, src/check.tsx, src/App.tsx first. New/changed English strings need nl, de, fr, zh entries in src/i18n.ts. Keep the dense code style. Storage stays in localStorage; old saved data must still load.

1. Saved next step
   - In each route card add a button "Make this my next step". It creates (or updates) a tracker job for the current input with `route` ('diy' | 'cafe' | 'shop'), a `next` text (diy: "Follow the guide: <title>" when a matched guide exists, else "Find a matching guide"; cafe: "<group>, <date>" of the next event if known, else "Find a repair event"; shop: "Ask a repairer for a diagnosis and quote") and, for cafe, the event id/link/date as the appointment.
   - The check page shows, above the result, a slim card for an open job of the same item: "Your next step: …" with buttons to open the tracker and to mark the step done.
   - Opening an enquiry link (SMS/WhatsApp/email) sets the job stage to a new first-class state "Enquiry sent?" that asks the user to confirm ("Yes, I sent it" / "Not yet") — opening an app is not proof of sending.
2. Tracker states and outcomes (src/core.ts stages, src/repair-log.tsx)
   - Stages: Planned → Enquiry sent → Booked → With the repairer → Waiting for parts → Done. Recording "Repairable — more work or parts" keeps the job open in "Waiting for parts" with next step "Order or ask about the part" instead of removing it.
   - Optional evidence fields (never required, small): before choosing a route "What were you planning to do?" (replace / discard / repair / undecided); after a Fixed outcome "Did this postpone or cancel buying a new one?" (yes / no / not sure); a "Still working?" check 30 days after a Fixed outcome (show the prompt on the log page when due).
   - Log totals separate: items reported fixed, purchases reported postponed, items reported still in use. Keep CO2e labelled as an estimate.
   - Add "Export pilot CSV" next to the ORDS export with those evidence fields (separate file, no personal data beyond what the user typed).
3. Unsuccessful repair → next route: an "End of life" outcome shows three actions: search the exact model's parts on iFixit (model number if known), ask a repair cafe for donor parts (link to events page), find official e-waste take-back (link to a recycling-locator search for the user's area: UK recyclenow.com/recycling-locator, else a generic web search link "e-waste recycling near <town>").
4. Events page
   - Status labels from the title/description text: FULL, cancelled, booking required → a chip on the event; for FULL/cancelled the calendar button is secondary and labelled "Add anyway".
   - Primary action per event "Details and booking"; "Add to calendar" secondary. Move the bulk "Add these N to my calendar" into a small text link below the list.
   - "Make this my next step" per event (uses the job from 1 for the current input if any, else creates a job with item unknown).
   - Show "Events snapshot updated <date>" from events.json `built`.
5. Tests: unit tests for stage transitions (Repairable keeps the job open), event status parsing, saved-step creation; `npx vitest run`, `npx tsc --noEmit`, `npm run build` all pass; update e2e/flow.spec.ts where text changed (you cannot run Playwright in the sandbox; Claude runs it). No npm install / npm ci, no commit, no deploy.
