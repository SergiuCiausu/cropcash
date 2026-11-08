# Plan: required sign-in, Ion's farm on its own route, and loading skeletons

Status: plan only, nothing built yet. Code in English, UI text in Romanian with diacritics.

## What the app does today (the facts the plan builds on)

- `web/` is a **static export** (`output: 'export'`). There's no server and no middleware. Every link is a plain `<a>`, so each page is a full page load.
- Each `app/<page>/page.tsx` renders an **empty HTML shell**: ids like `#h-amount` and `#m-list` with no content. `LegacyPage` then runs `boot()` (`web/lib/boot.ts`) in `useEffect`. Boot imports the engine, sets the globals and runs `web/legacy/*.js`. `app.js` wraps `<main>` in the Rail frame and the page script fills the ids. Until that finishes, the farmer sees a blank or half-built page. That gap is the loading state we need to cover.
- Next's `loading.tsx` **would not help here**. In a static export the page HTML is prerendered and nothing suspends, so the fallback never shows. The skeleton has to be part of the static HTML and go away when `boot()` finishes.
- Who the farm belongs to is decided in `legacy/app.js:80-89`:
  - Signed in with a saved copy of `/api/me` → `me`.
  - Otherwise, a farm saved in localStorage by `/onboarding` (`cropcash-farm`).
  - Otherwise **Ion** (`window.__ION`, built by `boot.ts` from `docs/data/demo-ion.json`).
  - Signed in but with no copy yet, the pages also fall back to Ion. With sign-in required, that becomes a bug.
- The landing page (`app/page.tsx`) has three "Vezi ferma lui Ion" links to `/acasa` (nav, hero, final section), and the footer links to `/acasa`, `/prognoza`, `/recolte` and `/salariu`.
- Onboarding works signed out today: "Folosește exemplul lui Ion", and the farm is saved only on the device (`onboarding.js:63,81,125,181`).
- App paths are hard-coded: about 50 in `web/legacy/*.js` (14 files) and 12 in the JSX of `app/*/page.tsx`. `app.js` finds the current page from the **last** path segment (`PAGE`, `frame()`), so `/ferma-lui-ion/salariu` already resolves to `/salariu`.
- `web/scripts/write-sw.mjs` adds a route only for top-level `*.html` (`!f.includes('/')`). Nested pages like `ferma-lui-ion/salariu.html` would be cached as files, but not under the address people open.

---

## Part A: routes, with Ion under `/ferma-lui-ion/[page]`

### A1. One body per screen, used by both routes
Move each page body into `web/screens/<name>.tsx`, exporting `{ title, themeColor, scripts, Body, Skeleton }`. The CSS imports move with it.
- `app/<name>/page.tsx` (the farmer's app) becomes a thin wrapper: `<Screen name="salariu" mode="farm" />`.
- `app/ferma-lui-ion/[page]/page.tsx` wraps the same screens with `mode="demo"`:
  - `generateStaticParams()` returns the demo pages, with `dynamicParams = false`.
  - `generateMetadata()` takes the title from the screen.
  - The static export writes `out/ferma-lui-ion/salariu.html` and the rest.
- `app/ferma-lui-ion/page.tsx` redirects on the client to `/ferma-lui-ion/acasa`, the same way `/` → app links work today.
- **Demo pages:** acasa, subventii, oportunitati, surse, calendar, prognoza, recolte, salariu, pensie, date-plan, bani (with mock data, see Decisions).
- **Not in the demo:**
  - `login` and `onboarding`.
- Before writing this, read `web/node_modules/next/dist/docs/` on `generateStaticParams` with `output: 'export'`, because AGENTS.md warns this Next version differs.

### A2. A path helper (pure, tested)
Add `web/lib/paths.ts`:
- `DEMO_BASE = '/ferma-lui-ion'`
- `isDemoPath(pathname)`
- `appHref(path, mode)`, which adds the prefix in the demo and keeps a `#hash`
- `pageOf(pathname)`, the logic `app.js` repeats 3 times

`boot()` sets `window.__MODE = 'demo' | 'farm'` from the path and exposes `window.CC.href`.

Then replace the literal hrefs:
- In `web/legacy/*.js`: `href="/recolte"` → `href="${CC.href('/recolte')}"`, and `location.href = '/recolte#cultura'` → `location.href = CC.href('/recolte#cultura')`.
- In the screen JSX: `<AppLink href="/calendar">`, a small component that reads the mode from context.
- `TABS`/`PAGES` in `app.js` go through the helper too.

**Guard test:** `lib/paths.test.ts` scans `web/legacy/*.js` and `web/screens/*.tsx` for app paths used without the helper, just as `language.test.ts` scans the UI text, so a new link can't slip back into the demo unprefixed.

### A3. `app.js` with two modes
- **demo:**
  - The farm is always `ION`. Ignore `cropcash-me` and `cropcash-farm`, even when someone is signed in, so a signed-in farmer can still open Ion's farm.
  - Ion's harvests, follows and pension get their own localStorage keys (`cropcash-demo-*`) so they never mix with a real farm. They still start with `cropcash`, so sign-out still clears them.
  - No `refreshFarm`, `refreshMonitor`, `ping` or outbox flush.
  - Writes stay local, as they are signed out today. Nothing goes to the API.
  - The Rail's farm box loses "Schimbă ferma" and the sign-out row.
  - Add a demo strip at the top of `<main>`: "Te uiți la ferma lui Ion, un exemplu. Nimic de aici nu e al tău." with a "Fă-ți cont" button → `/login?mode=register`.
  - Any `data-needs-net` money button is hidden in the demo.
- **farm:**
  - `me` is required. Remove the `saved` and `ION` fallbacks from `BASE_FARM`.
  - The "no copy yet" case is handled by the guard (A4) before `app.js` runs.

### A4. The sign-in guard (client side, works offline)
There's no server, so the guard runs at the start of `boot()` for farm-mode pages, before any page script:
1. No `sb-*-auth-token` in localStorage → `location.replace('/login?next=<page>')`. This check is synchronous and works offline.
2. Session but no `cropcash-me`:
   - Online: `Live.landingPage(next)`, which saves the copy, or sends a farmer with no farm to `/onboarding`.
   - Offline: show a full-page message, "Pornește internetul o dată ca să-ți aducem ferma.", with a retry button.
3. Otherwise the page starts.

Keep the decision pure and tested: `guardTarget({ hasSession, hasFarmCopy, online, path }) → 'start' | { redirect } | 'need-net'` in `web/lib/live/auth.ts`, next to `safeNext`. A `401` from `refreshFarm` already signs out and reloads, and the guard then sends the farmer to `/login`.
- `safeNext`'s `RETURN_PAGES` gets `/pensie`, `/date-plan` and `/bani`.

### A5. Onboarding and login
- `/onboarding` requires a session, through the same guard but with no farm copy needed.
- Remove the signed-out branches:
  - "Folosește exemplul lui Ion" (`data-ion`)
  - "Rămân doar pe acest dispozitiv."
  - `CC.saveFarm` for signed-out farms
- `/login`:
  - Supports `?mode=register`.
  - Gets a "Vezi întâi ferma lui Ion" link → `/ferma-lui-ion/acasa`.
  - After `?signout=1` it stays on the login form, as it does now.
- `papers.js`'s "Intră în cont ca să încarci hârtia" can't be reached signed out anymore. Remove the branch.

### A6. Landing page (`web/app/page.tsx`)
- **Nav:**
  - The `btn-dark` "Vezi ferma lui Ion" becomes **"Intră în cont"** → `/login`.
  - "Vezi prognoza" stays as it is.
- **Hero:**
  - The primary button becomes **"Fă-ți cont"** → `/login?mode=register`.
  - The secondary button becomes "Vezi ferma lui Ion" → `/ferma-lui-ion/acasa`, replacing "Cum merge", which the nav already has.
- **Final section:**
  - Heading: "Începe cu ferma ta".
  - Lead: "Îți faci cont cu emailul. Dacă vrei să vezi întâi cum arată, uită-te la ferma lui Ion."
  - Buttons: "Fă-ți cont", plus a line button to Ion's farm.
  - Remove "Fără cont și fără bancă", which is no longer true.
- **Footer "Aplicația":** the links go to `/ferma-lui-ion/*` and the heading becomes "Ferma lui Ion".
- **Signed in:** `landing.js` swaps the nav CTA for "Mergi la ferma ta" → `/acasa`. It reads the same localStorage check, so this works offline.

### A7. PWA and offline
- `write-sw.mjs`: add routes for nested pages (`ferma-lui-ion/salariu.html` → `ferma-lui-ion/salariu`), and add a case to `service-worker.test.ts`.
- `manifest.webmanifest` `start_url` stays `/acasa`. The guard sends an installed app without a session to `/login`.
- **Offline behaviour:**
  - The demo works fully offline.
  - The farmer's app works offline once the session and farm copy are saved.
  - Login and the first farm load need internet and say so.

---

## Part B: loading skeletons

### B1. Booting and ready
- `LegacyPage` renders `<div class="boot-skel" aria-hidden="true">{skeleton}</div>` before `children`, and puts `aria-busy="true"` on `<html>`.
- `styles/skeleton.css`:
  - While booting, the skeleton is `position: fixed; inset: 0` over the page background, and `<main>` is `visibility: hidden`. It is not `display: none`, so Recharts and the layout still measure real sizes.
  - `html[data-ready]` fades the skeleton out (120 ms opacity) and shows `main`.
- When the last script returns, `boot()` sets `document.documentElement.dataset.ready = ''` and removes `aria-busy`. The farm-mode guard runs **before** this, so a redirect never flashes the page.
- **Boot fails** (today it's only `console.error`): swap the skeleton for an error state, "Pagina nu a pornit. Încearcă din nou.", with a reload button. Offline, the text is "Nu ai internet și pagina nu e salvată pe telefon încă."
- **No JS:** a `<noscript>` line, plus a CSS rule that hides the skeleton when scripting is off (`@media (scripting: none)`).
- **Reduced motion:** with `prefers-reduced-motion: reduce`, the blocks don't shimmer.

### B2. Skeleton parts (`web/components/skeleton/`)
- **Primitives:** `<Bone w h r />` (a block), `<BoneText lines />`, `<BoneCard span="s5|s7|s12" />`. They use only the existing tokens (`--surface`, `--hair`, `--surface-2`) and the existing radii, so dark mode and both palettes follow.
- **`<RailSkeleton>`:**
  - The desktop rail: logo, 7 tab rows and the farm box.
  - On phones, the `m-top` bar.
  - It matches `rail.css` sizes, so nothing jumps when `app.js` builds the real frame.
- **`<PageHeadSkeleton>`:** an h1 bar and a lead line.

### B3. One skeleton per screen, matching its bento
Each `screens/<name>.tsx` exports its `Skeleton`, built from the page's real grid classes (`bento`, `s5/s7/s12`):

| Screen | Skeleton |
|---|---|
| acasa | hero card with big number + button, 3 KPI cards, calendar list (4 rows), opportunities list (3 rows) |
| subventii | subnav pills, total card, 2×2 measure cards, "next steps" list |
| oportunitati / surse | subnav, filter chips, 6 list rows |
| calendar | month strip, 6 deadline rows |
| prognoza | year-pick segmented control, big chart block, 3-figure row, records list |
| recolte | harvest chip, crop tabs, form card, records table (5 rows) |
| salariu | hero (eyebrow, amount, year-pick), sums card (s5), months list (s7, 6 rows), assumptions card |
| pensie | hero amount, chart block, plan card |
| date-plan | form card with 4 fields |
| bani | balance card, 2 action cards, transactions list |
| login / onboarding | the `ob-card` with title, 2 fields and buttons (no rail) |
| landing | not needed: its HTML is already the content. Only the charts get a block (B4). |

### B4. Loading inside a page (after boot)
These parts fill in later, after the page is ready, so each gets its own placeholder. Each one ends in content, an "offline" message or an error. None of them spins forever.
- **Acasă weather** (`acasa.js:120`): bones instead of "Se încarcă vremea…".
- **Charts** (prognoza, pensie, landing forecast): a chart-sized bone until Recharts mounts (`__loadRecharts`).
- **Background refresh** (`refreshFarm`, `refreshMonitor`): no skeleton, because the saved copy is already on screen. A reload only happens when something changed, as it does now.
- **Onboarding paper reading** (Claude call) and **money actions** in `bani`: the button gets a busy state ("Așteaptă puțin…" + `aria-busy`), like the login submit.

---

## Steps (each ends with `npm test` and `npm run typecheck` green)
- [x] 1. `lib/paths.ts` + tests (helper, `pageOf`, and a scan for hard-coded links that freezes today's list so no new one appears; step 2 empties the list).
- [x] 2. Swap the hrefs in `legacy/*.js` and the page JSX for the helper, until the scan passes. No behaviour change yet.
- [x] 3. `web/screens/*` + thin `app/<name>/page.tsx`. Check that `npm run build:web` output is unchanged.
- [x] 4. `app/ferma-lui-ion/[page]` + demo mode in `boot.ts`/`app.js` (namespaced keys, demo strip, no sync), and `write-sw.mjs` nested routes + test.
- [x] 5. `guardTarget` + tests, the guard in `boot()`, `app.js` without signed-out fallbacks, and onboarding/login/papers clean-up.
- [x] 6. Landing page buttons, footer and the signed-in CTA.
- [x] 7. Skeleton CSS + primitives + `LegacyPage` booting/ready/failed states.
- [x] 8. One skeleton per screen (B3), then the in-page placeholders (B4).
- [ ] 9. Check in the browser (`/browse`), at phone and desktop widths, in light and dark, online and offline:
   - signed out `/acasa` → `/login`
   - `/ferma-lui-ion/salariu` while signed in still shows Ion
   - no frame jump when the skeleton leaves
- [x] 10. Docs: `07-architecture.md` §8–§9, `06-features-mvp.md`, `09-demo-pitch.md` (the demo opens `/ferma-lui-ion/acasa`, and the Stripe part signs in as `DEMO_EMAIL`), `10-plan.md` and CLAUDE.md.

## What differed while building
- The skeletons are all in `web/components/skeleton/screens.tsx`, not in each `screens/<name>.tsx`, because the React port rewrites those files. A screen with no skeleton is a type error.
- Login has no skeleton: its form is already complete in the static HTML. Onboarding has one (`FlowSkeleton`).
- B3's table described pages that had changed. The skeletons follow the real layouts (Calendar is a month grid, for example).
- Decision 3: the only mock value in `docs/data/` is `demo_account.payouts_shown`. Every amount on Ion's `bani` page comes from his plan (`web/lib/demo-account.ts`), which keeps them from disagreeing with the other pages.

## Decisions (2026-11-08)
1. **"Ferma lui Ion" is the local demo** from `docs/data/demo-ion.json`: no account, offline. The seeded `DEMO_EMAIL` account stays for the live Stripe part of the pitch, through `/login`.
2. **Visitors can change Ion's farm**, saved only on their device (`cropcash-demo-*`), with a "Pornește din nou" button that clears it.
3. **`bani` is in the demo, with mock data** (balance, the money pots, payouts, transactions) instead of Stripe. Following the rules, the mock figures live in `docs/data/` (a `bani` section for Ion), not in the page. Every action that moves money is disabled there and says it's an example. So the demo pages are the 10 above **plus `bani`**.
