# Progress

What has been built in CropCash, what has been proven, and what is left. Last updated 2026-11-20.

Two parts: **the subsidy monitor** (`subventii-monitor/`, plans in `subventii-plan.md`, terms in `glossary.md`) and **the app** (`web/`, Next.js, with `apps/api` and `packages/shared`, see [The app](#the-app)).

# The subsidy monitor

"Fixtures" means tested with made-up data. "Live" means checked against the real site.

## Status

| Milestone | State | Proven by |
| --- | --- | --- |
| A1 Sources and fetching | Done | Live: 171 of 180 sources reachable |
| A2 Change detection and database | Code done | Live in memory (11 sources). Never run on real Supabase |
| A3 Cleaner text, per-site noise | Done | Live: 147 pages compared, 3 noisy. 2 fixed, MySMIS is reported as blocked |
| A4 New link discovery | Built | Fixtures only |
| A5 Daily report | Built | Fixtures only |
| B1 EC API client | Built | Live: 96 calls read, 20 labelled for farmers |
| B2 Opportunities tables and parsers | Built | Parsers live on saved pages. Tables never run on real Supabase |
| B3 Relevance labels | Built | Live on saved MIPE data and fixtures |
| B4 Digest in the daily report | Built | Fixtures only |
| B5 Extra sources | Partly replaced | See below |

Tests: 210 passing, typecheck clean.

## To run it for real

Needs a hosted Supabase project.

1. From the repo root, run `npm run db:migrate`. The monitor schema is `supabase/migrations/004`–`007` (with the app schema), already applied on the shared project.
2. Fill `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env`.
3. Run `npm run seed`, then `npm run monitor` twice. The second run should show few downloads and no false changes.

## Plan A

### A1: done

- 179 sources parsed from `subventii-surse.md` (180 until two rows turned out to be the same ADR Sud-Muntenia page).
- Fetching with robots.txt checks, per-host pacing, retries, and conditional requests.
- Intermediate certificates added in `certs/`, so TLS checks stay on.
- Not reachable: DAJ Botoșani, MySMIS resources, APIA Cerere Unică, MADR Documente implementare PNS, MADR minimis news, EC TAM, DAJ Buzău, DAJ Sălaj, DAJ Hunedoara.

### A2: code done

- Cascade: headers, then conditional GET, then normalized text hash, then diff.
- `SupabaseStore` for production, `MemoryStore` for tests.
- Live in memory: second pass downloaded 549 KB against 6,646 KB, with no false changes.

### A3: done

- Text extraction with defuddle, selectors for `afir.ro` and `ansvsa.ro`, and the `noise-check` tool.
- Two saved passes of the same day compared: 147 pages, 3 noisy. A longer gap could still show date-based noise.
- `mfe.gov.ro` (2 pages): WordPress shuffled tag links, which are now removed.
- MySMIS: the site answers with a CAPTCHA page. It's now reported as blocked and never solved or retried.
- AFIR's live counter: the portal goes through a parser that leaves it out.
- Selectors for APIA and MADR weren't needed: their text was stable and sampled pages were main content.
- 4 moved links updated in the spec, one of which merged into an existing row. The APIA motorină page now sits in APIA's archive of finished measures.
- 4 pages have almost no text and go to manual checking: AGI Online, Registrul ajutoarelor de stat, DAJ Olt, DAJ Giurgiu.

### A4 and A5: built

- Links: silent first pass, keyword score, version grouping, at most 25 new sources per run.
- Report: Romanian Markdown, with "Nu s-a schimbat nimic." on quiet days.
- Every report ends with "Starea surselor": all sources with a current problem and the reason, including older ones.
- Left: try both on real pages.

## Plan B

### Sources

| Source | How | Result on real data |
| --- | --- | --- |
| AFIR portal | Parser | 7 components across DR-12, DR-14, DR-18 |
| MIPE calendar | Parser for the JSON inside the page | 1,089 calls, 281 not closed, 46 kept for farmers |
| EC Funding & Tenders | Official public API | 96 calls, 20 kept as partnership |

### What changed from the plan

- **Regional sites aren't needed for deadlines.** MIPE's list already covers all 8 regional programmes and the fisheries programme (PAP), so no regional parsers were built.
- **Not built:** GAL/LEADER sources, and a parser for the PNRR calendar. PNRR is still watched as a normal page.

### Decisions worth knowing

- A call's identity (`stable_key`) doesn't include its deadline, so an extension shows as a change rather than a new call.
- A parsed page's calls become its comparable text, so diffs show calls, and the free-text shrink alarm doesn't apply to it.
- If an EC request fails or returns nothing, stored calls stay as they are and the report shows the error.
- If a parser finds nothing, stored calls stay and the page is flagged for manual checking.
- A call that leaves a list before its deadline is reported, because the budget may have run out.
- Each source's first sync is silent, so the first report doesn't list everything as new.

### Known limits

- Relevance labels are a first filter, not an eligibility decision. They read MIPE's applicant text and call titles.
- B3's hand-check of 30 calls hasn't been done. On current MIPE data, no call is labelled direct and 46 are conditional.
- The EC API page confirms the API is public, but no usage limits were found. The client waits 2 seconds between requests.
- AFIR components have no applicant text, so all are labelled direct.

## Obligations to re-check (2026-11-19)

The app's „De raportat” page shows the diesel excise refund and the other deadlines from `docs/data/fuel-excise.json` and `docs/data/calendar-2026.json`. Each lists the official pages it rests on in `watch_urls`, and those pages are sources here (7 added: APIA press releases, the 2025 diesel page and guide, the 2026 claim page, two press releases, and HG 1174/2014 on legislatie.just.ro in a new §4.13). When a watched page changes, goes, comes back, or gets a new link about diesel, cost reports or registers, the daily report has a section „Obligații de re-verificat”, right after the farmer digest. Nothing is stored: a person updates the JSON. A test fails if a `watch_url` isn't in the spec (`src/obligations.ts`, `tests/obligations.test.ts`). **To do:** run `npm run seed -w subventii-monitor` on the machine that has the monitor's `.env`, so the 7 new sources are in the database.

**Excise schemes (2026-11-20, `docs/accize-plan.md` §5).** The same section now covers `docs/data/excise-schemes.json`: each scheme's `watch_urls` name the scheme to re-check, a proposal's line asks whether it became law, the schemes' `watch_keywords` count for new links, and a scheme 30 days before `valid_to` with nothing in force replacing it is listed even on a quiet day. One source added: the Codul fiscal (legislatie.just.ro 171282) in §4.13, so the spec has 187 rows. **To do:** `npm run seed -w subventii-monitor` again for it.

## Daily schedule

Windows task "Subventii Monitor" runs `scripts/daily.cmd` every day at 07:00, with one retry after a crash. Logs are in `subventii-monitor/data/logs/monitor.log`. If the PC is off at 07:00, it runs when the PC is next on and the user is logged in.

## Open issue: undici crash

The first real `npm run monitor` crashed on `assert(!this.paused)` in undici. It's a known undici bug (nodejs/undici#5360): a server closes the connection while reading is paused. Reproduced locally on 7.30.2 and 6.29.1. The fix is only in undici 8, which needs Node 22.19 or newer, and this machine has 22.14.

- Run 1 (2026-11-07) still checked all 179 sources and saved them, but it has no report and no finish time.
- Until this is fixed, a run can crash at any point. The next run picks up whatever was still due.
- Fix: upgrade Node to 22.19 or newer, then `npm install undici@^8.12.4 -w subventii-monitor`, and rerun the crash test.

## Next: move the daily checks to the VPS

1. Fix the undici crash: Node 22.19 or newer and `undici@^8.12.4`, then rerun the crash test.
2. Add `scripts/daily.sh`: same as `daily.cmd`, with one retry, and it won't start while a run is going.
3. Run it with cron at 07:00 Romania time, with the time zone set explicitly.
4. On the VPS, set `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `CONTACT_EMAIL` in `subventii-monitor/.env`, and rotate the logs.
5. Run it by hand first and compare read and blocked sources with the last Windows run. Government sites may treat a data-centre IP differently.
6. After one good run, turn off the Windows task "Subventii Monitor". The two must never run together.
7. Move useful logs and reports, then update `docs/12-deploy.md`.
8. Show the last successful run from `runs`, and warn in the log when it's over 26 hours old.

# The app

## Overview

The app is `web/`: a Next.js static export whose pages are React components (`web/components/pages`, with their data in `web/lib/cc`; only the landing page still runs from `web/legacy`), offline-first, on the real API (`apps/api`) and the shared logic (`packages/shared`). `farm-app` and `apps/web` were removed on 2026-11-08. The farmer's app needs an account; Ion's farm, the example, is at `/ferma-lui-ion/[page]` with no API calls.

Run it with `npm run dev` (web on :5173, API on :3001). Build it with `npm run build`.

**Live (since 2026-11-08):** https://cropcash.netlify.app (uploaded from a laptop, not built from GitHub) and https://cropcash-api.andreitutea.com (VPS, pm2 + Caddy). Order for a new version: `npm run db:migrate`, then the API on the VPS, then Netlify (`docs/12-deploy.md`). The phone app (`mobile/`, Expo) opens the live site in a WebView; it runs in Expo Go, no installable build yet (`docs/14-mobile-expo.md`).

**Phone navigation (2026-11-08):** four tabs at the bottom (Acasă, Subvenții, Recolte, Salariu) and "Mai mult" for the rest (Calendar, Prognoză, Harta, Pensie, Oameni, Arendă for arendași, Rapoarte). The harvest year picker was removed from the frame; the year shows in page titles. The sign-in page is a plain centred card with a sign-in / new account switch.

## Plan steps (`docs/10-plan.md`)

| Step | State |
| --- | --- |
| 1, 1b Setup and login | Done |
| 2 Subsidy engine and data | Done |
| 3 Onboarding | Done |
| 4 Calendar | Done |
| 5 Salary smoothing | Done |
| 6 Stripe: Connect, payouts, subscription, webhooks, Test Clocks | Done |
| 7 Risk fund and pension | Done. The risk fund was removed on 2026-11-07; the pension stays |
| 8, 8b, 8c, 8d Forecast, weather, seasons, farmers' own sources | Done |
| 9 Demo polish | Done (2026-11-08): `demo:rehearse` passed 3 times, pitch figures updated, deployed |
| 9b Offline and install | Done (2026-11-08): offline from W9, plus a web manifest and icons in `web/public`. Not tried on a real phone yet |
| 9c, 9d Assistant and its confirm cards | Done (2026-11-08). Model `claude-sonnet-5-5`, conversation kept in the browser, at most 5 questions a farmer a day (`ASSISTANT_DAILY_LIMIT`). `npm run test:assistant`: 20 real questions, 20/20 |
| 9e Voice | Dropped (2026-11-08) |
| 9f Notifications | Messages inside the app only. Nothing pushes to the phone |
| 10 Extras | 10a diesel: in the PDF reports (`docs/04-farmer-reports.md`). 10b APIA papers: done (W11). 10c funding radar: not started |
| 11 Use-case gaps | Not started |
| 12–14 Idempotency (`docs/idempotency-plan.md`) | Done |
| 15 Errors and weak network (`docs/failure-handling-plan.md`) | Done |
| 16 Bad and good years from INS, per county | Done |

Built since 2026-11-09, each with its own plan and status: calendar events (`docs/calendar-events-plan.md`), fertilizers (`docs/fertilizers-plan.md`), crop losses (`docs/crop-loss-plan.md`), per-hectare and total figures (`docs/per-ha-total-plan.md`), the APIA crop catalogue (`docs/crops-catalog-plan.md`), the map and parcels (`docs/harta-plan.md`), PDF reports and farm members (`docs/rapoarte-pdf-plan.md`), the admin panel (`docs/admin-panel-plan.md`), employees and arendă (`docs/employees-arenda-plan.md`, `docs/15-arenda.md`). Migrations go up to 052. The excise schemes (`docs/accize-plan.md`, 2026-11-20): a catalogue in `docs/data/excise-schemes.json`, the farm's answer in `farm_excise_schemes` (052, **not applied yet**: apply it before deploying the API, which reads it with the farm), the diesel refund on noted litres in the plan, the „Accize” card on /subventii, and the daily check. Not built: marking a refund quarter as received.

## Functions (`docs/functions.md`)

Every button and every future AI tool goes through one registry in `packages/shared`. `POST /api/functions/:name` runs it on the server.

- **F1–F3, F10: done.** The registry, one plan calculation (`buildFarmPlan`), the `explain_*` and `what_if_*` functions, the pension simulation, and exchange rates with the currency toggle.
- **F4: built.** Sales, expenses, tasks and `update_farm`. The Supabase tests (`npm run test:integration`) passed 23/23 on 2026-11-08.
- **F5: built.** The Stripe functions. Live webhooks delivered on both Stripe destinations on 2026-11-08.
- **F6: built.** Opportunities and sources. Needs `npm run documents -w subventii-monitor` to fill the document search.
- **F7, F8: done** (steps 9c, 9d): the assistant on the registry, with confirm cards. **F11 voice: dropped.** **F9, F12, F13: not started** apart from the diesel report in the PDF reports.

## Wiring farm-app to live data (`docs/farm-app-wiring.md`): all done

| Step | What it gave |
| --- | --- |
| W1 Foundation | `farm-app/live/`, `config.js`, one esbuild script for `engine.js` and `live.js` |
| W2a Login | `login.html`: sign-in, sign-up, email link, sign-out. Signing in stays optional |
| W2b The real farm | Every page reads `/api/me`, and the demo clock moves every page |
| W3 One plan | Phone and server compute the same plan and salary |
| W4 Harvests | Saved on the server (migration 014) |
| W5 Everyday writes | Onboarding, sales, expenses and tasks go to the API |
| W6 Acasă | Rebuilt in Romanian on the real plan, with Recharts kept locally |
| W7 Money | "Contul tău": Stripe setup, "Bine așa", salaries paid, currency, demo panel, weather. No credit card, by the user's choice |
| W8 Opportunities and sources | Live from the monitor tables when signed in, follows saved on the farm. Snapshot files only for signed-out visitors |
| W9 Offline | Service worker caches every page. Sales, expenses and ticked tasks queue without internet. Money actions turn off with a reason and are never queued |
| W10 Switch over | `npm run dev` and `npm run build` are farm-app. Sample data and `mock.js` deleted. All 13 pages checked signed in and out |
| W11 Papers | Photo of an invoice, an APIA application or a payment decision fills the form (Claude + Zod). Migration 016 |
| W12 Pension page | `pensie.html`: the amount at 65, salary effect, start, change and stop, fund list, growth chart |

## Pitch

The figures in `docs/09-demo-pitch.md` match the app as of 2026-11-08 (`demo:rehearse` 3 times without errors): advance 12.649 lei, salary 1.050 lei, 2.950 with a 15.100 lei credit, 2.700 paid once the 200 lei pension starts, 2.450 in May. Rerun `demo:rehearse` after the changes since, then `seed:demo`.

## Still to run, by the user

These write to the real Supabase or Stripe:

- `npm run db:migrate` before each API deploy (it applies only what's missing; up to 034 now).
- `npm run test:integration` and `npm run test:stripe` after migrations.
- `npm run demo:rehearse`, then `npm run seed:demo` to reset Ion's account before the pitch.
- `npm run documents -w subventii-monitor`.
- A test on a real phone: sign in, "Întreabă", install, airplane mode.

## Known limits

- **Netlify isn't linked to GitHub** (the repo is private and owned by a teammate), so a push doesn't update the site: it is built and uploaded from a laptop (`docs/12-deploy.md`).
- **Unit tests don't open the pages,** so page checks are manual until there's an automated smoke test.
- **The language test** (`web/lib/language.test.ts`) checks the banned words in `web/` line by line. It doesn't check the assistant's replies, which come from the model.
- **Without the year picker,** a farm with several harvest years can only move forward (the button on a finished year); going back to an older year has no button.
- **`npm ci` on the VPS reports one critical vulnerability** in a dependency (2026-11-16); not looked into yet.

Tests: 1,187 passing across the app on 2026-11-08 (more since; run `npm test`), plus 199 in the monitor.

## Weather: built (2026-11-07)

Plan step 8b. The Culturi tab shows a 7-day forecast for the farm's county from Open-Meteo, on both layouts.

- **API:** `GET /api/weather` takes the county from the farm and caches each county for 3 hours, so at most 336 calls a day. If Open-Meteo fails, it serves the last copy.
- **Alerts:** frost at 0 °C or below, which is a product assumption. The spraying wind alert stays off until `spray_wind_max_kmh` in `plan-params.json` has a source.
- **Offline:** the phone keeps the last forecast in `localStorage`, shows only the days left, and clears it on sign-out. It stayed in `localStorage` after W9, like the other copies.
- **Coordinates:** 42 county seats in `docs/data/counties.json`, from Open-Meteo's geocoder and checked by county.
- **Licence:** the free API suits the hackathon, but apps with subscriptions count as commercial, so launch needs a paid plan or self-hosting. Notes are in `open-meteo-vps-setup.md`, untried.

**Proven by:** unit tests with fake responses. Live against Open-Meteo: real forecasts for Teleorman and Cluj through the real cache, and the real card rendered at 360 px. Since W7 the forecast is on Acasă for signed-in farmers. It was checked in the browser against a stubbed forecast, not yet with a real account.

`get_weather` isn't in the registry, because the registry only runs phone calculations. The AI can't call it yet.

## Seasons and the 1–10 year forecast: built (HTML only)

The farmer enters what was gathered and what's in the ground, and Prognoză shows what comes in over 1–10 years for An slab, normal and bun. React isn't ported.

- **Seasons:** `sowing_month` per crop gives its growing time: wheat 9 months, maize 6, sunflower 5. What was gathered and what's sown are saved separately in `cropcash-harvests` (`state.gathered`, `plantedMonth` on each parcel).
- **Effect on figures:** the farmer's yield and price replace the averages on every page. A late sowing moves that crop's first sale. Grain in the barn counts as one sale in the plan's first month.
- **Fix:** APIA payments stopped after 3 campaigns in `occurrences()`, which took Ion's normal year from 102.091 to 85.225 lei from year 4.
- **Offline:** everything runs in the browser. The chart falls back to plain SVG without Recharts.
- **Assumptions:** P21 (widened), P26, P27, P28.

**Proven by:** unit tests in `seasons.test.ts`, and onboarding to slider driven in a browser at 390 px. Ion's baseline didn't move: 650 lei salary, 102.091 in, 69.000 out, lowest 7.799 lei in May 2027.

**Known gap:** a crop sale noted outside its usual month still doesn't remove the planned sale, unless it comes out of grain in the barn.

## Farmers' own sources and pagination: built (2026-11-07)

`surse.html` shows at most 25 rows a page on all three tabs. A farmer can add any page or PDF with **Adaugă o sursă**.

- **No sign-in:** a random key in the browser owns the list. The database keeps only its SHA-256 hash, and the routes sit before `requireAuth`.
- **Private by separate tables:** `sources` feeds `source_changes` and `documents`, which every farmer sees, so farmers' pages live in `watched_pages` and `farmer_sources`. `anon` and `authenticated` have no access. Runs log page ids, never links.
- **Reading:** `read-page.ts` reads one page and follows no links. Robots rules and the size limit apply. Limits are in `plan-params.json` under `sources` (P29).
- **Server safety:** `guarded-fetch.ts` refuses private addresses when the connection opens and before each request, on every redirect.
- **Daily check:** `runChecks` calls `checkFarmerPages`, which stores the new text and the changes.

**Proven by:** 520 root tests and 199 monitor tests at the time of writing, plus the built API on the real database and real sites. AFIR, APIA and a PDF were read, `localtest.me` was refused, a second key saw nothing, the public key got permission denied, and the daily check ran over 10 pages. The add, repeat, reload and delete flow ran in a browser.

**Not proven:** a real redirect from a public site to a private address. Each hop goes through the guard, but no such site was available to test against. A real page change has only been tested with unit tests.

**Known limits:** rate limits live in memory, so an API restart resets them. PDF and page parsing runs in the API process, inside the 300 MB pm2 limit. The list doesn't move between devices (P30).
