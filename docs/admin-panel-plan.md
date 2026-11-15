# Admin panel: see and control every input of the predictions

**What for:** someone signed in with an admin account (to start, the normal demo account `DEMO_EMAIL`) opens `/admin` and can see every factor behind the forecasts, change it, check the effect on a farm before it goes live, publish it, and go back to the file values.

Status: all 8 steps done (2026-11-14/15). Rehearse again with `npm run admin:rehearse`. Written 2026-11-14 from the code and `docs/forecast-sources.md`.

## What already exists and shapes this

| Fact | Where | What it means for the panel |
|---|---|---|
| Every money forecast comes from one pure function, `buildFarmPlan(farm, data: AppData, opts)` | `packages/shared/src/cashflow/farm-plan.ts` | Changing a factor means handing it a different `AppData`. The forecast code doesn't change. |
| `AppData` is built once from `docs/data/*.json` by `loadData()`, checked with Zod, and cached | `packages/shared/src/data/index.ts` | The changes are a layer on top of the files: `effective = applyOverrides(loadData(), overrides)`. |
| The web app bundles the same JSON at build time and works offline | `web/lib/cc/react.tsx:23` (`data: loadData()`) | The phone needs the published changes cached locally, or it shows old figures offline. |
| The API calls `loadData()` once at boot and gives it to MoneyService (Stripe salary), the assistant, weather and documents | `apps/api/src/server.ts:27`, `stripe/money.ts:65` | The API needs a changeable data source so it can see a new version without a restart. |
| An editor list by email already exists, and its own comment says "An admin panel with roles replaces this" | `CATALOGUE_EDITORS` in `apps/api/src/env.ts:56`, `routes/fertilizers.ts` | Reuse the same pattern for admins, then switch the fertilizer gate over to it. |
| Each figure in the data files has a `status` (`confirmat-2026`, `din-2025`, `presupunere`, `DE-VERIFICAT`) and a `note` | `data/schemas.ts` (`StatusSchema`) | A changed value is labelled too, so the "how firm is this" labels stay honest. |
| A few factors were hard-coded instead of being data | horizons, the day of the month, the APIA window day, the kind-of-year table | Moved into `plan-params.json` → `forecast` (step 1, done). |

## Decisions (recommended, to confirm)

1. **What a change affects: everyone, after an explicit publish.** The admin edits a **draft**, sees its effect on a farm (preview), and then **publishes** it. A published version applies to every signed-in farm, both web and API. Admins can't edit a single farmer's own inputs (hectares, balance, recorded money), only read them for the preview.
   - Alternative: the change applies only to the admin's own farm (a sandbox). That's safer, but it can't fix a wrong figure for everyone.
2. **Ion's farm without an account (`/ferma-lui-ion`) stays on the file values.** It never calls the API (CLAUDE.md, `docs/13`), so the pitch always shows the same figures. The admin preview can still show Ion's farm with the draft, on the client.
3. **The data files stay the base.** A change is stored as a JSON path, a new value, a status (`admin`, a new label meaning "set by an admin") and a required reason or source. "Reset" deletes the change and the file value comes back. That keeps the "figures come from `docs/data`" rule true: the panel only records departures from it, each one with its reason.
   - **This differs from `docs/07-architecture.md` (figures only from JSON), so per CLAUDE.md it needs a yes before building.**
4. **Admin = an email on a list** (`ADMIN_EMAILS`, which falls back to `DEMO_EMAIL`, as `CATALOGUE_EDITORS` does today). It's checked on the server, from the Supabase token. Roles in the database come later, if they're ever needed.
5. **The money paths read the published version at the moment they run.** The salary MoneyService pays through Stripe (test mode) uses the same figures the farmer sees. A publish doesn't move money by itself: the next salary simply comes from the new plan.

## The factors the panel shows

Grouped as in `docs/forecast-sources.md`. ✎ = editable, 👁 = read-only (it's the farmer's, or it's a law/date that comes from a source).

| Group | Factors | File / code | |
|---|---|---|---|
| **Crops** | cost per ha min/mean/max, yield t/ha min/mean/max, price lei/kg min/mean/max, month of sale, cost shares per month | `crops-reference.json` → `crops[]` | ✎ |
| **County yields (INS)** | 15-year history per county and crop; how many years count; the size of the "worst/best" group (3); normal = median | `crops-reference.json` → `county_history`, `county-yields.ts` | history 👁, rules ✎ |
| **Subsidies** | rate in €/ha per scheme, `advance_pct`, eligibility thresholds, `parcel_min_ha`, fixed EUR rate, ratio history (low/high), `fallback_scheme` | `subsidies-2026.json`, `subsidies-history.json` | ✎ |
| **APIA dates** | advance and balance windows; which day the plan uses (last / middle) | `calendar-2026.json`, `plannedForMonth` | windows 👁, day choice ✎ |
| **Kind of year** | what bad/normal/good means for yield, price, cost and APIA (the table in §6) | `farm-plan.ts` / `timeline.ts` → new `scenarios` in `plan-params.json` | ✎ |
| **Horizons** | 12-month plan, 24 months after a bad harvest, `long_forecast.max_years`, `PROJECTION_YEARS` | `plan-params.json` (after step 1) | ✎ |
| **Salary** | rounded to 50 lei, kind of year it's built on (normal), steady-salary rules | `salary_round_lei`, `smoothing.ts` | ✎ |
| **Credit** | limit 90% of subsidy, rounding to 100 lei, ROBOR + margins (the interest that's missing today), first month | `credit.*` in `plan-params.json` | ✎ |
| **Pension** | target age, returns 2/4/6%, `payout_years`, rounding, slider | `pension.*` | ✎ |
| **Calendar / events** | `carry_days`, `whole_harvest_window_months`, reminders | `farmer_events.*`, `calendar_reminder_*` | ✎ |
| **Weather** | frost threshold, wind (off) | `weather.frost_min_c` | ✎ (alerts only, not money) |
| **The farm (preview)** | crops, ha, balance, recorded money, harvests, APIA decision | farm in Supabase | 👁 |

Not in the panel: network, AI and outbox timeouts and limits (`network`, `documents`, `sources`). They don't touch the predictions. They can be added later as an "Operations" tab.

## Architecture

```
docs/data/*.json ──loadData()──► base AppData
                                    │
prediction_overrides (Supabase) ──► applyOverrides(base, published) ──► effective AppData
                                    │                                 ├─► web: buildFarmPlan (cached locally)
                                    │                                 └─► API: MoneyService, assistant, weather
admin draft (client only) ─────────► applyOverrides(effective, draft) ──► preview side by side
```

### Shared (pure, with tests) — built in step 2
- `data/files.ts`: `RAW_FILES` (docs/data as written) + `buildData(raw)` (Zod, crop expansion, catalogue). `loadData()` = cached `buildData(RAW_FILES)`.
- `data/factors.ts` → `EDITABLE_FACTORS`: pattern, group, Romanian label, and type (`number` with unit/decimals/min/max/nullable, `boolean`, `choice`, `key`). Values stay in the file's own unit (lei/kg, €/ha), so a change reads like the line it replaces. Anything not listed can't be changed.
- `data/overrides.ts`:
  - `OverrideSchema` = `{ path, value, reason }`. A path looks like `crops.crops[id=grau].price_lei_per_kg.mean`, and `[k=v,k2=v2]` picks the one item with those fields, never by position. The "admin" label comes from the override row itself; the files' `status` values aren't touched.
  - `applyOverrides(overrides, raw = RAW_FILES)` patches a copy of the files and runs the checks:
    - the path exists and picks exactly one item;
    - the path is editable;
    - the value has the right type, range and decimals;
    - the cross-checks pass: min ≤ mean ≤ max, cost shares add up to 100, the pension growth rates are ordered, and the yield history windows make sense;
    - the whole data still builds with `buildData`.

    It throws `OverrideError` with a code. No changes = `loadData()` itself.
  - `applyValidOverrides`: applies the ones that still work and reports the rest (for the API at boot).
  - `listFactors(raw)`: every editable figure with its current value (for the panel).
- `cashflow/plan-diff.ts` → `planSummary` / `diffPlans(farm, before, after)`. The summary covers:
  - the salary paid and the safe salary, with the month that sets it;
  - the lowest point;
  - the **balance at the end of the plan**, needed because a price change for Ion moves nothing before the harvest;
  - the subsidy low–probable–high;
  - the suggested credit;
  - the salary after a bad harvest;
  - the pension at the target age.

### Database (`supabase/migrations/025_prediction_overrides.sql`)
Built in step 3.
- `prediction_versions (version int pk, published_at, published_by, note, reverted_from)`: the highest version is in force; no rows = the files as written.
- `prediction_overrides (version, path, value jsonb, reason)`, pk `(version, path)`.
  - Each version holds its **whole set** of changes (a snapshot), so reading the current state is a single query.
  - "Going back" publishes a copy of an older set as a new version, with `reverted_from` set. History is never rewritten.
  - `value` may only be a number, text, yes/no or null.
  - `reason` needs at least 3 characters.
- `publish_prediction_version(p_base, p_note, p_overrides, p_by, p_reverted_from)` (service role only) writes all or nothing, under a lock. If someone published since `p_base`, it raises `CC409` and nothing is written. The same path twice breaks the primary key, so nothing is written either.
- RLS: signed-in users **read** (both tables); `anon` gets nothing; only the service role writes.
- Store: `apps/api/src/db/predictions.ts` → `current()`, `version(n)`, `history(limit)`, `publish(...)`. `StaleVersion` is thrown on `CC409`. Rows are re-checked with `OverrideSchema` when read.

### API (`apps/api/src/routes/admin.ts` + `middleware/admin.ts`)
Built in step 4.
- `requireAdmin(emails)`: after `requireAuth`, checks `auth.email` against `ADMIN_EMAILS` (falls back to `DEMO_EMAIL`, case-insensitive), else 403 `not_an_admin`.
- `GET /api/prediction-data`: everyone signed in. `{ version, overrides, admin }`, served from memory, with an ETag and a 304 answer. `admin` lets the web show the menu link without another call.
- `GET /api/admin/factors`: admin. Each figure comes with:
  - its path, group, label and type (unit, decimals, limits or choices);
  - `fileValue`, `value` (the one in force) and `reason`.

  The response also has the group names and the published changes left out because they no longer apply (`rejected`).
- `GET /api/admin/versions` (the last 50, with how many changes each) and `GET /api/admin/versions/:n` (one version, with its changes).
- `POST /api/admin/publish`: admin, `{ baseVersion, note, overrides }`, where `overrides` is the whole set (empty = back to the files). Paths are normalized, then the set is checked with `applyOverrides`.
  - 400 `invalid_override` with `code`/`path` publishes nothing.
  - 409 `stale_version` carries `{ current, sameAsYours }`. `sameAsYours` tells a retried tap (its set is already in force, so it's done) from a real clash. This replaces a replay cache.
- `POST /api/admin/revert/:version`: admin, `{ baseVersion, note? }`. It publishes a copy of that version's set; 404 if there's no such version.
- `predictions/source.ts`:
  - `createDataSource({ store })` holds the data in force. It reads the published version at boot, before `listen`, then after each publish and every `PREDICTIONS_REFRESH_S` (default 300 s) for other processes. It keeps the last good version if Supabase is down. Changes that no longer apply are left out and logged (`applyValidOverrides`).
  - `liveData(source)` is a read-only `AppData` proxy that reads the current version on every field access. `server.ts` passes it as `data`, so every router, `MoneyService` (the Stripe salary), the assistant and documents see a publish at once, with no router rewritten. Safe because nothing keeps `AppData` by identity.
- `fertilizers.ts`: the editors are `ADMIN_EMAILS ∪ CATALOGUE_EDITORS` (step 7).

### Web
- **Effective data in the store** (built in step 5): `web/lib/cc/predictions.ts` + `store.ts`.
  - The copy lives under `KEYS.predictions` = `cropcash-prediction-data`, a signed-in-only key, so sign-out clears it with the rest. It holds `{ version, overrides, admin, at }`.
  - `reload()` builds the farm from `withPredictions(docs/data, copy)`. That is `applyValidOverrides`, which tries the whole set in one build and leaves out changes this build doesn't know. The result is kept until the version on the phone changes, which also picks up another tab's newer copy.
  - `refreshPredictions()` runs at start, when the internet comes back and on `phoneBack`. It reads `/api/prediction-data` (checked with the shared `PredictionDataSchema`) and saves and reloads only when the version or the admin flag changed.
  - **Offline:** the copy on the phone. With none, the file values. A failed read or an answer of the wrong shape keeps the copy.
  - `StoreState.predictions = { version, admin, overrides }` (`usePredictions()`), for the menu link and the panel (step 6).
- `/ferma-lui-ion/*` (mode `demo`) never calls `/api/prediction-data` and never reads the copy, even on a signed-in phone (decision 2).
- **The `/admin` page** (built in step 6; the as-built notes are under step 6 below. Original spec: a new screen: in `SCREENS`, a skeleton in `skeleton/screens.tsx`, a link through `appHref`, the Guard asks for an account **and** `isAdmin` from `/api/admin/factors`). The menu shows "Admin" only to an admin.
  - Left: the groups from the table above, with search. Each factor: file value, current value, an `admin` badge if it's changed, status, reason.
  - Editing: fields with units in lei/kg/%/months. Values are integers in bani where it's money. A reason is required.
  - Right, **preview**: pick "My farm" / "Ion's farm". It shows the plan with the published version and with the draft (`buildFarmPlan` on the client, nothing saved): the monthly salary, the lowest point and its month, subsidy low–high, pension at 65, and the 12-month chart overlaid (`FarmChart`).
  - Bottom: "Publish" (`NetButton reason="Publicarea cere internet"`), "Discard draft", the version history with "Go back to this one".
  - The draft is kept on the phone (localStorage) until it's published, so it survives offline. **Publishing is never queued offline.**
- Texts in plain Romanian, without forbidden words (e.g. "Ce schimbi" ("What you change"), "Cum arată salariul lui Ion" ("What Ion's salary looks like"), "Înapoi la cifra din sursă" ("Back to the source figure")).

## Steps (each with `npm test` passing, ticked here)

1. [x] **Hard-coded factors into data.** Moved into `plan-params.json` → `forecast` (+ schema): `plan_months` (was `PLAN_HORIZON_MONTHS`), `after_bad_harvest_months` (was `AFTER_BAD_HARVEST_MONTHS`), `projection_years` (was `PROJECTION_YEARS`), `entry_day` (was `MID_MONTH_DAY` in `timeline.ts`), `apia_day.plan` / `apia_day.demo_clock` (the `'late'` / `'mid'` literals) and `years` (the kind-of-year table: the min/mean/max end each of bad/normal/good takes for yield, price, cost and the APIA balance). The worst/best group size was already data (`yield_history.extreme_years`); the median stays a method, not a figure. `cropEconomics` keeps mean figures (`cropSaleValue` / `cropCostValue`). Checked: the plan, long forecast, "An slab", demo-clock month and demo incomes for three farms are byte-identical before and after; `forecast-params.test.ts` shows each setting takes effect.
2. [x] **`applyOverrides` + `EDITABLE_FACTORS` + `diffPlans`** in shared, with tests (`data/overrides.test.ts`, `cashflow/plan-diff.test.ts`). They cover:
   - a path picked by id, including after the file is reordered;
   - every error code;
   - every listed value of the file passing as-is;
   - an empty set returning `loadData()`;
   - money staying whole bani;
   - `docs/data` never being changed.

   The forecasts are still byte-identical after the `loadData` split. Found on the way: the pension is set twice in `plan-params.json`. The screens read `pension.*`, the assistant reads `pension_target_age` / `pension_return_pct`. Both pairs are listed, labelled "(ecrane)" ("screens") / "(asistent)" ("assistant"). Merging them into one is a follow-up.
3. [x] **Migration 025** + repo + RLS integration tests. Applied to Supabase on 2026-11-14 (`npm run db:migrate`, only 025 was pending).
   - `tests/integration/predictions.test.ts`: 9 tests. They cover publish and read-back, a stale base, a bad set writing nothing, going back by copy, and an empty version. On the RLS side: a farmer reads but can't insert, update, delete or publish, and anon reads nothing. The test publishes the files' own values and deletes its versions afterwards (checked: 0 rows left).
   - `apps/api/src/predictions-store.test.ts` tests the row mapping.
4. [x] **API:** `requireAdmin`, the routes, `createDataSource` + `liveData`, everything reads the current data. `apps/api/src/admin.test.ts` has 13 tests. They cover:
   - 401 without a session, 403 for a farmer on every admin route;
   - the ETag/304 answer;
   - the factors list;
   - a publish lowering the salary `get_plan` computes, and an empty set bringing it back;
   - 400 with the code;
   - 409 with `sameAsYours`;
   - the version list and revert;
   - the source keeping the last good version and leaving out stale changes;
   - `liveData` spreading and enumerating.

   The built API boots against Supabase (`dist/server.js`). `.env.example` has `ADMIN_EMAILS` and `PREDICTIONS_REFRESH_S`. **Until step 5, the phone still computes from the files**, so after a publish the Stripe salary and the screens would disagree.
5. [x] **Web store:** fetch + cache + offline fallback; Ion's farm untouched. `web/lib/cc/predictions.test.ts` has 11 tests. They cover:
   - read at start and saved;
   - **the phone's salary equals the API's with the same version**;
   - offline from the copy, and the files with no copy;
   - a failed read keeping the copy;
   - recomputing only on a new version;
   - reading again when the internet comes back;
   - a bad answer ignored, an unknown change left out, a damaged copy counting as none;
   - Ion's farm never reading and staying on the files.

   Web typechecks and `npm run build:web` passes. Pages already read every figure from `farm.farmData`. The only static `plan-params.json` imports are network timeouts, which aren't editable.
6. [x] **`/admin` page:** groups, editing, preview, publish/history. Skeleton + `markReady`.
   - **Files:**
     - `web/lib/cc/admin.ts`: the pure logic. It covers the rows (`factorRows`, with `whereOf` naming the crop, scheme, month or year), `parseValue` (comma or point; decimals, limits, empty = null where allowed), the draft (`draftSet` = the whole set, `draftChanges`), `checkSet` (`applyOverrides`, with the errors in Romanian), `publishErrorText`, and `summaryOf` = `planSummary` on a `FarmState`.
     - `web/components/pages/Admin.tsx` + `styles/admin.css`, `screens/admin.tsx`, `app/admin/page.tsx`, a skeleton.
   - **Wiring:**
     - `ScreenName` is `DEMO_PAGES | 'admin'`, so there is no `/ferma-lui-ion/admin`.
     - `/admin` is in `WHOLE_FARM_PAGES` and `REACT_PAGES`, and is cached offline by `sw.js`.
     - The link "Administrare" (icon `tool`) shows in the rail and in "Mai mult" only when signed in and `predictions.admin`.
   - **Who sees it:** decided by `predictions.admin` from `/api/prediction-data` (remembered offline), not by a separate `/api/admin/factors` call. Anyone else gets a short card. The API still checks every admin call.
   - **The figures are listed on the phone:** with `listFactors()` and the published set, so the panel works offline. `/api/admin/factors` stays for other clients.
   - **Store:**
     - `publishedData()`.
     - `previewState(data, ion)` rebuilds the farm on other data, saving nothing. Ion is the fresh `demo` farm on an empty `memoryStore`.
     - `adminCall(path, init)` is never queued and fails at once offline.
     - `keyStore`.
     - `ApiError` now keeps the error `body`, for `path`, `current` and `sameAsYours`.
   - **The draft:** `cropcash-admin-draft`, saved on every change, so it survives offline and sign-out clears it. A note says when the draft started from an older version than the one in force. Putting the source figure back drops the change and needs no reason.
   - **Preview:** "Ferma mea" / "Ferma lui Ion", "Acum" vs "Cu ciorna", the `PlanSummary` figures with the changed rows marked. It is the API's calculation (`computeFarmPlan`), so it is what Stripe will pay. **The overlaid 12-month chart was left out**; the table shows the lowest point and the end balance instead.
   - **Publishing:**
     - Publish needs a short note and a reason for each change (`NetButton`).
     - A 409 with `sameAsYours` counts as done. Any other 409 refreshes the figures and keeps the draft.
     - "Înapoi la asta" (revert) and "Înapoi la cifrele din surse" (an empty set) ask `confirm` first.
     - Each version can show its changes.
   - **Tests:**
     - `web/lib/cc/admin.test.ts`: 16 tests.
     - `web/components/pages/Admin.test.tsx`: 7 tests. They cover:
       - a non-admin, an admin with the menu link, and Ion's farm without a link;
       - the reason being required;
       - draft → preview on both farms → publishing the whole set, with the draft cleared;
       - a refused low/mean/high order;
       - offline.
     - `/admin` also runs in `pages.test.tsx`.
7. [x] **Fertilizers onto `ADMIN_EMAILS`**, `.env.example` (`ADMIN_EMAILS=`), `docs/07-architecture.md` (new section), `docs/forecast-sources.md` (new label "Admin" + "a panel change can replace any ✎ value").
   - **Who may add fertilizers:**
     - `env.ts` has `adminEmails(vars)` and `catalogueEditors(vars)`. The fertilizer editors are every admin plus `CATALOGUE_EDITORS`, each once, in lower case.
     - With nothing set, both are `DEMO_EMAIL`, so nothing changes for the demo.
     - `CATALOGUE_EDITORS` now means extra people who may edit the catalogue but not the forecasts.
   - **`.env.example`:** comments updated (`ADMIN_EMAILS=` was already added in step 4).
   - **Docs:**
     - `docs/07-architecture.md` §12 "Panoul de administrare" covers what can change, the exception to "figures only from `docs/data`", who sees which version, who is an admin, and offline.
     - `docs/forecast-sources.md` has the label "Admin" and a paragraph on what a panel change may replace (and that the horizons now live in `plan-params.json` → `forecast`).
   - **Tests:** `apps/api/src/env-editors.test.ts` has 3 tests. `fertilizers.test.ts` is unchanged and passes.
8. [x] **Rehearsal:** `npm run seed:demo`; as the demo account, change wheat's price, check the preview, publish, see Salariu/Prognoză change; go back a version; `/ferma-lui-ion` stays the same throughout. Done 2026-11-15 against the real Supabase.
   - **Script, `npm run admin:rehearse` (`scripts/rehearse-admin.ts`, ~30 s).** It runs `seed:demo`, then calls the API's routes as `DEMO_EMAIL`:
     - wheat's price 1,05 → 1,15 lei/kg: the end of the plan goes 45.686 → 49.133 lei; the salary stays 1.050 lei, and the phone's calculation gives the same salary as the server's;
     - wheat's cost → 5.000 lei/ha: the salary drops 1.050 → 750 lei;
     - a publish from an older version gets 409;
     - "go back" restores the figures, and the history marks it;
     - at the end, the starting set is in force again.

     Its notes start with "Repetiție:". It made versions 1–6.
   - **Browser (gstack `/browse`, demo account):**
     - "Administrare" in the rail;
     - wheat's price into the draft; the draft survives a reload;
     - the preview on my farm (45.686 → 49.133 lei) and on Ion's (25.186 → 28.633 lei), matching the script;
     - published from the UI as version 7: Salariu says "În iulie 2027 intră 39.634 lei din grâu" (36.187 before);
     - `/ferma-lui-ion/salariu` stays at 36.187 lei, with no admin link and no call to `/api/prediction-data`;
     - "Înapoi la asta" on version 6, which became version 8: back to 36.187.

     **Now in force: version 8, no changes (the source figures).**
   - **Found along the way:**
     - `seed:demo` needed migrations 026–032 from other work (applied with the user's OK).
     - `.env` `CORS_ORIGINS` allows only `localhost:5173`, so a dev server on another port needs `CORS_ORIGINS` set for that run.
     - The dev API kept restarting under `tsx watch` while other files changed, and one publish was cut off. The page said "Nu ai internet", which was wrong, so `publishErrorText` now tells offline, timeout and an unreachable server apart.
     - CSS fixes: the group cards' padding, and the history buttons stacked under the note.

## Risks

- **Changing a figure changes real (test) payments.** Mitigation: preview + required reason + version history + a publish that takes effect only on the next payday. Stripe stays test-only (`sk_test_`).
- **A phone offline for a long time shows old figures.** That's the same as today with a new build. The panel shows "N phones may still have version X" (optional, later).
- **Paths in a file that gets reorganised.** `applyOverrides` fails loudly on an unknown path. At boot the API logs the published changes that no longer apply and ignores them (it doesn't crash).
- **The demo account is an admin**, so anyone in the pitch who knows its password can change figures. Fine for the hackathon. Before real users: a separate `ADMIN_EMAILS` and `DEMO_EMAIL` no longer an admin.
