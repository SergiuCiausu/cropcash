# App inventory: CropCash web (`web/`, the Next.js app)

The browser-side companion to `docs/app-inventory.md` (the shared inventory, written by the idempotency planner, covers the API and DB). The IDs here are the ones `docs/failure-handling-plan.md` cites; they are local to this file.

Sources: `CLAUDE.md`, `docs/07-architecture.md` §8–§11, `docs/12-deploy.md`, code in `web/` (`lib/live/*`, `lib/boot.ts`, `lib/cc/storage.ts`, `legacy/*.js`, `components/*`, `scripts/write-sw.mjs`), and `apps/api/src/routes/money.ts` for the server-side guards. · Last updated: 2026-11-08 by failure-handling-planner

## Summary
CropCash turns APIA subsidies and harvest money for small farms into a monthly salary and a pension. `web/` is a statically exported Next.js PWA (Netlify) whose pages are ported legacy scripts driven by `web/legacy/app.js`. It reads and writes through the Express API on the VPS (`apps/api`), signs in with Supabase Auth, and keeps a copy of the farm plus an outbox in `localStorage` so it opens and partly works offline. Money moves (Stripe test mode) go through the API and are never queued.

## Data stores
| ID | Store | Kind | Holds | Status | Source |
| --- | --- | --- | --- | --- | --- |
| DS-1 | Supabase Postgres (via API) | primary DB | farm, transactions, tasks, harvests, pension plans, envelopes, monitor tables | Built | 07-architecture.md §8 |
| DS-2 | `localStorage` `cropcash-me` / `-me-at` | client cache | last `/api/me` and when it was fetched | Built | legacy/app.js:35, lib/cc/storage.ts |
| DS-3 | `localStorage` `cropcash-outbox` / `-outbox-refused` | client queue | unsent sales, expenses, task ticks; items the server refused | Built | legacy/app.js:78, lib/live/outbox.ts |
| DS-4 | `localStorage` `cropcash-monitor`, weather, rates | client cache | funding calls/sources (1 h fresh), weather, FX rates | Built | legacy/app.js:375, acasa.js, bani.js |
| DS-5 | `localStorage` `cropcash-farm`, `-harvests`, `-pension`, `-follows`, `-done` | local-only farm | signed-out farm and its choices | Built | legacy/app.js:14–16 |
| DS-6 | `localStorage` `sb-*-auth-token` | session | Supabase session + refresh token | Built | lib/live/index.ts:37 |
| DS-7 | Service-worker Cache Storage `cropcash-farm-<ver>`, `cropcash-fonts` | asset cache | every exported page, chunk, image; Google Fonts | Built | lib/live/service-worker.mjs, scripts/write-sw.mjs |
| DS-9 | `localStorage` `cropcash-events` (`cropcash-demo-events` on Ion's farm) | local-only farm | the farmer's calendar events when the farm isn't on the server | Built | lib/cc/storage.ts, lib/cc/store.ts |
| DS-10 | `localStorage` `cropcash-plots` | client cache | last `GET /api/plots` (parcels, seasons, work) and when; queued parcel writes are applied on top | Built | lib/cc/farm-plots.ts, components/plots/usePlots.ts |
| DS-11 | Service-worker Cache Storage `cropcash-map-tiles` (≤ `map_tile_cache_max`, 300), `cropcash-map-style` | map cache | OpenFreeMap tiles, letters, icons and the Mapzen relief, cache-first, oldest out first; the style, network-first. Never the MapTiler satellite | Built | lib/live/service-worker.mjs |
| DS-8 | `sessionStorage` | per-tab | assistant conversation, Bani "arrived" events | Built | legacy/assistant.js:26, bani.js:28 |

## Operations (anything that changes state or causes a side effect)
| ID | Operation | Trigger | Writes / side effects | Dependencies | Status | Source |
| --- | --- | --- | --- | --- | --- | --- |
| OP-1 | Sign in / sign up | login form | Supabase session; clears all `cropcash*` keys | DEP-2 | Built | legacy/login.js:45, lib/live/auth.ts:131–149 |
| OP-2 | Sign out | `/login?signout=1` | Supabase sign-out; clears session + all `cropcash*` keys (outbox included) | DEP-2, DEP-7 | Built | lib/live/auth.ts:149 |
| OP-3 | Create/edit farm (onboarding) | onboarding finish | POST `/api/farmers` (409 → `update_farm`), `save_harvests`, `save_apia_decision` | DEP-1 | Built | legacy/onboarding.js:71 |
| OP-4 | Record sale / expense | Recolte form, assistant card | `record_sale` / `add_expense` with `clientId`; queued offline | DEP-1, DEP-7 | Built | legacy/recolte.js:191, app.js:124 |
| OP-5 | Undo record | Recolte "Șterge" | `undo_transaction`, or removes from outbox | DEP-1 | Built | legacy/recolte.js:223 |
| OP-6 | Tick / reopen task | Calendar | `complete_task` / `reopen_task`; queued offline | DEP-1 | Built | legacy/calendar.js:31 |
| OP-7 | Save harvests / plan figures | Recolte, Date plan | `save_harvests` then `update_farm` | DEP-1 | Built | legacy/app.js:486 |
| OP-8 | Save / clear APIA decision | Subvenții | `save_apia_decision`, `clear_apia_decision` | DEP-1 | Built | legacy/subventii.js:60 |
| OP-9 | Read a paper (AI) | Papers dialog | `read_document` (upload + LLM) | DEP-1, DEP-4 | Built | legacy/papers.js:165 |
| OP-10 | Stripe setup | Bani | POST `/api/stripe/setup` (creates customer/account) | DEP-1, DEP-3 | Built | legacy/bani.js:163 |
| OP-11 | Accept envelope split | Bani | `save_envelopes` | DEP-1 | Built | legacy/bani.js:162 |
| OP-12 | Simulate APIA advance (demo) | Bani | `simulate_apia_advance` (Stripe charge in test mode; 409 `already_received`) | DEP-1, DEP-3 | Built | legacy/bani.js:166, routes/money.ts:107 |
| OP-13 | Advance clock (demo) | Bani | `advance_clock` (moves demo time, triggers payouts) | DEP-1, DEP-3 | Built | legacy/bani.js:153 |
| OP-14 | Start / change / stop pension | Pensie | `start_pension` (409 `pension_exists`), `change_pension`, `stop_pension` | DEP-1, DEP-3 | Built | legacy/pensie.js:250–260 |
| OP-15 | Set pension fund | Pensie | `set_pension_fund` | DEP-1 | Built | legacy/pensie.js:237 |
| OP-16 | Follow / unfollow funding call | Oportunități, Calendar | `follow_opportunity` / `unfollow_opportunity`, one call per key | DEP-1 | Built | legacy/app.js:424 |
| OP-17 | Add / remove own source | Surse | POST/DELETE `/api/sources` with `x-source-key` (raw `fetch`) | DEP-1 | Built | legacy/surse.js:52 |
| OP-18 | Assistant question | "Întreabă" sheet | POST `/api/assistant` (LLM) | DEP-1, DEP-4 | Built | legacy/assistant.js:176 |
| OP-20 | Add / change / delete a calendar event | Calendar „Adaugă”, „Schimbă”, „Șterge”; Recolte „Adaugă în calendar”; Prognoză driver row; assistant card | `add_event`, `update_event` (scope „Toate” / „De acum înainte”), `delete_event`, `set_occurrence` („Doar în ziua asta”, tick, „Nu mai e cazul”); queued offline; event id = client id | DEP-1, DEP-7 | Built | components/app/EventSheet.tsx, EventActions.tsx |
| OP-21 | „Ai plătit?” → „Da” | Calendar, Acasă „Din calendarul tău” | `confirm_occurrence`: records the expense or sale once (idempotent on the date's `transaction_id`); queued offline | DEP-1, DEP-7 | Built | components/app/EventActions.tsx, routes/events.ts |
| OP-22 | Parcel work from the calendar | Calendar „Adaugă” → „Parcelă” | `add_operation` with `clientId`; queued offline (parcels from DS-10) | DEP-1, DEP-7 | Built | components/app/EventSheet.tsx |
| OP-23 | Parcel work and outline from /harta | card „Marchează făcut”, „Adaugă lucrare”, „Desenează pe hartă”; a treatment expense („Notează și lucrarea”) | `add_operation` (with `clientId`, linked to the expense when online), `update_operation` (folded into a still-queued `add_operation`), `update_plot`; all queued offline | DEP-1, DEP-7 | Built | components/pages/Harta.tsx, plots/PlotCard.tsx, plots/TreatmentWork.tsx |
| OP-24 | Parcels from the cerere APIA | /harta „Adaugă parcele din cererea APIA” | OP-9, LPIS lookup through the API, `save_plots`; needs internet | DEP-1, DEP-4, DEP-11 | Built | components/pages/Harta.tsx, plots/PlotsReview.tsx |
| OP-19 | Flush outbox | page load, `online` event | replays OP-4/5/6 in order, then `/api/me` | DEP-1 | Built | legacy/app.js:150 |

## Reads that matter
| ID | Read | Used by | Dependencies | Can be stale? | Source |
| --- | --- | --- | --- | --- | --- |
| RD-1 | `/api/me` | every page (via DS-2), `refreshFarm`, after every write | DEP-1 | Yes, banner after 7 days | legacy/app.js:58 |
| RD-2 | Monitor reads (`search_opportunities`, `list_sources`, …) | Acasă, Oportunități, Surse | DEP-1, DEP-9 | Yes, 1 h cache | legacy/app.js:393 |
| RD-3 | `/api/health` ping | online detection | DEP-1 | n/a | legacy/app.js:104 |
| RD-4 | `/api/weather` | Acasă | DEP-1, DEP-8 | Yes, labelled | legacy/acasa.js:134 |
| RD-5 | `/api/exchange-rates` | Bani, currency display | DEP-1, DEP-8 | Yes | legacy/bani.js:139 |
| RD-6 | `search_documents`, `list_tasks` | Surse, assistant cards | DEP-1 | No | legacy/surse.js:148, assistant.js:128 |
| RD-7 | Page chunks (`import()` in boot) | every page | DEP-5, DEP-10 | Cached by SW | lib/boot.ts:446 |
| RD-8 | `GET /api/plots` | /harta, Acasă reminders, Recolte's parcel picker, calendar form; the mini-map only once opened | DEP-1 | Yes, from DS-10, labelled on /harta | components/plots/usePlots.ts |
| RD-9 | Map base (style, tiles), satellite, APIA bloc overlay | /harta, mini-map, drawing | DEP-12, DEP-13, DEP-11; Google Maps Platform when its key and Map ID are set | Base tiles from DS-11; otherwise a plain background. Google's map is never kept on the phone: offline it is the MapLibre map | components/map/FarmMap.tsx, style.ts; components/map/google/ (FarmMapGoogle, editor-surface, loader) |

## Async work
| ID | Job / consumer / cron | Trigger / schedule | Does | Delivery semantics (if known) | Source |
| --- | --- | --- | --- | --- | --- |
| AS-1 | Outbox flush | page load when signed in; `online` event | sends queued writes in order | at-least-once; `clientId` dedupes sales, expenses and parcel work (`add_operation`); `update_operation`/`update_plot` set fields, so a repeat is harmless | legacy/app.js:150, 718 |
| AS-2 | `refreshFarm` | page load | refetches `/api/me`, reloads on change | best effort | legacy/app.js:58 |
| AS-3 | `refreshMonitor` | page load on monitor pages, >1 h old | refetches monitor reads, reloads on change | best effort | legacy/app.js:393 |
| AS-4 | Ping retry | every 30 s while ping fails and `navigator.onLine` | re-checks `/api/health` | — | legacy/app.js:112 |
| AS-5 | Service worker install/activate | new deploy | precaches all files, deletes old cache | all-or-nothing `addAll` | lib/live/service-worker.mjs:42 |

## External dependencies
| ID | Dependency | Used for | Called from | Criticality guess | Source |
| --- | --- | --- | --- | --- | --- |
| DEP-1 | CropCash API (VPS RareCloud, pm2 + Caddy) | every read/write | all OPs and RDs | Core for writes, Degradable for reads | 12-deploy.md |
| DEP-2 | Supabase Auth | sign in/up, token refresh | OP-1, OP-2, every API call (`getToken`) | Core | lib/live/index.ts:37 |
| DEP-3 | Stripe (test mode, through the API) | pension, advance, payouts, setup | OP-10, 12, 13, 14 | Core for money | 08-stripe.md |
| DEP-4 | Claude API (through the API) | assistant, paper reading | OP-9, OP-18 | Optional | 07-architecture.md §11 |
| DEP-5 | Netlify static hosting | HTML, chunks, images | every page load | Core first visit, then SW | 12-deploy.md |
| DEP-6 | Google Fonts | Geist font | app/layout.tsx:59 | Optional | app/layout.tsx |
| DEP-7 | Browser storage (`localStorage`, Cache Storage) | farm copy, outbox, session | everywhere | Core for offline | lib/cc/storage.ts |
| DEP-8 | Open-Meteo, ECB FX (through the API) | weather, rates | RD-4, RD-5 | Optional | acasa.js, bani.js |
| DEP-9 | Subsidy monitor tables (through the API) | funding calls, sources | RD-2 | Degradable (snapshot fallback) | app.js:372 |
| DEP-10 | JS chunk loading (`import()` in `boot`) | page scripts | every page | Core | lib/boot.ts:385 |
| DEP-11 | APIA LPIS (INSPIRE MapServer) | bloc lookup (through the API), bloc overlay (direct) | OP-24, RD-9 | Optional | docs/harta-plan.md step 0 |
| DEP-12 | OpenFreeMap + Mapzen terrain tiles | cartoon base map | RD-9 | Optional (DS-11, plain background) | components/map/style.ts |
| DEP-13 | MapTiler (key, free tier) | „Satelit” | RD-9 | Optional, `NetButton` | components/map/style.ts |

## Key user flows
| ID | Flow | Steps (operation IDs) | Source |
| --- | --- | --- | --- |
| FL-1 | Sign in and land on the right page | OP-1 → RD-1 → `/acasa` or `/onboarding` | legacy/login.js |
| FL-2 | First farm (onboarding) | OP-3 (3 writes) → RD-1 | legacy/onboarding.js |
| FL-3 | Open any page (online, slow, offline) | DEP-5/SW → RD-7 → DS-2 → AS-1, AS-2, AS-3 | lib/boot.ts, legacy/app.js |
| FL-4 | Note a sale or expense in the field | OP-4 (or queue) → RD-1 → reload; later AS-1 | legacy/recolte.js |
| FL-5 | Tick a task | OP-6 (or queue) | legacy/calendar.js |
| FL-6 | Move money: setup, split, pension, demo advance/clock | OP-10/11/12/13/14/15 → RD-1 | legacy/bani.js, pensie.js |
| FL-7 | Change the plan (Date plan, Recolte) | OP-7 → RD-1 | legacy/date-plan.js |
| FL-8 | Put the real APIA total from a paper | OP-9 → OP-8 → RD-1 | legacy/subventii.js, papers.js |
| FL-9 | Ask the assistant, save a card | OP-18 → OP-4/6 | legacy/assistant.js |
| FL-10 | Follow a funding call | OP-16 → RD-1 | legacy/oportunitati.js |
| FL-11 | Own sources and document search | OP-17, RD-6 | legacy/surse.js |
| FL-12 | Sign out | OP-2 | legacy/login.js |
| FL-13 | Plan something in the calendar, then answer „Ai plătit?” | OP-20 (or queue) → plan recomputed on the phone → OP-21 → RD-1 | components/pages/Calendar.tsx, app/EventNudges.tsx |
| FL-14 | See what moves the salary most and change one's own sum | Prognoză (pure calculation, offline) → OP-20 | components/app/Drivers.tsx |
| FL-15 | Mark a treatment done in the field, without signal | /harta (RD-8 from DS-10) → OP-23 (queued, shown done at once) → AS-1 → RD-8 again | components/pages/Harta.tsx, plots/usePlots.ts |

## Open questions
- Does `deps.money.setup` (OP-10) reuse an existing Stripe customer/account when called twice? (failure-handling, FAIL-03)
- Is `advance_clock` (OP-13) safe to repeat, or does a resend advance time twice? (failure-handling, FAIL-03)
- 07-architecture.md §8 says farm-data changes go through the outbox; the code refuses `save_harvests`/`update_farm` offline. Which is intended? (failure-handling, FAIL-14)

## Changelog
- 2026-11-15 The parcels map (docs/harta-plan.md step 11): DS-10, DS-11, OP-23–24, RD-8–9, DEP-11–13, FL-15; OP-22 is queued offline now.
- 2026-11-14 Added the farmer's calendar events (DS-9, OP-20–22, FL-13–14), docs/calendar-events-plan.md.
- 2026-11-08 Created by failure-handling-planner (scope: `web/` plus the API calls it makes). Kept separate from `docs/app-inventory.md` because the idempotency planner wrote that file at the same time with its own IDs.
