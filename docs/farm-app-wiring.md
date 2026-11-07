# Wiring the scripts to farm-app

**Status:** plan only. Nothing here is built. Written on 2026-11-07.

**Goal:** `farm-app` becomes the app we run, on live data, and we stop using `apps/web`. Hosting comes later.

`packages/shared`, `apps/api`, `subventii-monitor` and `supabase/` stay as they are, apart from the additions below. This changes the front end, not the back end.

## Where things stand

`farm-app` is static pages in plain JavaScript. It has the design you chose, and it runs the real engine through `engine.js`. It has no login and makes no server calls. Everything it saves stays in one browser.

`apps/web` is React, and it is connected to the API. It's the only front end with login, a saved farm and Stripe.

| Feature | `apps/web` | `farm-app` | Work needed |
|---|---|---|---|
| Login, sign-out | Yes | No | New page |
| Onboarding | Saves to the database | Saves to the browser | Connect |
| Acasă | Real data, Romanian | **Sample data in English** ("Dealu Verde", "Maria") | Rebuild |
| Subsidies | Yes | Yes, richer | Connect |
| Calendar and tasks | Reads the plan | Reads the plan, ticks stay in the browser | Connect |
| Forecast | Yes | Yes, richer | Connect |
| Harvests and crops | No | Yes, browser only | **New storage** |
| Sales and expenses | Yes | Browser only | Connect |
| Plan figures (`date-plan.html`) | No | Balance and expected harvest save everywhere. Pension saves only signed out, W7 adds it signed in | Add |
| Salary | Yes, with "Bine așa" | Calculator only, nothing to accept. The split of a payment comes back in W7, when the money arrives | Add |
| Credit | Add and remove | What-if only | Add |
| Stripe setup, payouts, pension start | Yes | No | Add |
| Bad-year fund, envelopes | Yes | Shows it, can't save it | Add |
| Demo panel (APIA, move the clock) | Yes | No | Add |
| Opportunities and sources | Live | 7 November snapshot | Connect |
| Document search | Yes | No | Add |
| Currency toggle | Yes | No | Add |
| Weather | Yes | No | Add |
| Offline app (step 9b) | Not built | Not built | Build once, here |

## Problems the wiring must solve

1. **Two salaries (fixed in W3).** `farm-app` uses `buildFarmPlan` with a demo pension. Payouts use `computeFarmPlan`. Connected as they are, the screen could promise one salary and Stripe could pay another.
2. **The farmer's own harvest only exists on the phone.** `withFarmerHarvest` changes yields and prices in the browser. The server doesn't know, so its plan would differ too.
3. **Pages expect the farm instantly.** Every page reads `CC.FARM` as it loads. A server call takes time, so loading has to change.
4. **Data with nowhere to go.** The database has no place for harvest years, closed crops, gathered grain (`stored_grain` exists only in the type) or the planting month (`planted_month`, same).
5. **Hand-entered APIA money.** The Recolte form lets the farmer note APIA money. The API deliberately refuses that, because money facts are server-only.
6. **Opportunity matching is written for Ion.** `fitOf` in `oportunitati.js` hardcodes Ion and specific calls. My shared matching works for any farm but knows less. It says DR-14 fits outright, while the page says it needs a PFA or a company.
7. **The rules don't reach `farm-app`.** Its text isn't in `ro.json`, the banned-word test doesn't scan it, and Vitest doesn't run there. `TODAY`, Ion and `mock.js` are hardcoded.
8. **Acasă loads React and Recharts from unpkg,** so it can't work offline.

## How it connects

Keep the plain pages. Rewriting them in React would throw away the design work and solve nothing that a thin layer doesn't.

- **`farm-app/live/`:** TypeScript, bundled by esbuild into `live.js`, the same way `engine.js` is built. It holds the Supabase client, `api()`, and `read(name, input)` and `write(name, input)` over the function registry, so input checks stay shared. The registry comes from `engine.js`, which keeps `live.js` at 227 KB for the login page, so any page that calls a function must load `engine.js` first.
- **`config.js`:** generated at build time from the public values only (Supabase URL, public key, API URL). No secret ever reaches it.
- **Signing in is optional for now.** `login.html` exists for its design, and nothing sends anyone there. Turning the requirement on later is a small change in `app.js`.
- **`app.js`:** every page already loads it, so a signed-in farmer's page opens straight from the saved copy of `/api/me`, then checks the server in the background and reloads once if the farm really changed. `login.html` saves the first copy. No page needed a new script tag, and online and offline take the same path.

| Situation | What `app.js` does |
|---|---|
| Not signed in | Opens as before: the farm from onboarding, or Ion |
| Copy saved, online or not | Opens at once, then checks the server |
| Farm or clock changed elsewhere | Saves the new copy and reloads once |
| Session no longer valid | Forgets the session and reloads, signed out |

The dev command serves `farm-app` on port 5173, so the API's allowed origins don't change.

## Steps

Each step ends with `npm test` green and that part of `farm-app` working on real data. `apps/web` keeps working throughout, so you always have a running app.

### W1. Foundation (small) ✅
`farm-app/live/`, `config.js`, an esbuild script that also rebuilds `engine.js`, and `npm run dev:farm` for `farm-app` plus the API. `esbuild` is a declared dependency and `farm-app` is a workspace, so its code is typechecked and tested. `npm run dev` stays on `apps/web` until W10. No page uses this yet.

### W2a. `login.html` (small) ✅
The same login `apps/web` has today, on the `farm-app` design. Sign-up and sign-in stay on one page, because that's how it already works and the Romanian text exists.

**Files**
- `farm-app/subsidies/login.html`: uses the `ob` and `ob-card` layout from `onboarding.html`, with the shared CSS.
- `farm-app/subsidies/login.js`: the page only: form, modes, messages.
- `farm-app/live/auth.ts`: `signIn`, `signUp`, `signOut`, `getSession`, `authErrorKey`. The page never calls Supabase directly.

It loads only `config.js`, `live.js` and `login.js`. It needs no `boot.js` and no `engine.js`, so it stays fast on a weak connection.

**How it behaves**

| Situation | What the page does |
|---|---|
| Opens already signed in | Goes straight to the app |
| Signs in | Goes to the app, and `boot.js` picks Acasă or onboarding |
| Signs up, no email check needed | Goes to onboarding |
| Signs up, email check needed | Stays, shows "Ți-am trimis un email…", switches to sign-in |
| Clicks the email link | Lands on `login.html`, the session is picked up, goes to the app |
| Wrong password, weak password, account exists, too many tries | Shows the matching message and keeps what was typed |
| No internet | Says login needs internet, and the button still works when it returns |

- **Text:** copy the `auth.*` strings from `ro.json` word for word, plus `offline.needed.login` and `app.tagline`.
- **Form:** real labels, `autocomplete` set to `email`, `current-password` or `new-password`, a minimum of 6 characters, `role="alert"` on errors, 16 px inputs so phones don't zoom, and the button shows "wait" and is disabled while busy.
- **Return page:** `?next=` remembers where the farmer was, but only for page names on a fixed list, so a crafted link can't send them to another site.
- **Nothing is pre-filled,** including for Ion's demo account. Credentials stay out of the code.

**Sign-out** is a link at the end of every page framed by `app.js`, because phones hide the rail, and it shows only when signed in. Acasă gets it in W6, because that page has its own frame. It goes through `login.html?signout=1` and removes every saved `cropcash-*` key (farm, harvests, follows, finished tasks, saved lists). Otherwise the next person on that phone would see the previous farm.

**Old browser data:** farms and harvests saved by the static demo are not imported. They are removed at first sign-in.

**Session expiry:** the session is read locally, so a signed-in farmer can still open the app offline. If the API answers 401 while online, `boot.js` goes to `login.html?next=…`.

**You need to do one thing in Supabase:** add `http://localhost:5173/subsidies/login.html` under Authentication → URL Configuration → Redirect URLs, so the email link lands on this page.

**Tests:** `authErrorKey` for every known code, an unknown code, and offline; the `next` list refusing outside addresses; sign-out clearing every key. Then a browser check of sign-up, email link, sign-in, sign-out, and a phone width.

**Not included:** "Am uitat parola". `apps/web` doesn't have it either, but a farmer who forgets their password is locked out, so it's listed under decisions.

**Offline:** sign-in and sign-up need internet, and the page says so. An existing session opens without it.

### W2b. Loading the real farm (medium) ✅
Real farm from `/api/me` on every page. `TODAY` comes from the farm's clock, so the demo clock moves every page, and the harvest year follows it. Signed out, pages still open on the farm from onboarding or on Ion, and the "exemplul lui Ion" button stays.


### W3. One plan (medium) ✅
`buildFarmPlan` (`packages/shared/src/cashflow/farm-plan.ts`) is the one calculation. `computeFarmPlan` adds the views only the app's cards read, and `apps/web/src/lib/plan.ts` no longer merges anything. The farmer's own harvest and grain in the barn come from `farm.harvests` on both sides. `cashflow/one-plan.test.ts` plays a year and checks that the screen equals the payout on every payday and mid-month.

- **Pension:** a farm on the server uses only its real pension, so a farm with none shows 0, not the demo figure. The plan said "once a plan exists", but the demo figure would make the screen promise less than Stripe pays. Signed out, pages keep the demo figure.
- **Month:** a signed-in farm plans from today's month, like the payout. A signed-out demo and any single-crop or past-year view still start from November of their harvest.

### W4. Storage for harvests (medium) ✅
Migration 014: a `harvests` jsonb column on `farmers` for years, closed crops and gathered grain, `planted_month` on `parcels`, and `harvest_year` on `transactions`. `PUT /api/farmers/me/harvests` (`save_harvests`) replaces the whole document, and `/api/me` returns it.

- Records stay in `transactions`, not in the document. `harvest_year` is only set when a record belongs to another harvest than its date says, and `recordHarvestYear` reads it.
- A crop keeps its planting month when an edit doesn't send one.

jsonb because nothing on the server queries inside it, and RLS on `farmers` already protects it. Separate tables would mean more migrations for no benefit in the demo.

### W5. Everyday writes (medium) ✅
- Onboarding: `POST /api/farmers`. Send the county code, not the name, plus planted months and gathered grain.
- Recolte: `record_sale`, `add_expense`, `undo_transaction`. An edit is undo plus add.
- Calendar: `complete_task`, `reopen_task`, using the shared task ids.
- Remove the hand-entered APIA option (decision 3).

Signed out, pages keep saving in the browser. On a real farm:

- Recolte reads `/api/me` and writes back, and only which project is open stays in the browser.
- A change to the year under way also goes through `update_farm`, so the plan doesn't stay on the old hectares. A planting month can be changed, not cleared.
- Money that arrived through Stripe shows on Recolte, but can't be removed there.
- Each write updates the saved copy before the page reloads, and a change from another device reloads the page once.

### W6. Acasă (large) ✅
Rebuild `2-rail.html` in Romanian on the real plan, replacing the sample farm. It has to cover salary, money on hand, what's coming, tiles and the opportunities card. Bundle Recharts locally. This is the biggest single screen, and it should keep the responsive layout rather than adding a separate phone page.

- `2-rail.html` now uses the same frame as the other pages, and `<base href="../subsidies/">` keeps their links working.
- React and Recharts are in `farm-app/vendor/`, at the versions the design was built on. Prognoză loads them from there too.
- The chart is in `chart.js`, and `CC.planItem` turns a plan entry into a row, so Acasă, Prognoză and Calendar agree.
- The opportunities card reads the saved list until W8.
- The palette picker left with the old frame. A saved palette still applies.

### W7. Money (large) ✅
Rewrite `MoneyCards.tsx` and `ScenarioCards.tsx` as plain pages: Stripe setup, "Bine așa", payouts, pension start and fund, credit add and remove, envelopes, the demo panel. Then the currency toggle and weather.

- `bani.html` ("Contul tău") holds Stripe setup, "Bine așa", salaries paid, a pension summary (W12 moved the pension itself to `pensie.html`), the currency and the demo panel. Salariu stays a calculator. It opens from Acasă and from the end of every page when signed in.
- **No credit and no separate fund card**, by the user's choice on 2026-11-07. The API routes stay. The demo script's "Iau un credit" step needs rewording.
- The demo panel shows only with `VITE_DEMO_MODE=true`, now part of `config.js`.
- The currency works on printed text, through `convertText`, so every page and chart follows it without knowing about it. Form fields and prices per kilo stay in lei.
- Weather is on Acasă, for signed-in farmers. Offline it shows the saved copy.
- A pension already running is changed or stopped on `pensie.html` (W12). `date-plan` still shows it read-only, with a link there.

### W8. Opportunities and sources (medium) ✅
- Delete `data-calls.js` and `data-sources.js`. Load through the F6 reads.
- Move `fitOf` into `matchOpportunityRows`, so the page's stricter rules (PFA or company, institutions only, guide conditions) work for any farm, with tests. Keep the page's layout, including merged rows and its groups.
- Add `list_sources` fields the page needs (id, type, problems), real changes in place of the examples, document search on `surse.html`.
- Follows go through `follow_opportunity`, and the calendar reads them from the farm.

As built:
- **The snapshot files stay, for signed-out visitors only**, by the user's choice on 2026-11-07. Signed in, `app.js` loads `search_opportunities`, `list_opportunity_changes`, `list_sources` and `list_recent_changes` on Acasă, Oportunități and Ce s-a schimbat (at most once an hour), saves a copy in `cropcash-monitor` and reloads when it changed. Pages read through `CC.monitor`, never `window.CALLS`. The copy's date shows on both pages.
- `matchOpportunityRows` now returns `forYou`, `check` and `notForYou`, each row with a `level` (`near`, `firm`, `check`, `no`) and new reason codes: `needs_company`, `firms_only`, `institutions_only`, `partnership`, `other_region`, `not_for_farms`. An age limit or another sector now rules a call out instead of asking to check it. The guide conditions moved from `guides.js` to `docs/data/funding-guides.json`. The page matches calls itself with `pageFits` (`farm-app/live/monitor.ts`), so it works for any farm and offline.
- `list_sources` returns `id` and `type`; problems are the sources in a state the monitor can't read. `list_recent_changes` returns `shortDiff`. The invented changes in `mock.js` are gone.
- Signed in, follows are saved on the farm and need internet; a refused one says so and nothing changes. Signed out they stay in the browser. The calendar and notifications use `CC.followedCalls()`, which keeps a followed call that left the list.
- The application counts AFIR publishes ("Dosare depuse") exist only in the snapshot: the monitor doesn't store them, so signed-in pages leave that tile out.

### W9. Offline (medium) ✅
Step 9b, built here: service worker, cached pages, outbox for sales and expenses. Anything that moves money never enters the queue. Actions that need internet get one shared disabled state with a short reason.

As built:
- **Service worker:** `build:farm` and `dev:farm` write `farm-app/sw.js` (gitignored, from `live/service-worker.mjs`) with every page, script, style and the vendor files, about 2 MB, and a version that changes with them. Pages and scripts are network first, with the phone's copy when the network fails or takes over 4 s, so edits show at once in development. Google Fonts are kept once fetched. The API is never cached by it: the pages keep their own copies of the farm and the monitor. `app.js` registers it and asks for persistent storage.
- **Outbox:** `CC.send` queues `record_sale`, `add_expense`, `complete_task` and `reopen_task` when there's no internet, or when the write fails on the network, in `cropcash-outbox` (localStorage, like every other copy in farm-app, rather than IndexedDB as docs/07 says). `withOutbox` (`live/outbox.ts`) lays the queue over the farm copy, so Recolte, the plan and the salary count it at once. A banner says it's waiting and that the salary is provisional. The queue goes out in order on load and when the internet returns. One the server turns down (4xx) is kept aside and the banner asks to note it again. "Șterge" on a queued record takes it out of the queue. Every other write is refused offline. No page needed changing for this, recolte.js included.
- **Is the internet there:** `navigator.onLine` plus a failed `/api/health`, checked again every 30 s while it fails. `CC.isOnline()`.
- **Shared disabled state:** a button with `data-needs-net="reason"` turns off without internet and shows the reason under it. It never turns on a button the page turned off itself. Used on Contul tău, following a call, and document search.
- **Banner:** signed in and offline, "Fără internet. Datele sunt din {data}.", warning after 7 days. The page notes no longer carry a fixed date.
- Signing out already clears every `cropcash-*` key, the outbox included.
- **Known limit:** if a write reaches the server but its answer is lost, the outbox sends it again, so a sale could be counted twice. The API has no idempotency key yet.

### W10. Switch over locally (small) ✅
Hosting is out of scope for now, so `farm-app` becomes the app you run, not yet one that's deployed.

- `npm run dev` and `npm run build` cover `farm-app`, including `live.js`, `engine.js` and `config.js`.
- Delete `mock.js` and the sample data. Remove what's left of the "date ilustrative" labels.
- Stop using `apps/web`, once one full click-through passes. **Leave the folder where it is,** because `netlify.toml` still builds it and moving it would break that build.
- Update `CLAUDE.md`, `docs/07`, `docs/10`, `docs/functions.md`. Run `seed:demo` and `demo:rehearse`.

As built:
- `npm run dev` runs farm-app and the API (`dev:farm` is the same). `npm run build` builds farm-app (engine.js, live.js, config.js, sw.js) and the API. The old interface is `npm run dev:web` and `npm run build:web`; `netlify.toml` still builds it, untouched.
- `mock.js` is deleted, with its script tags. Nothing shows "date ilustrative" any more: the sample past harvest is gone (a copy saved by an older version is dropped on load), signed-out follows start empty, and Subvenții shows only real APIA state (by wifey-f1).
- Click-through: all 13 pages, signed out and signed in, with no console errors, no NaN and no sideways scroll, the real API routes behind them.
- Docs: CLAUDE.md (stack, commands, rules), docs/07 (stack table, offline §8), docs/10 (a closing note), docs/functions.md (the `api` offline row).
- **Still to do, by you:** `npm run seed:demo` and `npm run demo:rehearse`, which write to the real Supabase and Stripe.

### W11. Papers (medium) ✅
One upload flow, `farm-app/subsidies/papers.js`, used by three buttons. No "Documente" tab.

- `POST /api/documents/read` (`read_document`): needs a session, its own body limit, magic-byte checks, a daily limit per farmer (in memory). Claude reads the paper with a Zod schema; amounts and areas come back as text and are turned into bani and ari in `packages/shared/src/documents`. No name, CNP, IBAN or address in the schema. The file is never stored or logged.
- **Recolte**, „Fă o poză la factură”: an invoice fills an expense, a sale paper fills a sale. Nothing is saved until „Salvează”.
- **Onboarding**, new step after the county: a cerere fills the hectares, a decision also keeps its total. „Sar peste” goes on as before.
- **Subvenții**, under the range: „Ai decizia de plată? Pune suma reală”. The farmer checks the total, sees the salary change, and confirms. It is saved as `farmers.apia_decision` (migration 016) and `farmSubsidies` puts it into the plan in place of the range. It is expected money, never a transaction.
- Not built: diesel-specific fields (after step 10a; a diesel invoice is an expense with category diesel today), the adeverință on Salariu, the Acasă photo action.

### W12. Pension page (medium) ✅
One page, `farm-app/subsidies/pensie.html` ("Bătrânețe"), for the screen Î3 and what follows it. No new tab on phones.

- **The salary effect:** `whatIfPension` (`what_if_pension`) builds the plan again with another monthly amount, so the screen shows the salary the payout will pay.
- **Change and stop:** `PUT /api/pension` swaps the subscription price from the next invoice, with no proration. `DELETE /api/pension` cancels now and keeps what was paid. Starting, changing or stopping fixes `salary_bani` again (docs/08 §1c). `npm run test:stripe` covers both.
- **The page:** the amount at 65 at the top, the slider with the suggestion and the salary change, start or change and stop behind a confirm sheet, payments so far, the fund list A to Z, the growth chart, and "De ce nu Casa de Pensii?".
- **Growth chart:** `pensionPath` gives the amount year by year at 2%, 4% and 6%, ending on the same sums as the top of the page. `pension-chart.js` draws it like the main chart: buttons pick the solid line, the other two are dotted, a thin line shows what the farmer puts in. Recharts when it loads, plain SVG otherwise. The amount at the top stays on 4%. The three totals stay as a list under the chart.
- **"De ce nu Casa de Pensii?":** `pensionOptions` with `docs/data/pension-options.json` and `pension-funds.json`. Under Pilonul III, every fund A to Z with its smallest monthly payment; unconfirmed ones say "de verificat". No line per fund on the chart: there's no sourced growth per fund, and the app doesn't pick a fund (docs/05 §3).
- **Links:** the desktop sidebar, the Acasă tile, the pension card in Contul tău (now only a summary), the Salariu breakdown and the plan figures.
- **Signed out:** the slider works on the example pension and the button asks to sign in.
- Not built: skipping a month (open question 13). The button shows, disabled, with "vine mai târziu".

### Later: hosting
Not planned yet. `netlify.toml` and `docs/12-deploy.md` stay as they are, so a deployed site keeps showing `apps/web`. When this comes back, it needs a new publish folder, no single-page redirect, a `config.js` built from the hosting settings, the live address in `CORS_ORIGINS`, and the live login address in Supabase. Then `apps/web` can move to `superseded/`.

## What each step does offline

| Step | Without internet |
|---|---|
| W2a | Sign-in needs internet; an existing session still opens |
| W2b | Opens from the saved copy |
| W3 | The plan is calculated on the phone from that copy |
| W4 | Nothing on a screen yet; the save needs internet |
| W5 | Sales, expenses and ticked tasks queue in the outbox and count at once |
| W7 | Money actions are disabled, never queued |
| W8 | Shows the last saved list and its date |
| W9 | Pages open from the service worker; buttons that need internet say why |
| W11 | Paper buttons are disabled with a short reason; typing by hand still works. Photos are not queued |
| W12 | The page, the slider and the chart work from the saved copy; start, change, stop and the fund choice are disabled with a reason, never queued |

## Risks

- **Other sessions are editing `farm-app`.** Much of it is uncommitted. Agree who owns which file before steps that change a shared page.
- **Salary figures can shift in W3,** when the phone and the server start agreeing. Tests that pin amounts may need a reviewed update.
- **W6 and W7 are the bulk of the work.** If time runs short, W1–W5 plus W8 give a connected app, but without Stripe. The money demo would need W7.
- **`apps/web` work done from now on is throwaway,** including the F6 card and sheet. The F6 API and shared logic stay.
- **Browser checks are manual** unless we add a smoke test. Unit tests don't cover the pages.

## Decisions

Defaults are in bold. Each one changes the work.

1. **Plain pages stay plain** (rather than moving them into React).
2. **Text:** **keep it in the pages, scan them for banned words, and change the `ro.json` rule**, or move all of it to `ro.json`, which is a lot of edits for little gain.
3. **APIA money:** **remove the hand-entered form, so it only arrives through the server**, or allow a noted entry and relax the money rule.
4. **Requiring login:** off for now, by your choice. Pages open signed out. Decide before the demo whether it comes back.
5. **Harvest storage:** **jsonb on `farmers`**, or separate tables.
6. **Name:** the pages say "Farm Futures" and the docs say "CropCash". **CropCash** until told otherwise.
7. **"Am uitat parola":** **add it after W2a as a small follow-up**, or leave it out for the demo. It needs a second email link and a page to set the new password.
