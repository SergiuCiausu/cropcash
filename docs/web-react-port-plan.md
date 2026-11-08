# Porting `web/` pages to React (N3–N5)

**Status:** written 2026-11-08. It replaces the N3–N5 sections of `docs/web-nextjs-plan.md`, which assumed `farm-app` and `apps/web` were still running.
- [x] **N3 (2026-11-08)**, built for the rules in `docs/13-auth-demo-loading-plan.md`, since that work was under way at the same time. See "What N3 built" below. No page uses it yet.
- [x] **N4 (2026-11-08)**: the frame and shared components, wired in through `ScreenDef.App`. No screen uses it yet. See "What N4 built" below.
- [x] **N5 (2026-11-08)**: all 13 pages are React. See the status under N5.

**Goal:** the 13 app pages become React components that import `packages/shared` and `web/lib/live` directly. The globals (`CC`, `Live`, `CropEngine`), `boot.ts` and `location.reload()` go away. Every class name, Romanian string and figure stays the same.

**Out of scope:** the landing page (`/`, `landing.js` + `shared.js` + `charts.js`). Its figures already come from `docs/data` at build time (N6). The English crop-card labels in `web/legacy/shared.js:80` are a separate small fix.

## Where things stand

| Piece | Today |
|---|---|
| Pages | `web/app/<route>/page.tsx` = static JSX shell with empty `id` slots. `LegacyPage` → `boot.ts` sets the globals, then runs `web/legacy/<page>.js`, which fills the slots with `innerHTML` |
| `web/legacy/app.js` (719 lines) | Everything shared, computed **once per page load**: the farm (signed in / onboarding copy / Ion), outbox, harvests and the selected harvest or crop, plan helpers, monitor copy, follows, currency, net state, the frame (rail, tabs, banner), formatters. Exposed as `window.CC` (≈45 members used by pages) |
| Reloads | 8 in `app.js` (server copy changed, monitor changed, harvest picked, currency changed, outbox flushed, 401) + 8 in pages (recolte, bani, pensie, subventii) |
| Islands on every framed page | `notifications.js` (bell + toasts), `assistant.js` ("Întreabă"), and `papers.js` on 3 pages |
| Currency | `showCurrency()` walks every text node and rewrites amounts with `convertText` |
| Already modules with tests | `web/lib/live/*` (auth, client, farm, monitor, outbox, money-text, service worker) |

## Design decisions (defaults in bold, need a yes before N3)

1. **State lives in a plain TypeScript store (`web/lib/cc/store.ts`), and React reads it through `useSyncExternalStore`.** `FarmProvider` only creates and starts it. The store is tested in Node with a fake API, storage and clock, with no DOM. The alternative, a React context holding all logic, is harder to test and re-renders everything.
2. **Old and new pages live side by side, sharing localStorage, not code.** The new `lib/cc` modules read and write the **same keys in the same format** as `app.js` (`cropcash-me`, `-me-at`, `-farm`, `-harvests`, `-pension`, `-outbox`, `-outbox-refused`, `-monitor`, `-follows`, `-currency`, `-rates`, palette). Moving between a legacy page and a React page is a full page load, so state carries over through storage. `app.js` stays frozen and is deleted when the last page is ported. A contract test checks this: storage written by `app.js` is read correctly by `lib/cc`.
   *Alternative:* rewrite `app.js` to call `lib/cc`. That means one copy of the logic, but every legacy page needs retesting. Not worth it for a ~1-week overlap.
3. **Ported pages move into the `app/(app)/` route group.** Its `layout.tsx` is the React frame. URLs don't change. `lib/paths.ts` gets a `PORTED` list: the frame uses `<Link>` to ported routes and plain `<a>` to legacy ones, because `boot.ts` runs only once per load.
4. **Currency:** no DOM walking on React pages, since it would fight React's reconciliation. `useMoney()` returns `lei`, `exact`, `about` and `cents` already converted to the chosen currency, using the same `convertText` rules. Changing the currency updates the store with no reload.
5. **Static export:** the HTML built for each page holds only the shell (headings, static text). Farm content renders once the store has loaded on the phone (`ready`), so there's no hydration mismatch. Offline it comes from the saved copy at once.
6. **Component tests:** add `happy-dom` and `@testing-library/react` as dev dependencies, used per file (`// @vitest-environment happy-dom`). The pure modules and the store stay on `node`.

## N3. `lib/cc` modules, the store, `FarmProvider` · ~12 h

### N3a. Pure modules (split out of `app.js`), each with tests
| Module | From `app.js` | Notes |
|---|---|---|
| `format.ts` | `esc`, `group`, `cents`, `about`, `exact`, `ha`, `num`, `eurShort`, `date`, `daysLeft`, `zile`, `MONTHS` | `esc` is only for the remaining `innerHTML` and is dropped once pages are JSX |
| `keys.ts` | every `cropcash-*` key + safe JSON read/write | One list, also used by sign-out (`clearFarmData`) |
| `session.ts` | `signedIn`, `savedMe`, `forgetSession`, `FARM_COPY_AT`, staleness (`STALE_DAYS`) | |
| `farm.ts` | `savedFarm`, `saveFarm`, Ion (from `boot.ts`'s `ion()` + `ION_PLANTED`), `BASE_FARM`, `isIon`, `TODAY`, `BASE_YEAR`, own crops (`withOwnCrops`) | Ion still comes from `demo-ion.json` |
| `harvests.ts` | `loadHarvests`, `saveHarvests`, `firstHarvest`, open, selected, scope (`wholeFarm` becomes a parameter, not `location`), `harvestPlan`, `harvestPlanned`, `harvestActual`, `harvestEnd`, close/reopen, `addCrop`, `cropParcel`, `areaShare`, `cropMonths`, `compareTable` data (the HTML part moves to a component) | The largest. `wholeFarm` was decided from the URL; now each page passes `scope: 'farm' \| 'selected'` |
| `plan.ts` | `farmData`/`data`/`dataWithout`, `storedFarm`, `farmPlan`, `previewPlan`, `longForecast`, `planItem`, `figureSource`, `pensionBani`, `ownPension`, `grainInBarn`, `doneTasks`, `savePlanFigures` | Memoised per store version, not per page load |
| `follows.ts` | `loadFollows`, `saveFollows`, `setFollow`, `followedCalls` | |
| `monitor.ts` | monitor copy, `MONITOR_FRESH_MS`, refresh rule, `callCode`, `callName`, `VARIANT`, `sectorOf` | Combined with `lib/live/monitor.ts` |
| `currency.ts` | `savedRates`, code, the converting formatters | |
| `net.ts` | `isOnline`, the `/api/health` ping every 30 s after a failure | Takes `fetch` and timers as parameters for tests |

### N3b. The store (`store.ts`)
- **State:** `{ ready, me, farm, today, harvests, view: { harvestId, cropId }, outbox, refused, monitor, follows, currency, rates, online, palette, version }`.
- **Actions** (replace each `location.reload()`): `refreshFarm()` (server copy → `farmChange` → new state; a 401 signs out), `refreshMonitor()` (at most once an hour), `send(fn)` and `write(name, input)` (queues only `QUEUEABLE`; money never queues), `flushOutbox()` (in order, on start and when the net returns), `selectHarvest(id, cropId)`, `saveHarvests()`, `addCrop()`, `close/reopen`, `setFollow()`, `setCurrency()`, `setPalette()`, `dismissRefused()`.
- **Listens to** `online`/`offline` and the ping, and refreshes on start when signed in (as `app.js` does on `load`).
- **Tests:** copy first, then server; a changed farm updates state with no reload; a clock-only change moves `today`; 401 clears session keys; offline keeps the copy and queues a sale but refuses a payout; flush order and the refused list; harvest selection is persisted in the same format.

### N3c. Provider and hooks
`FarmProvider` (in `(app)/layout.tsx`, plus login and onboarding) creates the store and registers the service worker (moved from `installOffline`). Hooks: `useFarm()`, `usePlan(scope)`, `useHarvests(scope)`, `useMonitor()`, `useFollows()`, `useSend()`, `useOnline()`, `useMoney()`, `useToday()`.

### N3d. Contract test
Fixtures of each storage key as `app.js` writes it (signed out, Ion, onboarding farm, signed in with outbox) → the store's state gives the same `FARM`, `TODAY`, selected harvest and plan salary that `CC` gives. The salary for Ion must be the figure in `09-demo-pitch.md`.

**Done when:** `npm test` green, and no page uses any of it yet, so nothing visible changes.

### What N3 built (2026-11-08)
Everything is in `web/lib/cc/`:
- `storage.ts`: keys and safe read/write.
- `format.ts`: amounts, areas, dates.
- `currency.ts`: `moneyFormat`.
- `farm.ts`: `readFarmState`, `ionFarm`.
- `harvests.ts`, `plan.ts`: `farmView`, `viewFor`.
- `monitor.ts`, `net.ts`.
- `store.ts`: `createStore`.
- `react.tsx`: `FarmProvider` and the hooks `useFarmState`, `useFarm`, `useView(scope)`, `useMoney`, `useOnline`, `useMonitor`, `useMonitorRefresh`, `useStore`.

Differences from the plan above:
- **Two modes, from `docs/13` §A3.** In the `demo` mode (`/ferma-lui-ion`), the farm is always Ion, his keys go through `storageKey()` from `lib/paths.ts` (`cropcash-demo-*`), and nothing reaches the server (`send` rejects with code `demo`). In the `farm` mode, the farm is the signed-in copy only. There's **no signed-out onboarding farm**, because sign-in becomes required (docs/13 A5). With no copy, `baseFarm` is `null`, and the sign-in guard takes over.
- **Each action writes storage, then reads all of it again** (`reload()`). It's the same thing `location.reload()` did, without the page reload. `version` goes up on each change.
- **Pages pass their scope:** `useView('farm' | 'picked')`, with `scopeOf(page)` for the old `WHOLE_FARM_PAGES` rule. `compare()` returns rows, not HTML.
- **The monitor snapshot** comes in as a `FarmProvider` prop. Pages 11–12 of N5 turn `data-calls.js` and `data-sources.js` into JSON.
- **Ion's sowing month (`ION_PLANTED`)** is in both `boot.ts` and `cc/farm.ts` until `boot.ts` is deleted.

Tests, all in Node:
- `legacy-contract.test.ts` runs the real `web/legacy/app.js` on the same storage. For Ion in the demo, and for a signed-in farm with and without a queued record, on a whole-farm page and on a picker page, it checks that both give the same farm, date, harvests, pension, monthly plan, crop months, calendar items and ticked tasks. It also checks a closed crop's planned and real figures. Delete it with `app.js`.
- `store.test.ts` (28 tests): the copy first, then the server; a change with no reload; the demo clock; a 401; offline; the client id; the outbox (order, refused, 5xx, back online); undo of a queued record; money never queued; the demo sends nothing; harvests local vs server (`save_harvests` + `update_farm`); tasks; follows; currency; the monitor (only on its pages, at most once an hour).
- `format.test.ts`, `harvests.test.ts`.

## N4. The frame and shared components · ~8 h

| Component | Replaces |
|---|---|
| `(app)/layout.tsx` → `<Frame>`: `Rail`, `PhoneTabs`, subnav (`PAGES`, `TABS`, sections) | `frame()` |
| `NetBanner` | `netBanner()`: offline date, stale warning, waiting records, refused records + "Am înțeles" |
| `NeedsNet reason="…"` | `needsNet()` + `MutationObserver`: disables the button offline and shows `.net-why` with the same text. Keeps the `data-needs-net` attribute so the language test and docs stay true |
| `OfflineNote` | `[data-offline]` notes |
| `Money` / `useMoney` | `showCurrency()` |
| `CurrencyToggle`, palette | `currency`, `applyPalette()` |
| `HarvestChip`, `HarvestSheet` (`<dialog>`) | `harvestChip()`, `harvestSheet()` |
| `ClosedView`, `FutureNote` | `closedView()`, `futureNote()` |
| `Sheet` | the `<dialog>` pattern used by several pages |
| `Notifications` | `notifications.js` (bell, panel, toasts; `notify()` becomes a store action) |
| `Assistant` | `assistant.js` (sheet, sessionStorage thread, confirm cards through `useSend`) |
| `Chart` | `chart.js`: Recharts imported from npm, with the plain SVG fallback |

**Done when:** an empty `(app)/test` route shows the frame signed out and as Ion, offline banner included, at 390 px and 1280 px, and the frame tests pass (net banner states, `NeedsNet`, `Link` vs `<a>` by `PORTED`).

### What N4 built (2026-11-08)

**Change from the plan:** there's no `(app)` route group. The other session's `Screen` seam is already shared by `/<page>` and `/ferma-lui-ion/<page>`, so a screen in `web/screens` is either legacy (`scripts` + `Body`) or React (`App`). For a React one, `components/Screen.tsx` renders `ReactScreen`, which is `FarmProvider` + `Frame`. To port a page, give its screen an `App` and add it to `REACT_PAGES` (`lib/ui/nav.ts`). A test checks that the two lists agree. The "done when" check runs in `components/app/Frame.test.tsx` instead of an `(app)/test` route.

- **Pure, tested** (`lib/ui/ui.test.ts`):
  - `lib/ui/icons.ts` and `palette.ts` are now imported by `legacy/shared.js` too, so there's one copy. *(2026-11-08: `palette.ts` was removed afterwards. The chosen palette is plain CSS in `styles/shared.css`, abstraction-plan A6.)*
  - `nav.ts`: tabs, subsidy sub-pages, `sectionOf`, `REACT_PAGES`.
  - `messages.ts`: the seven notifications and the panel rows.
  - `assistant.ts`: reply text as blocks (no HTML) and confirm cards.
  - `chart.ts`: rows, other years, year ends.
  - `lib/cc/guard.ts`: `guardTarget`, the pure half of docs/13 step 5.
- **Components** (`components/app/`, tested with happy-dom):
  - `Frame`: rail, top bar, tabs, farm box, demo strip, sign-out links. A link to a React page moves client-side; a link to a legacy page loads the page.
  - `NetBanner` (offline, stale after 7 days, waiting and refused records), `HarvestPicker`, `PageNotes` (`FutureNote`, `CompareTable`, `ClosedView`) and `Guard` (login redirect, bring the farm, or ask for internet once).
  - `Notifications` (bell, panel, toaster) and `Assistant` (cards save through `store.send`; on Ion's farm it offers an account).
  - `FarmChart`: plain SVG first, Recharts when it loads.
  - `bits`: `Icon`, `Money`, `NetButton` (offline: disabled, with the reason), `OfflineNote`, `Sheet`.
- **Store additions:** `resetDemo()`, `mode` and `live`. `FarmProvider` takes an optional `store` for tests.
- **Open:**
  - docs/13 step 5 plans its own guard in `live/auth.ts`. When it lands, `Guard` should call that one, and `lib/cc/guard.ts` goes.
  - The idempotency plan's M1 intent key isn't passed through `store.send` yet.
  - Not yet checked in a browser at 390 px and 1280 px. That happens with the first ported page that has the frame (salariu), since no screen uses it before then.

## N5. Pages, one at a time · ~32 h

**Before the first page:** take baseline screenshots of all 13 legacy pages with `/browse`: signed out, Ion signed in, at 390 px and 1280 px, plus offline for Acasă, Recolte and Salariu. Save them in the scratchpad, not the repo. They're the reference once the legacy page is gone.

**For each page:**
1. Move `app/<route>/` to `app/(app)/<route>/` (login and onboarding stay outside the group, with no frame).
2. Turn the JSX shell plus the page script into components. `innerHTML` templates become JSX. `id` slots become props. Keep class names and strings as they are.
3. Read only from hooks. No `window`, no `CC`, no `location.reload()`.
4. UI state that assumed a fresh load (open sheet, chosen tab, slider) resets on purpose when `version` changes.
5. Add the route to `PORTED`, and delete `web/legacy/<page>.js` and its entry in `boot.ts`.
6. Compare with the baseline (same figures, no NaN, no console errors, no sideways scroll), then `npm test` green, then tick it here.

| # | Page | Legacy lines | Also brings |
|---|---|---|---|
| 1 | `login` | 90 | — (auth only; can run alongside N4) |
| 2 | `onboarding` | 169 | `seasons.js` → `<SeasonSteps>`, `papers.js` → `<PaperUpload kind>` |
| 3 | `salariu` | 174 | first page in the frame |
| 4 | `date-plan` | 216 | `previewPlan`, `savePlanFigures` |
| 5 | `subventii` | 294 | APIA decision, `PaperUpload kind="decision"` |
| 6 | `calendar` | 327 | tasks through the outbox, follows |
| 7 | `recolte` | 379 | harvests, outbox, `PaperUpload kind="invoice"`, compare table. The largest |
| 8 | `prognoza` | 157 | `Chart`, scenarios, the 1–10 year cursor |
| 9 | `pensie` | 269 | `pension-chart.js` → `<PensionChart>`, Stripe start (`NeedsNet`) |
| 10 | `bani` | 173 | Stripe demo panel. Money actions never queue |
| 11 | `oportunitati` | 266 | monitor, follows, `data-calls.js` as a JSON import |
| 12 | `surse` | 266 | document search, `data-sources.js` as a JSON import |
| 13 | `acasa` | 141 | uses almost everything, so last |

**Status (2026-11-08):** all 13 pages are React (`web/components/pages/`). There is no `(app)` group and no `PORTED` list: `web/screens/<name>.tsx` names the component, and `REACT_PAGES` in `lib/ui/nav.ts` lists the screens. `lib/cc/store.ts` now also does what `app.js` did for failures: a fresh session on a 401, a lost answer on a money move (FAIL-02, FAIL-03) and retries with a delay. `LegacyPage.tsx` and a small `boot.ts` stay, because the landing page (out of scope) still runs through them. `engine.ts`, `legacy-contract.test.ts` and the other legacy scripts are gone. Not done: the baseline screenshots, and `demo:rehearse` (yours, before merging).

**After page 13:** delete `app.js`, `boot.ts`, `LegacyPage.tsx`, `engine.ts`, `scripts/port-legacy.mjs`, and every `web/legacy/*.js` except the landing page's files. `language.test.ts` stops scanning `web/legacy` except for those. Then update `CLAUDE.md` ("texts live in `web/app` and `web/components`"), `docs/07-architecture.md` §8, `docs/functions.md` (`farm-app` / `apps/web` mentions), and `docs/web-nextjs-plan.md` (status line).

## Offline, unchanged per page
Each page keeps the behaviour in the "What each step does offline" table of `docs/farm-app-wiring.md`: the plan, scenarios and pension simulation are computed on the phone; sales, expenses and tasks go through the outbox; Stripe, the assistant, the monitor and paper reading need the internet and say why. `write-sw.mjs` already caches `_next/static/*`, so new chunks are covered.

## Risks
- **Behaviour drift from `innerHTML` → JSX:** focus, scroll position, `<dialog>` handling, and the order of first paint vs refresh. The baseline screenshots are the guard.
- **Two copies of the shared logic during the port** (`app.js` frozen, `lib/cc` live). A fix in one doesn't reach the other. Freeze `app.js` once N3 starts, and keep the contract test until the last page lands.
- **No reload is new:** a page that read `CC` once at load and kept derived values in closures can show stale figures if ported literally. Derive from hooks on every render, and memoise in the store.
- **Demo risk:** port on a branch, and run `demo:rehearse` (you, real Supabase + Stripe) before merging pages 9 and 10 (`pensie`, `bani`).

## Effort
| Step | Hours |
|---|---|
| N3 | ~12 |
| N4 | ~8 |
| N5 | ~32 (pages 1–7 ≈ 20, 8–13 ≈ 12) |
| **Total** | **~52 h** |

If time runs short, stop after N5 page 7. The daily screens are then React, and the other six stay legacy and keep working through `app.js`.
