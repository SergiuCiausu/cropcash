# Abstraction Plan: CropCash `web/` (Next.js)

**Date:** 2026-11-08 · **Sources:** `CLAUDE.md`, `docs/web-react-port-plan.md`, `docs/web-nextjs-plan.md`, `docs/13-auth-demo-loading-plan.md`, `docs/07-architecture.md` §8, code in `web/` (`app/`, `components/`, `screens/`, `lib/`, `legacy/`) · **Inventory:** `docs/app-inventory.md`

> **Snapshot warning.** `web/lib/cc/` was being edited while this was written: `Mode` and the demo key rule were unified in `lib/cc/storage.ts:7` and `legacy-contract.test.ts` appeared during the review. Findings below are against the state at the end of the review. Re-check `lib/cc` line numbers before acting.

## Summary

`web/` is mid-migration. It has three layers: (1) legacy page scripts behind `boot.ts` and globals, (2) a JSX shell per screen shared by two routes, and (3) a new React store in `lib/cc` that nothing uses yet. The overall stance should be **mostly specific, with four deliberate seams**: the phone-storage contract, the outbox, the store, and the API/function registry. The register is right in most places. The main problems are:

- **Copies that should be one thing.** Ion's farm is built three times, each with a figure that isn't in `docs/data`. Money formatting is copied three times. There are two ways to connect to the API.
- **Abstractions that mirror the old global.** `farmView` is `window.CC` with types. The palette system has six palettes and no picker.
- **A planned over-build.** `docs/13` B2–B3 calls for eleven hand-made skeletons, and they would be written for `LegacyPage`, which the port deletes.

One finding is a correctness bug in a seam: an outbox item that fails input validation blocks the queue for good (ABS-02).

| Decision | Areas |
| --- | --- |
| Generalize now | ABS-03, ABS-04, ABS-05, ABS-06, ABS-11, ABS-12, ABS-13, ABS-14 |
| Seam | ABS-01, ABS-02, ABS-07, ABS-08 |
| Specific | ABS-15, ABS-20, ABS-21, ABS-22, ABS-23 |
| Defer with trigger | ABS-09, ABS-10, ABS-16, ABS-24 |
| Cut | ABS-17, ABS-18, ABS-19 |

## Expensive-to-change decisions

For a static PWA front end, the expensive things are mostly **data that already sits on farmers' phones**. A deploy can't migrate it.

| Area | Decision | Evidence / assumption | Type |
| --- | --- | --- | --- |
| Phone storage format (`cropcash-*` keys) | One module owns every key and its format. That covers the page-level keys too, not only the store's (ABS-01) | Port plan decision 2: "same keys in the same format" across legacy and React pages. Phones keep this data across deploys | Seam |
| Stored messages (outbox items) | The input is validated against the registry at flush time. An item that no longer validates goes to `refused`; it doesn't block the queue. Input changes are additive only (ABS-02) | Outbox items are written offline and replayed after a later deploy (`lib/live/outbox.ts:10`) | Seam |
| Money | Integer bani everywhere (already so). One formatter module (`lib/cc/format.ts` + `currency.ts`); copies of `group` go away (ABS-03) | CLAUDE.md: "Banii se țin în bani … numere întregi" | Generalize now |
| Time | Keep `farmToday` / `todayInRomania` from `packages/shared` as the only source of "today". Month name lists live in `format.ts` only | Already right in `lib/cc/farm.ts:104`. `legacy/chart.js:9` has its own `MONTHS`/`SHORT`, which go away with the port | Specific (done) |
| Tenancy on the phone (demo vs farm) | `Mode` + `storageKey()` in `lib/paths.ts` is the one rule. Every key goes through it | Two modes are real (`/ferma-lui-ion`, docs/13 §A3) | Generalize now (done in `lib/cc/storage.ts:7`) |
| Provider coupling (Supabase, API) | Supabase auth stays behind `createAuth(AuthClient)` (`lib/live/auth.ts:125`). API calls go only through `createFunctions` + the registry. Stripe never reaches the front end | Already in place | Seam (keep) |
| Identifiers | `clientId` = `crypto.randomUUID()`, outbox ids `outbox:<ms>-<rand>`. Nothing sequential is exposed | `lib/cc/store.ts` `send()` / `queue()` | Specific (done) |
| i18n | Romanian only, strings in pages. No lookup layer | CLAUDE.md; landing decision 6 = Romanian. No second language planned anywhere | Specific, accepted risk |
| Authorization | Server-side (RLS + API). The front end has one guard (docs/13 §A4) | — | Specific |

## Decisions by area

| ID | Area (inventory IDs) | Variation evidence | Cost to change later | Decision | Trigger to revisit |
| --- | --- | --- | --- | --- | --- |
| ABS-01 | Phone storage keys (DS-2) | Real: 2 modes × ~20 keys, legacy + React readers | High (data on phones) | Seam | — |
| ABS-02 | Outbox as stored messages (EN-9, OP-24) | Real: 4 queueable writes | High (stuck queues in the field) | Seam + fix | — |
| ABS-03 | Money / number formatting | Real: 3 copies of `group`, 2 currency paths | Medium | Generalize now | — |
| ABS-04 | Ion's farm builder | Real: 3 builders (`boot.ts`, `lib/cc/farm.ts`, `landing-data.ts`) | Medium (figures drift between landing and app) | Generalize now | — |
| ABS-05 | API connection + config | Real: 2 paths (`live/index.ts` connect, `cc/react.tsx` makeStore) | Low | Generalize now (into one) | — |
| ABS-06 | Screen registry (one body, two routes) | Real: 11 screens × 2 routes | Medium | Generalize now (keep, trim) | — |
| ABS-07 | Store (`lib/cc/store.ts`) | Real: replaces 16 reloads | High (every page reads it) | Seam | — |
| ABS-08 | Function registry as the only way to the API (DEP-1) | Real: ~30 functions, shared Zod with API | High | Seam (keep) | — |
| ABS-09 | `farmView` (`lib/cc/plan.ts:74`) | Mirrors `CC`; ~35 members | Low | Defer | After N5 page 13 |
| ABS-10 | Local vs server writes inside store actions | Real: 2 cases in 5 actions | Low | Defer | A third write target, or a 6th action that branches |
| ABS-11 | `<Sheet>` (`<dialog>`) | Real: `showModal` in 11 files | Low | Generalize now (at port) | — |
| ABS-12 | `<NeedsNet>` | Real: 6 files + a CLAUDE.md rule | Low | Generalize now (at port) | — |
| ABS-13 | Error line (`failText` + `.ob-err`) | Real: 9 files | Low | Generalize now (at port) | — |
| ABS-14 | `<PaperUpload kind>` | Real: 3 kinds | Low | Generalize now (at port) | — |
| ABS-15 | Charts | 3 charts, different data | Low | Specific charts + one shared loader | — |
| ABS-16 | Currency conversion by text rewrite | 1 real need (legacy DOM walk) | Low | Defer | Last legacy page deleted |
| ABS-17 | Per-screen skeletons (docs/13 B2–B3) | 11 hand copies of each bento | — | Cut | — |
| ABS-18 | Palette system (6 palettes, no picker) | None: picker removed, design chosen | — | Cut | — |
| ABS-19 | Dead bridge pieces (`port-legacy.mjs`, `'config'` in scripts) | None | — | Cut | — |
| ABS-20 | Monitor, follows, harvests modules | 1 each | Low | Specific | — |
| ABS-21 | Notifications, Assistant islands | 1 each | Low | Specific | — |
| ABS-22 | Landing page | 1 | Low | Specific | — |
| ABS-23 | `paths.ts` / `AppLink` / `Mode` | Real: 2 modes | Medium | Specific (it is already the right size) | — |
| ABS-24 | Page shell metadata / CSS imports | 4 copies (login, onboarding, landing, `Screen`) | Low | Defer | N4's `(app)/layout.tsx` |

## Details

### ABS-01 · Phone storage keys · Seam

- **Evidence:** port plan decision 2 says "the new `lib/cc` modules read and write the **same keys in the same format** as `app.js`". `lib/cc/storage.ts:1` says "Every key the app saves on the phone, in one place."
- **Gap:** it isn't every key yet. Page-level keys are still declared in the page scripts: `cropcash-assistant` (`legacy/assistant.js:12`), `-arrived`/`-events` (`bani.js:32`), `-paper-ok` (`papers.js:10`), `-pension-compare` (`pensie.js:45`), `-source-key`/`-my-sources` (`surse.js:38`). `lib/live/auth.ts:75` has its own `FARM_COPY = 'cropcash-me'`, and `auth.ts:93` has its own `KeyStore` type.
- **Cost to change later:** High. Renaming a key loses data already on phones, and two declarations of the same key can drift without any error.
- **Decision and shape:** as each page is ported, add its keys to `storage.ts` (`PAGE_KEYS`, through `storageKey`). `auth.ts` imports `KEYS.me` and the `KeyStore` type from `storage.ts`. No versioning layer is needed yet, because formats only gain fields. Extend `legacy-contract.test.ts` with one fixture per added key.
- **In plain words:** every `localStorage` key and its format lives in `lib/cc/storage.ts`. To save something new on the phone, add the key there and use `readJson`/`writeJson`.

### ABS-02 · Outbox items are stored messages · Seam (and a bug)

- **Evidence:** `createFunctions.write` throws `ApiError(0, 'invalid_input')` before any network call (`lib/live/functions.ts:5`). Both flush loops treat only 4xx as "refused" and `break` on anything else: `lib/cc/store.ts` `flushOutbox` (`if (!(status >= 400 && status < 500)) break;`) and `legacy/app.js:166`.
- **Failure:** a queued `record_sale` from an older build whose input no longer matches the schema returns status 0 on every flush. The queue never moves again, and every later sale and expense waits behind it.
- **Decision and shape:** in both flush loops, treat `invalid_input` and `unknown_function` like a 4xx: move the item to `refused`. Rule for the registry: queueable inputs (`QUEUEABLE`, `outbox.ts:10`) change only additively. Add a test: a refused-by-schema item doesn't block the next one.
- **In plain words:** an outbox item is a message written by an older version of the app and read by a newer one. If the newer one can't read it, it sets the item aside and tells the farmer; it never blocks the queue.

### ABS-03 · Money and number formatting · Generalize now

- **Evidence:** `group` is defined in `lib/cc/format.ts:7`, `lib/landing-data.ts:32` and `app/page.tsx:13`. `legacy/chart.js:13` defines its own `lei`.
- **Decision and shape:** `landing-data.ts` and `app/page.tsx` import from `lib/cc/format.ts` (it's pure and safe in Server Components). Legacy copies die with their pages. Add `group` to the `language.test.ts`-style scan if it keeps coming back.
- **In plain words:** every amount on screen is printed by `lib/cc/format.ts` (lei) or `useMoney()` (chosen currency). Don't format bani anywhere else.

### ABS-04 · Ion's farm · Generalize now

- **Evidence:** three builders produce the same farm: `ion()` in `lib/boot.ts:39`, `ionFarm()` in `lib/cc/farm.ts:40`, and the landing-page farm in `lib/landing-data.ts:39`. All three hardcode the wheat's sowing month: `ION_PLANTED = { grau: '2026-10' }` (`boot.ts:36`, `cc/farm.ts:35`, `PLANTED` in `landing-data.ts`). `docs/data/demo-ion.json` doesn't have it. That breaks CLAUDE.md: "Cifrele vin doar din `docs/data/*.json`."
- **Cost to change later:** Medium. The landing page and the app can show Ion differently, and the pitch quotes these figures (`09-demo-pitch.md`).
- **Decision and shape:** add `planted_month` to `demo-ion.json` parcels. Then keep one `ionFarm(data)` (in `lib/cc/farm.ts`), and make `boot.ts` (until it's deleted) and `landing-data.ts` call it. The landing-specific figures (costs ring, crop cards) stay in `landing-data.ts`.
- **In plain words:** Ion comes from `demo-ion.json` through `ionFarm()`, and only there.

### ABS-05 · One way to reach the API · Generalize now (merge two into one)

- **Evidence:** `lib/live/index.ts:33` `connect()` reads `window.CROPCASH_CONFIG` and gets the registry from `window.CropEngine`. `lib/cc/react.tsx:20–40` reads the config again (`config()`) and builds a second `createFunctions` with `FUNCTIONS` imported. The error text at `live/index.ts:36` still says "Run: npm run build:farm", but `farm-app` is gone.
- **Decision and shape:** `live/index.ts` imports `FUNCTIONS` directly, as `react.tsx` already does, and reads `NEXT_PUBLIC_CROPCASH_CONFIG` itself. `makeStore` uses `Live.read`/`Live.write`. The `CropEngine` getter goes now. The `window.CROPCASH_CONFIG` assignment goes when `boot.ts` does. This is one function, not a new layer.

### ABS-06 · Screen registry (one body, two routes) · Generalize now: keep, and trim

- **Evidence:** two real routes per screen (`app/<name>/page.tsx` and `app/ferma-lui-ion/[page]/page.tsx`), 11 screens. `screens/index.ts` with `satisfies Record<ScreenName, ScreenDef>` makes a missing screen a type error. It's well sized.
- **Trim:** every `ScreenDef.scripts` list repeats `shared, engine, data-calls, app, …, notifications`. `'config'` is in `PROVIDED` (`boot.ts:31`), so listing it does nothing. Don't add docs/13 §A1's planned `themeColor` field, because it's `#B4E85C` on every screen and `SCREEN_VIEWPORT` already covers it. After N5, `ScreenDef` shrinks to `{ title, Body }`.
- **In plain words:** each app page is one file in `web/screens/`. The farmer's route and Ion's route both render it, so add a screen there and to `DEMO_PAGES`, and both routes get it.

### ABS-07 · The store · Seam

- **Evidence:** port plan decision 1 says it's "tested in Node with a fake API, storage and clock". It replaces 16 `location.reload()` calls.
- **Tests:** `store.test.ts` (28 tests) landed on 2026-11-08 and covers N3b's list. ABS-02 adds one more case.
- **Keep out of it:** page-only UI state (open sheet, chosen tab) and formatting.
- **In plain words:** `lib/cc/store.ts` holds the farm the pages show and every change to it. Pages read it through the hooks in `react.tsx` and change it only through its actions; nothing else writes storage.

### ABS-08 · Function registry · Seam (keep as is)

`createFunctions` (`lib/live/functions.ts:12`) validates with the same Zod schemas as the API, then calls `/api/functions/:name` or the function's own `request()`. It's a deep module: small surface, real logic behind it. Don't add a typed client per function on top of it.

### ABS-09 · `farmView` · Defer with trigger

- **Evidence:** `lib/cc/plan.ts:238–272` returns ~35 members: values, functions and page-only helpers like `seasonWord`, `projectName` and `compare`. This is `window.CC` with types. Porting is easier with it, because pages map 1:1.
- **Trigger:** N5 page 13 is done. Then grep which members each page reads. Delete the unread ones, and move members only one page reads into that page. `CROP_ACC = { grau: 'grâul', porumb: 'porumbul' }` (`plan.ts:72`) is crop data in code: move it to `crops-reference.json` (a `name_ro_def` field), or it silently breaks for own crops (P30).

### ABS-10 · Local vs server writes in store actions · Defer with trigger

`setTaskDone`, `setFollow`, `savePlanFigures`, `saveAllHarvests` and `setOwnPension` each branch on `farm.me` ("send to the server" vs "save on the phone"). `send`, `flushOutbox` and `refreshFarm` branch on `mode === 'demo'`. With two cases, the branches stay readable. **Trigger:** a third write target, or a sixth action that grows the same `if`. Then split into a `phoneFarm` and a `serverFarm` writer with the same action names.

### ABS-11 – ABS-14 · Shared page components · Generalize now, at port time

All four have real, repeated cases in `web/legacy`. Build each from those cases, with no extra props:

| Component | Cases | Shape |
| --- | --- | --- |
| `<Sheet>` | `showModal` in 11 files | `open`, `onClose`, `labelledBy`, children. No variants |
| `<NeedsNet reason>` | 6 files + the CLAUDE.md offline rule | Disables offline, shows `.net-why`, keeps `data-needs-net` |
| `<ErrorLine error>` | `failText` in 9 files, `.ob-err` in 9 | `failText(error, online)` into `.ob-err role="alert"` |
| `<PaperUpload kind onRead>` | 3 kinds (invoice, cerere, decision) | The kind picks the prompt text only. Each page parses its own result in `onRead`, with no `switch (kind)` for results inside |

**In plain words:** use the component instead of copying the markup. If a fourth case needs a new prop, check first whether it's really the same thing.

### ABS-15 · Charts · Specific charts, one shared loader

`legacy/chart.js` (month money), `pension-chart.js` and `charts.js` (landing) plot different things. They share only "load Recharts, else draw plain SVG". Share that boundary (`useRecharts()` or `<WithRecharts fallback>`) and keep `FarmChart`, `PensionChart` and the landing charts as three components. Don't build a generic `<Chart config>`.

### ABS-16 · Currency by text rewrite · Defer with trigger

`moneyFormat` (`lib/cc/currency.ts:33`) prints lei text, then parses it back with `convertText`'s regex to convert. That keeps React and legacy figures identical during the port, which is worth it. **Trigger:** the last legacy page is deleted. Then convert the number (bani × rate) before formatting, and keep `convertText` only for free text (assistant answers). Add a test that both agree on sample amounts.

### ABS-17 · Per-screen skeletons (docs/13 B2–B3) · Cut

- **Plan:** `<Bone>`/`<BoneText>`/`<BoneCard>` primitives plus eleven hand-built skeletons, each copying its screen's bento, mounted by `LegacyPage`.
- **Why cut:** every screen's JSX shell already has the real layout, with empty slots (`screens/salariu.tsx`: `id="h-amount"`, `id="m-list"`, …). After the port, `ready=false` renders that same shell (port plan decision 5). Eleven copies of layout drift whenever a bento changes, and `LegacyPage` is deleted at the end of N5.
- **Simpler:** keep B1 (booting/ready/failed states) and B4. For the skeleton itself, use one CSS rule: while `html:not([data-ready])`, empty slots inside `.bento` get the shimmer and a minimum height. **What's lost:** pixel-exact bone shapes for multi-row lists. Add `min-height` per slot class if one jumps.

### ABS-18 · Palette system · Cut

`legacy/shared.js:7` defines six palettes and a picker (`mountPalette`). The picker no longer appears in the app ("A palette saved before the picker left Acasă still applies", `app.js:628`), and the chosen design is "Field, Violet & Gold" (`both`). The port plan still lists `palette` in store state and `setPalette()`. Instead, put `both`'s tokens in `styles/shared.css` `:root`, and drop `PALETTES`, `farm-palette:*` reading, `?palette=` and the store field. **What's lost:** a returning tester with an old saved palette sees the default.

### ABS-19 · Dead bridge pieces · Cut

- `web/scripts/port-legacy.mjs`: its header says to re-run it "if a farm-app page changes", but `farm-app` is gone, and re-running it would overwrite hand edits in `web/legacy`. Delete it now. The "Edit farm-app, or edit here…" banner at the top of each legacy file can go too.
- `'config'` in `ScreenDef.scripts` and the `LoginPage`/`OnboardingPage` lists does nothing (`PROVIDED`, `boot.ts:31`).
- At the end of N5, as the port plan already says: `boot.ts`, `engine.ts`, `LegacyPage.tsx`, `WHOLE_FARM_PAGES`/`scopeOf` (`plan.ts:32`; pages pass `scope` themselves), and `MONITOR_PAGES` inside `refreshMonitor` (the hook is only called on those pages).

### ABS-24 · Page shell metadata and CSS · Defer with trigger

`app/login/page.tsx` and `app/onboarding/page.tsx` repeat `SCREEN_VIEWPORT` and the same four CSS imports as `components/Screen.tsx`. **Trigger:** N4's `(app)/layout.tsx`. Move the four imports into one root-level stylesheet import, and have login/onboarding reuse `SCREEN_VIEWPORT`. It's not worth a change before then.

## Over-engineering to remove

| Where | Smell | Simpler alternative | What's lost |
| --- | --- | --- | --- |
| docs/13 §B2–B3 | Hand-made copy of each screen's layout (11×) | CSS shimmer on the shell's empty slots (ABS-17) | Exact bone shapes |
| `legacy/shared.js:7`, port plan N3b `setPalette` | Configurable palettes with one used | Fixed tokens in CSS (ABS-18) | Nothing in use |
| `lib/cc/plan.ts:238` `farmView` | Wrapper mirroring an old global | Trim to what pages read after N5 (ABS-09) | Nothing |
| `lib/cc/currency.ts:33` | Format → parse → convert round trip | Convert numbers directly after the port (ABS-16) | Nothing |
| `web/scripts/port-legacy.mjs` | Generator for a source that no longer exists | Delete (ABS-19) | Nothing |

## Shared mechanisms from sibling plans

| Mechanism | Proposed by | Decision | Notes |
| --- | --- | --- | --- |
| `clientId` on sales and expenses, set before the first try | idempotency-planner (inventory OP-5/6) | Seam, in `store.send()` (keep) | Only the id lives in the shared piece. The server's unique `(farmer_id, client_id)` does the dedupe |
| Outbox replay | port plan N3b | Seam (ABS-02) | Money writes stay outside `QUEUEABLE`, per CLAUDE.md |
| Online check + `/api/health` ping | port plan N3a `net.ts` | Specific, one module | No retry policy for page requests: `createApi` "never retries" is right for taps |

## Sequencing note

docs/13 steps 4–8 add demo mode, the guard and skeletons to `app.js` + `LegacyPage`, while N3 rebuilds the same behaviour in `lib/cc`. Behaviour that legacy pages need now (demo keys, the guard) has to exist in both, and the contract test covers that. **Skeletons (steps 7–8) should wait until after N5**, or be done as the one CSS rule in ABS-17, so they aren't built twice.

## Assumptions

- The React port (N3–N5) goes ahead as planned. If it stops after page 7, ABS-09, ABS-16 and ABS-24 stay deferred, and ABS-11–14 apply only to ported pages.
- No second UI language and no second payment or auth provider is planned, because no doc mentions one.
- The palette picker isn't coming back. The 2-rail design with "Field, Violet & Gold" is final.

## Open questions

- Should a refused-by-schema outbox item (ABS-02) show the same "Notează-o din nou în Recolte" note, or a different one? Affects ABS-02.
- Is the wheat sowing month `2026-10` a verified figure? If not, it becomes `null` + `DE-VERIFICAT` in `demo-ion.json` and an entry in `11-open-questions.md`. Affects ABS-04.
- Is anyone relying on `?palette=` (screenshots, the pitch deck in `pptx/`)? Affects ABS-18.

---

# Build plan

**Written:** 2026-11-08. Nothing here is built yet. The plan follows the React port (`docs/web-react-port-plan.md`): N3 is done, and N4 and N5 are still open. Each step ends with `npm test` and `npm run typecheck` green, then a tick here. **No commit per step** (CLAUDE.md). Steps that change visible pixels also get a `/browse` check at 390 px and 1280 px.

## Decisions that need a yes first

CLAUDE.md says to ask before deviating from the docs. Each of these changes a written plan. The default is in bold.

| # | Decision | Changes | Blocks |
| --- | --- | --- | --- |
| Q1 | **Fix the outbox stall in `legacy/app.js` too**, even though the port plan freezes it | Port plan "Risks" (frozen `app.js`) | A1 |
| Q2 | **Move `"planted_month": "2026-10"` into `demo-ion.json` as is**, with a `note` that it came from farm-app's `app.js`. The alternative is `null` + `DE-VERIFICAT` | `docs/data/demo-ion.json`, maybe `11-open-questions.md` | A2 |
| Q3 | **Cut the palette system** and keep "Field, Violet & Gold" as fixed CSS tokens | Port plan N3b/N4 (`setPalette`, palette in state) | A6 |
| Q4 | **Replace docs/13 §B2–B3** (primitives + 11 skeletons) with one CSS rule on the screens' empty slots | `docs/13` steps 7–8 | B3 |
| Q5 | A record refused by the schema shows **the same "Notează-o din nou în Recolte" note** as one refused by the server | UI text | A1 |

## Phase A: now, independent of the port (~5.5 h)

These fix things that are wrong today, or that the port would otherwise copy.

- [x] **A1 · Outbox can't stall on a bad item (ABS-02) · ~1.5 h · needs Q1, Q5**
  - Add `classifyFlushError(e) → 'retry' | 'refused'` to `lib/live/outbox.ts`. This is the classification half of FAIL-05 (`failure-handling-plan.md`). Classify by `code` before `status`: `invalid_input` and `unknown_function` (status 0, thrown on the phone by `createFunctions`) → `refused`; other 4xx → `refused`; everything else → `retry`. FAIL-05's 401 / `no_farm` / backoff rows stay in FAIL-05. When it lands, it adds `'stop-auth'` to this same function.
  - Use it in `lib/cc/store.ts` `flushOutbox` and `legacy/app.js:166`, replacing `!(status >= 400 && status < 500)`.
  - Tests: a table test in `outbox.test.ts`, and in `store.test.ts`: "an item the schema rejects goes aside, and the next one is sent". `legacy-contract.test.ts` stays green.
  - Done when a queue of `[bad sale, good sale]` ends with `refused = [bad]`, `outbox = []`, and the good sale sent.

- [x] **A2 · One source for Ion (ABS-04) · ~1 h · needs Q2**
  - `demo-ion.json`: add `planted_month` to the wheat parcel as a plain field, like `area_ha`, with the source in the file's `note` style.
  - `lib/cc/farm.ts`: `ionFarm` reads it, and `ION_PLANTED` goes.
  - `lib/boot.ts`: `ion()` becomes `ionFarm(engine.loadData())` (the shape is the same `PageFarm`). `ION_PLANTED` and the local county/list code go.
  - `lib/landing-data.ts:12`: `PLANTED` goes, and the parcels read `planted_month` from the JSON. The landing page builds a `StoredFarm` for the engine, not a `PageFarm`, so it shares the data, not the builder.
  - Tests: `landing-data.test.ts` gives the same figures, `legacy-contract.test.ts` stays green, and Ion's salary still equals the figure in `09-demo-pitch.md`.
  - Done when `grep -rn "2026-10" web/lib` finds nothing.

- [x] **A3 · One `group` (ABS-03) · ~15 min**
  - `app/page.tsx:13` and `lib/landing-data.ts:32` import `group` from `lib/cc/format.ts`.
  - Done when `grep -rn "const group" web/app web/lib` finds only `format.ts`.

- [x] **A4 · One way to the API (ABS-05) · ~1 h**
  - `lib/live/index.ts`: import `FUNCTIONS` from `@cropcash/shared`, and drop the `window.CropEngine` getter and its `declare global` entry.
  - One `publicConfig()` in `lib/live/index.ts` (`window.CROPCASH_CONFIG ??= JSON.parse(process.env.NEXT_PUBLIC_CROPCASH_CONFIG ?? '{}')`). `lib/cc/react.tsx` `config()` and `boot.ts`'s assignment call it instead of repeating it.
  - `lib/cc/react.tsx` `makeStore`: `live: { api: Live.api, read: Live.read, write: Live.write }`, with no second `createFunctions`.
  - Change the error text at `live/index.ts:36` to name `NEXT_PUBLIC_CROPCASH_CONFIG`, not `build:farm`.
  - Check: the registry (Zod schemas) now reaches the login page's chunk. Compare `web/out/_next/static` sizes before and after. A small increase is fine.
  - Done when `grep -rn "CropEngine" web/lib/live web/lib/cc` finds nothing, and `live.test.ts` and `store.test.ts` are green.

- [x] **A5 · Dead bridge pieces (ABS-19) · ~30 min**
  - Delete `web/scripts/port-legacy.mjs`. Drop `htmlparser2` from the dev dependencies if nothing else uses it.
  - Remove `'config'` from every `scripts` list (`screens/*.tsx`, `app/login`, `app/onboarding`), then from `PROVIDED` in `boot.ts`.
  - Replace the first line of each `web/legacy/*.js` ("Ported from farm-app… Edit farm-app, or edit here and stop re-running the port") with "Legacy page script; replaced page by page in docs/web-react-port-plan.md N5."
  - `lib/live/auth.ts`: `FARM_COPY` becomes `KEYS.me` from `lib/cc/storage.ts` (the first piece of ABS-01). `auth.ts`'s Storage-shaped `KeyStore` stays, because `clearFarmData` takes `localStorage` itself.
  - Done when `npm run build:web` gives the same `out/` page list.

- [x] **A6 · Fixed palette (ABS-18) · ~1.5 h · needs Q3**
  - `styles/shared.css:9–14` `:root` holds the "violet" palette's values today (`--c: #7C5CFC`). Set it to "both" (`legacy/shared.js:10`: `--c: #F2B81F`, `--ink-c: #8A5C00`, `--tint-c: #FFF2C9`, `--bg: #FBFAF3`, …), plus the chart tokens `palette()` sets.
  - `legacy/app.js:628–632` and `legacy/login.js:15–17`: stop reading `farm-palette:*`.
  - `legacy/shared.js`: `palette()` stops writing inline variables, so CSS wins. `PALETTES`, `mountPalette` and `?palette=` go if the landing page doesn't call them. Check first with `grep -n "mountPalette\|FF.palette" web/legacy/landing.js web/legacy/charts.js`.
  - The `palette="both"` props (`Screen.tsx`, login, onboarding, landing) and `boot.ts`'s `defaultPalette` go.
  - Port plan: remove `palette` from N3b state and N4's components.
  - Check: `/browse` screenshots of Acasă, Salariu and the landing page, before and after, with the same colours.

## Phase B: with N4, the frame (~5 h on top of N4)

- [x] **B1 · Shared components from real cases (ABS-11–13, 15)**
  - `components/Sheet.tsx` (`open`, `onClose`, `labelledBy`, children), `NeedsNet.tsx` (`reason`, keeps `data-needs-net`), `ErrorLine.tsx` (`error`, uses `failText` from `lib/cc/format.ts`, so FAIL-08's new codes land in one place), and `useRecharts()` (the lazy import + a `failed` flag, so each chart chooses its own SVG fallback).
  - No variant props. Each component's header comment lists the legacy files it replaces.
  - Tests (happy-dom, port plan decision 6): `Sheet` opens, closes and returns focus; `NeedsNet` disables offline and shows the reason; `ErrorLine` shows nothing for `null`.
- [x] **B2 · One page frame (ABS-24)**
  - `(app)/layout.tsx` imports the four stylesheets once. `app/login` and `app/onboarding` use `SCREEN_VIEWPORT`, not their own copy.
- [~] **B3 · Loading state as one rule (ABS-17) · needs Q4** · **Dropped (2026-11-08).** Another session built the per-screen skeletons (`components/skeleton/`, with tests), and CLAUDE.md now requires one for each new screen. The one-rule idea also needed empty slots in the page HTML, and React pages no longer have any.
  - `styles/skeleton.css`: `html:not([data-ready]) .bento [id]:empty` gets the shimmer and a `min-height` per slot class, with no shimmer under `prefers-reduced-motion`.
  - `LegacyPage` sets `data-ready` when `boot()` returns and shows docs/13 B1's failed state.
  - React pages get the same thing from `ready=false` for free.
  - Update docs/13 steps 7–8 to say this.
  - Check: `/browse` with "Slow 3G" at both widths, with no layout jump when the page fills in.

## Phase C: inside each N5 page port (~10 min per page)

Add these lines to the port plan's "For each page" list:

1. The page's own `localStorage` keys move into `lib/cc/storage.ts`, through `storageKey`, with a fixture in `legacy-contract.test.ts` (ABS-01). The legacy keys are `assistant`, `arrived`, `events`, `paper-ok`, `pension-compare`, `source-key` and `my-sources`.
2. Dialogs, offline buttons and errors use `Sheet`, `NeedsNet` and `ErrorLine`. No copied markup.
3. Page 2 (onboarding) builds `<PaperUpload kind onRead>` from `legacy/papers.js`. The kind picks the prompt only, and the parsing stays in each page's `onRead` (ABS-14).
4. Note which `farmView` members the page reads in a comment at the top of the screen file. That list is the input for D1 below.

## Phase D: after N5 page 13 (~4 h)

- [x] **D1 · Trim `farmView` (ABS-09).** Using Phase C's notes, delete the members no page reads, and move members used by one page into that page. Move `CROP_ACC` (`plan.ts:72`) into `crops-reference.json` as a per-crop field, falling back to `name_ro` for own crops, and add a test that every crop in the file has it.
- [x] **D2 · Currency from numbers (ABS-16).** `moneyFormat` converts bani × rate, then formats. `convertText` stays for free text only (the assistant). Add a test that both give the same string for a table of amounts in EUR.
- [x] **D3 · Shrink the bridge (ABS-06, ABS-19).** `ScreenDef` becomes `{ title, Body }`. Delete `WHOLE_FARM_PAGES`/`scopeOf` and the `MONITOR_PAGES` check inside `refreshMonitor`, plus whatever the port plan already deletes (`boot.ts`, `engine.ts`, `LegacyPage.tsx`, `legacy-contract.test.ts`).
- [x] **D4 · Check the ABS-10 trigger.** Count the store actions that branch on `farm.me`. If there are more than five, or a third write target exists, split `phoneFarm`/`serverFarm`. Otherwise, leave it.

## Phase A status (2026-11-08)

- **A1:** `classifyFlushError` in `web/lib/live/outbox.ts`, used by `lib/cc/store.ts` and `legacy/app.js` (through `engine.ts`). Tests: a table in `outbox.test.ts`, and "sets aside an item this version rejects on the phone, and sends the next one" in `store.test.ts`.
- **A2:** `planted_month` is on Ion's wheat in `docs/data/demo-ion.json` (with `parcels_note`). `boot.ts` builds `__ION` from `ionFarm`. `landing-data.ts` reads the JSON. No `2026-10` is left in `web/lib`. `seed:demo` still doesn't send it, so the seeded `DEMO_EMAIL` farm has no sowing month (unchanged from before).
- **A3:** `group` exists only in `lib/cc/format.ts`. `lib/live/money-text.ts` keeps its own `grouped`, a different rule (no `abs`/`trunc`) used for parsing text.
- **A4:** one connection in `lib/live/index.ts`, with the registry by import and `publicConfig()`. `react.tsx` uses `Live.read`/`Live.write`. `boot.ts` still calls `publicConfig()` up front, because `app.js` and `bani.js` read `window.CROPCASH_CONFIG`. Cost: `/login` now also loads the registry chunk, about 97 KB uncompressed.
- **A5:** `web/scripts/port-legacy.mjs` is deleted, its mentions are reworded, `'config'` is gone from the script lists and `PROVIDED`, and `auth.ts` uses `KEYS.me`.
- **Checks:** `npx vitest run web` 237 passed. `npm run build:web` builds every route (`out/sw.js` 106 entries). `typecheck` errors remain only in files another session is writing (`components/app/Frame.tsx`, earlier `lib/live/intent.test.ts`).

## Phases B–D status (2026-11-08)

The port (N4, N5) finished in other sessions while this plan was open, so some steps were already done or changed shape.

- **A6:** the chosen palette is now the `:root` values in `styles/shared.css`, chart colours included. `lib/ui/palette.ts`, `usePalette`, the picker, `?palette=` and the `.pal-*` CSS are gone. Theme colour is `#FBFAF3`, the value the script used to set. Checked in the browser on `/ferma-lui-ion/acasa`, `/ferma-lui-ion/salariu`, `/login` and `/`.
- **B1:** `Sheet` and `NetButton` (the plan's `NeedsNet`) already existed in `components/app/bits.tsx`. Added `ErrorLine` there and moved all 21 `.ob-err role="alert"` sites to it. It takes the message as children, not an `error` object, because the pages already hold strings from two different `failText`s. Added `components/app/useRecharts.ts`, used by `FarmChart` and `PensionChart`.
- **B2:** `components/appStyles.ts` holds the four stylesheets and `APP_VIEWPORT`, used by `Screen.tsx`, login and onboarding. There's no `(app)` route group, so it's a module rather than a layout.
- **C:** the page keys are in `pageKeys(mode)` in `lib/cc/storage.ts` (`assistant`, `paperOk`, `pensionCompare`, `sourceKey`, `mySources`). `arrived` and `events` no longer exist. `PaperUpload` was built as `components/app/Papers.tsx`. The `farmView` notes weren't needed, since every page could be searched directly.
- **D1:** removed `current`, `harvestPlan`, `harvestPlanned` and `harvestActual` from what `farmView` returns (the functions stay inside it). `seasonWord` moved to Recolte. `CROP_ACC` is now `name_ro_art` in `crops-reference.json`, with a test that every crop has it. The other one-page members (`dataWithout`, `previewPlan`, `longForecast`, `harvestEnd`, `closeProject`) stay, because they use the plan's internals.
- **D2:** `moneyFormat` rounds as in lei, then converts the number (`amountIn` in `lib/live/money-text.ts`, which `convertText` also uses). `lib/cc/currency.test.ts` checks that both agree for 13 amounts in EUR, USD and GBP.
- **D3:** `ScreenDef` was already `{ title, App }`. Removed `MONITOR_PAGES`: the three pages that call `useMonitorRefresh()` are the rule. **`WHOLE_FARM_PAGES`/`scopeOf` stay**: `Frame` needs a scope from the route, for pieces that aren't the page itself, so this plan's ABS-19 note was wrong.
- **D4:** five actions branch on `farm.me` for writes (`saveAllHarvests`, `selectHarvest`, `savePlanFigures`, `setTaskDone`, `setFollow`), and no third write target exists, so the trigger hasn't fired. No split.
- **Checks:** `npx vitest run web packages/shared` passes except a `pensie` test in `pages.test.tsx` that sometimes hits the 5 s limit: its first render took 5.6 s with the CPU at 100%, and all 33 pass with a longer timeout. `typecheck` is clean. `npm run build:web` builds every route.

## Order and effort

| Phase | When | Hours | Notes |
| --- | --- | --- | --- |
| A1–A5 | now | ~4 | Independent of each other. A1 touches `outbox.ts` + `store.ts`; the rest don't |
| A6 | after Q3, before N4 | ~1.5 | Visual check needed |
| B1–B3 | with N4 | ~5 | B3 after Q4 |
| C | during N5 | ~2 total | |
| D1–D4 | after N5 | ~4 | |
| **Total** | | **~16 h** | on top of the port plan's remaining ~40 h |

If time is short, do **A1, A2 and A4** only. A1 is the bug, A2 is the data rule, and A4 stops the port from building on two API paths. The rest is cleanup that the port makes cheaper later.

## Docs to update as steps land

- `docs/web-react-port-plan.md`: N3b/N4 without the palette (A6), the "For each page" list (Phase C), the shared components (B1).
- `docs/13-auth-demo-loading-plan.md`: steps 7–8 (B3).
- `docs/failure-handling-plan.md`: FAIL-05 notes that `classifyFlushError` exists (A1).
- `docs/11-open-questions.md`: only if Q2 goes to `DE-VERIFICAT`.
