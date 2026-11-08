# Moving farm-app and the landing page into one Next.js app (`web/`)

**Status (2026-11-08):** the app pages are now React (`web/components/pages/`, `docs/web-react-port-plan.md` N3–N5); `web/legacy/` keeps only the landing page. What follows is how the first version was built. It was built the quick way. Decision 1 went to **wrapping**, not porting: each page's HTML is JSX in `web/app/<route>/page.tsx`, and its script runs from `web/legacy/*.js` through `web/lib/boot.ts`, with the old globals (`CC`, `Live`, `CropEngine`). Done: N1, N2 (`web/lib/live`), N6 (landing on Ion's figures, `web/lib/landing-data.ts`), N7 (`web/scripts/write-sw.mjs`), N8 (`web/lib/language.test.ts`, banned words only), N9 (`farm-app` and `apps/web` removed, `netlify.toml` on `web/out`). **Not done:** N3–N5, the React port with `FarmProvider` and hooks. Pages still reload after a change and talk through globals. **The current plan for N3–N5 is `docs/web-react-port-plan.md`**; the N3–N5 sections below are superseded. Written on 2026-11-08; the rest of this file is the original plan.

**Goal:** one Next.js app in `web/` (repo root) that holds every `farm-app` page, its CSS and JS, and the landing page `landing-variations/10-harvest.html`. The pages call the TypeScript in `packages/shared` and `farm-app/live` as imported modules, not through `window.CropEngine` / `window.Live` / `window.CC` globals, and every figure on screen comes from real data. That covers the farmer's farm from `/api/me`, Ion from `docs/data/demo-ion.json`, and the monitor through the F6 reads. No sample farm stays.

`packages/shared`, `apps/api`, `subventii-monitor` and `supabase/` stay as they are. This changes the front end only.

> **This reverses decision 1 in `docs/farm-app-wiring.md`** ("plain pages stay plain"). CLAUDE.md asks for a check before an architecture change, so the decisions at the end need a yes before step N1.

## Where things stand

| Part | Today | Data |
|---|---|---|
| 13 pages in `farm-app/subsidies/*.html` + Acasă (`desktop/2-rail.html`) | Plain HTML + one script per page, the shared `app.js` frame (713 lines, `window.CC`) | **Real.** `/api/me` copy, `Live.read/write`, the engine in the browser, the outbox |
| `engine.js`, `live.js`, `config.js`, `sw.js` | Built by `farm-app/build.mjs` (esbuild IIFE globals) | — |
| `landing-variations/10-harvest.html` | Loads `farm-app/mobile/shared.js` (`window.FF`), Recharts from **unpkg** | **Mock.** English "Farm Futures" sample: `START`, `INPUTS`, `COSTS`, `CROPS`, `COMING`, `RECENT`, `CLEAN`, `RULES` hardcoded in `shared.js` |
| `farm-app/index.html`, `mobile/c-deck.html`, `mobile/compare.html`, `desktop/rail-preview.html`, `desktop/desktop.js`, `desktop/charts.js` | Design explorations | **Mock** (`FF` / inline constants, English) |
| `app.js` `ION` constant | Signed-out farm | Hardcoded, duplicates `docs/data/demo-ion.json` (breaks the "numbers only from `docs/data`" rule) |
| `subsidies/data-calls.js`, `data-sources.js` | Signed-out snapshot of 7 Nov | Real, but frozen |

## The shape of `web/`

```
web/
  package.json            @cropcash/web-next (the name @cropcash/web is taken by apps/web)
  next.config.ts          output: 'export', trailingSlash: true, transpilePackages: ['@cropcash/shared']
  app/
    layout.tsx            <html lang="ro">, fonts via next/font (Figtree), global CSS, <Providers>
    page.tsx              landing (10-harvest), static
    (app)/layout.tsx      the Rail frame from app.js frame(): rail, phone tabs, net banner, notifications
    (app)/acasa/page.tsx
    (app)/subventii/  calendar/  recolte/  prognoza/  salariu/  date-plan/
    (app)/pensie/  bani/  oportunitati/  surse/
    onboarding/page.tsx   login/page.tsx        (no Rail frame, like today)
  components/             Rail, NetBanner, Sheet, Chart (Recharts), PensionChart, PaperUpload, …
  lib/
    live/                 moved from farm-app/live/*.ts (auth, client, functions, farm, monitor, outbox, money-text) + tests
    cc/                   app.js split into typed modules: storage, session, harvests, plan, follows, currency, net
    data.ts               docs/data/*.json → loadData() once, shared by every page
  state/
    FarmProvider.tsx      replaces app.js boot: signed-in copy, refresh, clock, outbox, monitor
    hooks.ts              useFarm, usePlan, useMonitor, useSend, useOnline, useCurrency
  styles/                 shared.css, desktop.css, rail.css, subsidies.css, notifications.css copied as-is
  public/                 img/harvest-*.jpg, contours.svg, manifest, icons
  scripts/write-sw.mjs    post-build: service worker over out/ (from live/service-worker.mjs)
```

**Why static export (`output: 'export'`):**
- The Express API on the VPS already does auth, Stripe and the registry, so Next needs no server.
- Netlify serves a folder, and the offline service worker can cache a fixed list of files, as it does now.
- Server Components still run **at build time**, which is enough for the landing page's Ion figures.
- Limits we accept: no middleware, no server actions, no `next/image` optimisation (use `unoptimized`). None of the pages need them.

**Why the CSS is copied as-is:** the chosen design (Field, Violet & Gold) lives in those five files, and every page uses their class names. Moving to Tailwind or CSS modules would be a redesign. Keep global CSS, and rename nothing.

**URLs:** `/acasa/`, `/subventii/`, … replace `subsidies/x.html`. Links in the pages become `<Link>`. `safeNext` in `auth.ts` gets the new list, and the Supabase redirect URL becomes `/login/`.

## How real data reaches the pages

Today every page script reads `CC.FARM`, `CC.plan`, `CC.monitor` as it loads, and `app.js` reloads the page when the server copy changes. In React:

| Today (`app.js` / globals) | In `web/` |
|---|---|
| `window.CropEngine.buildFarmPlan(...)` etc. | `import { buildFarmPlan } from '@cropcash/shared'`, wrapped in `usePlan()` with `useMemo` |
| `Live.api('/api/me')` → `localStorage['cropcash-me']` → `location.reload()` | `FarmProvider` reads the saved copy first (instant, offline), refreshes in the background, and **updates state** with no reload |
| `Live.read(name, input)` / `Live.write(...)` | Same functions from `lib/live/functions.ts`, given the registry by import (no more "load engine.js first") |
| `CC.send` + outbox | `useSend()` over `lib/live/outbox.ts`, the same queueable list (`record_sale`, `add_expense`, `complete_task`, `reopen_task`) and the same "money never queues" rule |
| `CC.monitor` from `cropcash-monitor` | `useMonitor()`: `search_opportunities`, `list_opportunity_changes`, `list_sources`, `list_recent_changes`, at most once an hour, same key |
| `ION` constant in `app.js` | `docs/data/demo-ion.json`, through `farmForPages` |
| `config.js` (`window.CROPCASH_CONFIG`) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DEMO_MODE`. `publicConfig` keeps its secret-key check and runs in `next.config.ts`, so the build fails on a secret key |
| `data-needs-net` + `app.js` | A `<NeedsNet reason="…">` wrapper over `useOnline()`, with the same behaviour and text |
| `convertText` on printed text | `useCurrency()` plus a `<Money bani={…}/>` component. Pages that print through `CC.lei` move to it |

Signing in stays optional, as now: signed out = the onboarding farm from the browser, or Ion.

### Mock data removed, and what replaces it

| Mock | Replaced by |
|---|---|
| Landing hero, forecast chart, poor/good paths (`FF.START`, `INPUTS`, `F`) | Ion's plan **built at build time** in `app/page.tsx` (Server Component): `buildFarmPlan` + `longForecast` on `demo-ion.json`. The scenario paths come from the same scenarios Prognoză uses |
| Landing "season costs" ring (`FF.COSTS`) | Ion's costs per category from `crops-reference.json` × his hectares |
| Landing crop cards (`FF.CROPS`) | `harvestFigures` per crop for Ion |
| Landing feature cards (`COMING`, `RECENT`, `CLEAN`, `RULES`) | `list_upcoming` / the calendar for Ion. A card with no real equivalent ("cancel subscriptions", "rules") is **removed**, not rewritten with new figures |
| Landing text (English, "Financial Futures", "Farm Futures") | Romanian, CropCash, no banned words. Links go to `/acasa/` and `/onboarding/` |
| `farm-app/index.html`, `mobile/*`, `desktop/rail-preview.html`, `desktop.js`, `charts.js` | Not ported. Moved to `superseded/` at the end |
| `data-calls.js`, `data-sources.js` (signed-out snapshot) | **Decision 4** |

A figure missing from `docs/data` becomes `null` + `DE-VERIFICAT` + an entry in `docs/11-open-questions.md`, per CLAUDE.md, and is never typed into a component.

## Steps

Each step ends with `npm test` green and the new routes working on real data. **`farm-app` keeps running throughout** (`npm run dev:farm`), so there's always a working app until N9.

### N1. Scaffold (small)
- `web/` workspace with Next 15 (App Router), React 19 (the version `apps/web` already uses), TypeScript, `output: 'export'`.
- Root `package.json`: add `web` to the workspaces, `dev:next` (web :5173 + api :3001, the port the API's CORS already allows; run `dev:farm` *or* `dev:next`, not both), `build:next`.
- `vitest.config.ts`: add `web/**/*.test.{ts,tsx}`. `typecheck` picks it up through the workspace.
- Copy the five CSS files and the landing images. Fonts through `next/font/google`.
- Empty `(app)` layout and one placeholder route. `next build` produces `web/out/`.

### N2. Live layer as modules (medium)
- Move `farm-app/live/*.ts` and their tests to `web/lib/live/`. `farm-app` keeps building from the new place: `build.mjs` points at `web/lib/live/index.ts`, so there's one copy.
- `createFunctions` takes the registry directly (`FUNCTIONS` import), not a getter on `window`.
- Env: `NEXT_PUBLIC_*` names. `publicConfig` reads the new names with the old `VITE_*` as fallback, so `.env` keeps working. Update `.env.example`.
- **Tests:** the existing live tests pass from the new path, plus one for the config check in `next.config.ts`.

### N3. `FarmProvider` and the hooks (large; the core of "real data")
Split `app.js` into `lib/cc/*.ts` pure modules with tests, then a client `FarmProvider` on top:
- `session.ts`: signed in or not, the saved `/api/me` copy, `forgetSession`, sign-out clearing every `cropcash-*` key.
- `farm.ts`: the signed-out farm (onboarding copy, or Ion from `demo-ion.json`), `farmForPages`, `farmToday`, `harvestYear` (the demo clock moves every page).
- `harvests.ts`: `loadHarvests`, `saveHarvests`, projects, closed crops, `harvestPlanned` / `harvestActual`.
- `plan.ts`: `previewPlan`, `planItem`, `areaShare`, `cropMonths`, `ownPension`.
- `follows.ts`, `monitor.ts`, `currency.ts`, `net.ts` (online check, `/api/health` every 30 s when it fails).
- `FarmProvider`: opens from the copy at once, refreshes in the background, flushes the outbox in order on load and when the internet returns. A page that changes the farm gets new state with no `location.reload()`.
- **Tests:** each `cc` module (Vitest, node). `FarmProvider` with a fake `api`: copy first, then server; a changed farm updates; a 401 signs out; offline keeps the copy.

### N4. The frame (medium)
`(app)/layout.tsx`: rail + phone tabs from `frame()`, `NetBanner` ("Fără internet. Datele sunt din {data}."), the currency toggle, notifications (`notifications.js` → component), the sign-out link, the palette from storage. Shared pieces: `Sheet`, `Money`, `NeedsNet`, `Chart` (Recharts from npm, with the plain SVG fallback that `chart.js` already has).

### N5. Pages, simplest first (large, split by page)
One page per sub-step. For each: copy the HTML body into JSX, turn the page script's render functions into components, read data from the hooks, keep every class name and every Romanian string as it is. Order (smallest and least shared first):
1. `login` (auth only) · 2. `onboarding` (writes `POST /api/farmers`, papers) · 3. `salariu` · 4. `date-plan` · 5. `subventii` (+ APIA decision, papers) · 6. `calendar` (tasks, follows) · 7. `recolte` (outbox, papers, harvests; the largest) · 8. `prognoza` (chart) · 9. `pensie` (chart, Stripe) · 10. `bani` (Stripe, demo panel) · 11. `oportunitati` · 12. `surse` (document search) · 13. `acasa` (uses almost everything, so last)

`papers.js` becomes `<PaperUpload kind="invoice|cerere|decision">`, used by three pages.

**Check per page:** `/browse` screenshot of the old page next to the new one, signed out and signed in (Ion), at phone and desktop width. No console errors, no NaN, no sideways scroll, and the same figures.

### N6. Landing page on Ion's real figures (medium)
`app/page.tsx` as a Server Component: compute Ion's plan, costs and crops at build time (see the table above) and pass plain numbers to small client components for the animated cards. Recharts from npm, loaded only near the forecast (dynamic import), with the plain fallback kept. Romanian text, CropCash name. **Test:** a snapshot test that the landing figures equal `buildFarmPlan(demo-ion)`, so the page can't drift from the engine.

### N7. Offline (medium)
- `scripts/write-sw.mjs` runs after `next build`: `cacheList(web/out)` + `swSource` from `service-worker.mjs`, same strategy (network first, 4 s timeout, phone copy otherwise, API never cached). Next's hashed `_next/static/*` files are cache-first.
- Registered in `Providers`, with persistent storage requested as before.
- **Test:** the existing `service-worker.test.ts` against an `out/` fixture.
- Offline behaviour per page stays as in the "What each step does offline" table of `farm-app-wiring.md`. Nothing that moves money is queued.

### N8. Rules reach `web/` (small)
- A Vitest scan of `web/app` and `web/components` for the banned words (lichiditate, cash-flow, portofoliu, randament) and for "cam X lei".
- A test that no component holds a money literal (a regex over `*.tsx` for numbers next to `lei` / `bani`), so figures only come from `docs/data` or the API.

### N9. Switch over (small)
- `npm run dev` / `npm run build` → `web` + API. `dev:farm` stays one more week, then goes.
- Click-through of every route, signed out and in, then `seed:demo` + `demo:rehearse` (by you: they write to real Supabase and Stripe).
- Move `farm-app/` (the pages, `vendor/`, `build.mjs`) and `landing-variations/` to `superseded/`. `farm-app/live` is already in `web/lib/live`.
- Update CLAUDE.md (stack, commands, "texts live in `web/app` and `web/components`"), `docs/07` (stack, §8 offline), `docs/10`, `docs/functions.md`, and `farm-app-wiring.md` (point here).
- **Hosting (only if you ask, decision 5):** `netlify.toml` → `command = "npm run build -w @cropcash/web-next"`, `publish = "web/out"`, no SPA redirect, the `NEXT_PUBLIC_*` vars in Netlify, the live address in `CORS_ORIGINS`, and `/login/` in Supabase redirect URLs. Then `apps/web` can move to `superseded/` too.

## Effort

| Step | Size |
|---|---|
| N1, N2, N8, N9 | small–medium |
| N3 | large: `app.js` is the hub, and every page depends on it |
| N5 | the bulk: about 3,500 lines of page JS turned into components |
| N6, N7 | medium |

If time runs short, N1–N4 + N5 (1–7) + N6 already give a Next app with the landing page and the daily screens on real data. `farm-app` covers the rest until it's finished.

## Risks

- **Uncommitted work in `farm-app/`.** Git shows many changed files there. Commit or agree on ownership before N2 moves `live/`, or two copies will diverge.
- **Imperative DOM code → React** can change behaviour quietly (focus, sheets, scroll position, timing of the copy refresh). The per-page screenshot check is the guard, and unit tests don't cover it.
- **No reload on farm change** is new behaviour. Any page state that assumed a fresh load (open sheet, selected harvest) must reset on purpose.
- **Next static export + service worker:** hashed asset names change every build, so the version in `sw.js` must come from `out/`, or phones keep stale chunks.
- **Two front ends for a while** (`farm-app` and `web`). Fixes made in `farm-app` pages during N5 must be copied over. Freeze `farm-app` page work once N5 starts.
- **`apps/web` (React/Vite) stays** because `netlify.toml` builds it, so there will be three front ends in the repo until hosting moves.

## Decisions

Defaults are in bold. Each one changes the work.

1. **Port the pages to React components**, or only wrap the existing HTML and scripts inside Next routes (`next/script` + `dangerouslySetInnerHTML`). Wrapping is faster, but it keeps the globals, so the "call the TypeScript directly" goal isn't met, and client-side navigation breaks scripts that run once per page load.
2. **Static export, the Express API stays**, or a Next server with route handlers replacing parts of `apps/api` (needs Node hosting, not plain Netlify static, and duplicates what Express does).
3. **Keep the five CSS files global and unchanged**, or move to CSS modules / Tailwind (a redesign risk).
4. Signed-out opportunities: **keep the 7 Nov snapshot as JSON imports for now** (as `farm-app` does), or refresh it at build time. A refresh needs a build-only server key or a script, because RLS lets only `authenticated` read `opportunities` (migration 013). The public key can't do it.
5. Hosting: **not in this plan** (as in `farm-app-wiring.md`), or include the Netlify switch in N9.
6. Landing language: **Romanian, CropCash**, like the rest of the app, or keep the English landing for the Stripe judges.
