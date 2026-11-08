# UX Build Plan: all findings from `ux-cx-plan.md`

**Date:** 2026-11-08 · **Sources:** `ux-cx-plan.md` (F-01 to F-36), `docs/07-architecture.md`, `docs/functions.md` §17–18, `docs/10-plan.md`, and the current code.

This is the order, the files and the "done when" for all 36 findings. Nothing here has been built. Hours are one person's working time and are estimates.

## Overview

| Phase | What | Findings | Hours | Needs |
| --- | --- | --- | --- | --- |
| A | Shared pieces and data safety | F-01, F-02, F-19, F-08, F-12, F-13, F-20 | ~8.5 | web and shared only |
| B | First run | F-04, F-14, F-06, F-03 | ~7 | one Supabase setting and email template |
| C | Demo polish and honesty | F-07, F-09, F-10, F-11, F-15, F-16, F-17, F-18, F-24, F-22 | ~12 | web only |
| D | Reach outside the app | F-21, F-23, F-30 | ~6 | web and shared only |
| E | Bigger screen changes | F-27, F-28, F-26, F-32, F-25, F-29, F-31 | ~24.5 | API deploy for F-27, F-28 |
| F | Needs a decision or new backend | F-05, F-34, F-35, F-33, F-36 | ~38 | decisions below, migrations, VPS deploy |

**Total: about 96 hours.** Phases A to C (about 28 hours) contain everything recommended before the demo. If time is short, stop after step C2.

**Why this order:** A builds the parts several later steps reuse, and fixes wrong money first. Files touched repeatedly (`Onboarding.tsx`, `Recolte.tsx`, `Frame.tsx`) are worked on in one pass where possible. F-05 is "Fix now" by severity but sits in phase F because it needs facts only the team has. It must ship before the first real user.

## Rules for every step

From `CLAUDE.md`:

- After each step: `npm test` green, tick the step here, one sentence of status. **No commit unless asked.**
- UI text in Romanian with diacritics. No banned words (`web/lib/language.test.ts`). No "cam X lei".
- No hardcoded figures. New numbers go in `docs/data/*.json`, or `null` + `DE-VERIFICAT` + an entry in `docs/11-open-questions.md`.
- Money in integer bani. Pure logic in `packages/shared`, with tests.
- Links through `appHref` / `PageLink`, keys through `storageKey`.
- Each feature states what it does offline. Buttons that need internet get `data-needs-net` (`NetButton`). Money moves never enter the outbox.
- A new app screen goes in `SCREENS` with a skeleton, and every path calls `markReady()`.

Steps that change a screen's layout also update its skeleton in `web/components/skeleton/screens.tsx`.

## Decisions needed

Each changes what gets built. Steps not listed here can start now.

| # | Decision | Blocks | Recommendation |
| --- | --- | --- | --- |
| Q1 | **Helper accounts contradict a written decision.** `docs/functions.md` §18 says the daughter has no account and sharing uses the phone's share menu. | F-36 | Don't build F-36 yet. Ship F-30, which implements §18, then decide from the research in `ux-cx-plan.md`. |
| Q2 | Where to record "balance unknown". `docs/06-features-mvp.md` O3 says skip = 0. | F-27 | Optional `balanceUnknown` in the `farmers.harvests` document: no migration and no change to the salary calculation. Update doc 06. |
| Q3 | Privacy page content: who the operator is, a contact, and how long data is kept. These can't be invented. | F-05, F-34 | Team supplies the facts. Get the text reviewed before real users. |
| Q4 | Delete now or after a grace period. | F-05 | Immediate delete after typed confirmation, since the only stated need is the right to leave. Add a grace period only if support exists. |
| Q5 | Analytics tool. | F-34 | Own `events` table behind one API route: no new vendor, disclosure stays simple, and it deletes with the account. |
| Q6 | Reminder channel. iPhone push needs an installed app, and SMS costs money per message. | F-33 SMS part | Build push and "Mesaje" now, as `docs/functions.md` §17 specifies. Add SMS only after the channel pilot. |
| Q7 | Who answers help requests, on what number or address. | F-35 | Name one person and a WhatsApp number, stored in `docs/data`. |

## Phase A: Shared pieces and data safety

- [x] **A1. Amount parser (F-01)** · ~1.5 h
  - **Add:** `parseWholeLei(text): number | null` in `packages/shared/src/money/index.ts`. Strips `lei`/`ron` and all whitespace, including non-breaking spaces. A dot or comma before exactly three digits is a thousands mark. A trailing `,00` is allowed. Anything else, such as `12,5` or `1.2.3`, returns `null`. Returns `0` for zero, which `parseLeiText` can't do, so `parseLeiText` stays for papers.
  - **Replace:** `Onboarding.tsx:30,122,128` and the dot-stripping at `:349`; `Recolte.tsx:41` (record form and opening balance) and `:50`; `DatePlan.tsx:21`. Onboarding hectares keep their own decimal parser.
  - **Echo:** a small `AmountEcho` under each lei field: "Adică 35.000 lei".
  - **Tests:** table in `money.test.ts` (`35 000`, `35.000`, `35,000`, `35000 lei`, `35 000,00`, `12,5`, `1.2.3`, NBSP, `0`), plus Onboarding and Recolte cases in `pages.test.tsx`.
  - **Offline:** purely local.
  - **Done when:** `35 000` saves as 35.000 lei in both forms, and an unreadable amount shows the existing error.

- [x] **A2. Safe sheets (F-02, F-19)** · ~3 h
  - **Change `Sheet` in `web/components/app/bits.tsx`:** add `locked` (ignore backdrop, Escape and Back) and `keepOnBackdrop`. Handle the dialog's native `cancel` event so Escape respects `locked`.
  - **Add `useSheetHistory`:** on open, `history.pushState({ ...history.state, ccSheet: true }, '')`, spreading the existing state because the Next.js router keeps its own there. Back closes the sheet. Closing by button calls `history.back()` only if the current entry is still the sheet's, so navigating from a link inside a sheet leaves history clean. `PaperSheet` in `Papers.tsx` uses the same hook.
  - **Locked while busy:** `AskSheet` (`Pensie.tsx`), split sheet (`Bani.tsx`), `ConfirmSheet` (`Recolte.tsx`). Disable "Renunță" and "Mai târziu" while busy. An unknown outcome leaves the sheet open on its message, with "Închide" available.
  - **`keepOnBackdrop`:** the sheets with inputs in `Recolte.tsx` (gathered, planted, edit, own crop) and `Surse.tsx` (add source). Back still closes them and loses the typing, which is accepted.
  - **Tests:** in `pages.test.tsx`, backdrop and "Renunță" do nothing during a pending send. Check Back by hand on Android Chrome.
  - **Done when:** no money sheet can close mid-request, and Back closes a sheet instead of leaving the page.

- [x] **A3. Honest buttons (F-08, F-12)** · ~0.5 h
  - **`Pensie.tsx`:** add `yes` to `Ask`. Labels: "Da, pornesc cu X lei", "Da, schimb la X lei", "Da, opresc pensia". Stop gets a distinct style. The CSS has no danger button yet, so add one.
  - Remove the disabled "Sar o lună" and its note (`:212-216`). `Bani.tsx:209` links to Datele planului. `Bani.tsx:188` becomes "Activează contul"; the "simulat" note in the page lead stays.

- [x] **A4. Saved, with effect, and undo (F-13, F-20)** · ~3.5 h
  - **Toaster:** let `Message.action` carry a function as well as a link, and add an `onExpire` callback fired when the toast's timer really ends (it pauses while read).
  - **Add** pure `salaryEffectText(beforeBani, afterBani, money)` in `web/lib/ui/messages.ts`, and a `useSaved()` hook that reads the salary before a save and notifies after it. A queued write says "Se trimite când ai internet." `store.send` needs to report whether it queued.
  - **Across a page load:** a one-shot message under `storageKey('cropcash-flash', mode)`, read by `Frame` on mount, for `DatePlan.tsx:133`.
  - **Call sites:** Recolte (record, gathered, planted, edit), Pensie, Bani (split, setup), DatePlan.
  - **Undo:** `Recolte.tsx` `undo` hides the row and shows "Am șters. Anulează". The real delete runs on `onExpire`, or at once if the page unmounts. A closed tab leaves the record in place, which is the safe direction.
  - **Tests:** `salaryEffectText` cases; undo restores the row and sends nothing; expiry sends one `undo_transaction`.
  - **Offline:** both the toast and delayed delete work through the outbox as now.

## Phase B: First run

- [x] **B1. Onboarding rework (F-04, F-14, F-06)** · ~4 h, one pass over `Onboarding.tsx`
  - **F-04, pre-fill:** seed name, age, county, hectares and balance from `farm.me`. In edit mode, change the heading, hide "Nu știu, sar peste" and keep the saved balance if untouched.
  - **Also fix, found while planning:** own-crop parcels are filtered out at `:61` and `:81`, so an edit also removes custom crops from the year. Carry them through unchanged.
  - **Phone entry:** "Schimbă datele fermei" in Contul tău (`Bani.tsx`), not shown on Ion's farm.
  - **F-14, Back and reload:** `pushState` per step, `popstate` restores the step. Draft in `localStorage` under `storageKey('cropcash-onboarding-draft', mode)`, which sign-out already clears, removed after save. After the save, Back from the result goes to `/acasa` instead of re-entering the form.
  - **F-06, result:** after saving, read the plan through `useView('farm')`. Lead with "Salariul tău: X lei pe lună" and the next money date, with the APIA sum beneath. Move Acasă's next-money logic to `web/lib/ui` so both use it. If money falls short, say so and link to Prognoză. Primary button "Mergi la ferma ta" to `/acasa`, with the three existing links below.
  - **Tests:** edit pre-fills and preserves balance and own crops; draft survives a remount; the result shows the salary and links to `/acasa`.
  - **Offline:** all steps work until the final save, which needs internet and says so.

- [x] **B2. Password and email recovery (F-03)** · ~3 h
  - **`Login.tsx`:** add `forgot` and `new-password` modes, so there is no new route, screen or skeleton. "Am uitat parola", a show-password toggle with `aria-pressed`, and "Trimite din nou emailul" after `email_not_confirmed`.
  - **`lib/live/auth.ts`:** extend `AuthClient` with `resetPasswordForEmail`, `updateUser` and `resend`, plus new `AUTH_TEXT` strings. The reset screen says the same thing whether or not the address exists. Change the `link_expired` text so it stops advising a new account.
  - **Care point:** the recovery link signs the user in, and the current effect would send them straight to the app. Check for the recovery mode before `isSignedIn`.
  - **Manual:** add `/login?mode=new-password` to Supabase Redirect URLs (`docs/12-deploy.md` step 5) and put the reset email template into Romanian.
  - **Risk:** Supabase's built-in mailer is heavily rate-limited, so real use needs custom SMTP.
  - **Tests:** `auth.test.ts` for the new calls and error keys. Test once with a real inbox.
  - **Offline:** "Pornește internetul…", as login does now.

## Phase C: Demo polish and honesty

- [x] **C1. Notifications bell (F-07)** · ~1.5 h
  - In `Notifications.tsx`, show the test panel only when `mode === 'demo' || publicConfig().demo`. Otherwise show "Mesaje": rows from `buildMessage` for each message kind, skipping nulls, with a useful empty state. Computed on the phone, so it works offline. Step F4 replaces the source with the server inbox.
  - **Note:** `VITE_DEMO_MODE` is per build, so a production build with it on shows the panel to everyone, as the demo controls in Contul tău already do. Turn it off for real users.
  - **Tests:** extend `Frame.test.tsx` for both modes.

- [x] **C2. Space on the phone (F-09, F-11)** · ~2.5 h
  - **F-09:** `DemoStrip` collapses to one line after the first page, remembered through `storageKey`, keeping "Fă-ți cont" and a small "Pornește din nou". Add bottom padding to `.main` so "Întreabă" never covers content, and shrink it to its icon while scrolling down. Respect reduced motion.
  - **F-11:** under 760 px in `rail.css`, `.btn` at least 48 px, chips 44 px, text links and the crop-row buttons at least 44 px tall through padding.
  - **Check:** script at 360 px over all 11 pages, plus login and onboarding: no horizontal overflow, nothing under 44 px except inline text links.

- [x] **C3. Navigation, sign-out and honest labels (F-10, F-15, F-16, F-17)** · ~3.25 h
  - **F-10:** move "Ieși din cont" from `Frame.tsx:140-147` into Contul tău, including its no-farm state, with an always-on `Sheet` confirmation: "Ca să intri din nou îți trebuie parola." Keep the unsent-records wording.
  - **F-15:** generalize `SubNav` to take its pages. Add `SALARY_PAGES` (Salariul, Pensie, Contul tău) to `nav.ts`, shown under 760 px on those pages. Pensie stays in the computer rail. The Salariu tab shows as current on `/pensie` on phones only. Update skeletons.
  - **F-16:** when `view.figureSource` is `average` for any crop, add under the salary on Acasă and Salariu: "Calculat cu mediile. Spune-ne ce ai strâns", linking to `/recolte#strans`. Replace "poți scoate sigur" at `Salariu.tsx:122`.
  - **F-17:** add the AI sentence to the footer at `Assistant.tsx:330`.
  - **Tests:** `Salariu.test.tsx`, `Acasa.test.tsx`, `Frame.test.tsx`, `skeleton.test.tsx`.

- [x] **C4. Tappable Acasă rows (F-18)** · ~2.5 h
  - Extract `detailBody` and `ItemActions` from `Calendar.tsx` into `components/app/ItemSheet.tsx`. Acasă's "Ce urmează" rows become buttons opening it, with "Am făcut". Opportunity rows link to `/oportunitati#<key>`, and Oportunități opens that detail from the hash.
  - **Offline:** ticking uses the existing path.

- [x] **C5. Sample assistant on Ion's farm (F-22)** · ~2 h
  - Add `web/lib/ui/demo-assistant.ts`: two or three prepared questions. Answers and cards are computed on the phone from Ion's plan with the same registry functions the assistant uses, with no figures in the text. Mark them "Exemplu de răspuns". End with a link to `/login?mode=register`. Never calls the API, so it works offline.
  - **Tests:** every answer's figures match `view.farmPlan()`; no network call.

- [x] **C6. Consistent errors (F-24)** · ~0.5 h
  - Replace `confirm`/`alert` in `Surse.tsx:221-227` with `Sheet` and an inline error. `NetBanner` was already on the closed view (`PageNotes.tsx:64`), so `Frame.tsx` needed no change.

## Phase D: Reach outside the app

- [x] **D1. Install card (F-21)** · ~1.5 h
  - Add `web/lib/ui/install.ts`, capturing `beforeinstallprompt` at module load because it fires early, plus `components/app/InstallCard.tsx` on Acasă. Hidden when already installed. iPhone gets written steps. One "Nu acum" that stays dismissed, under `storageKey`.
  - Only on a farmer's own farm: installed from Ion's farm, the app would open on the login page (`start_url` is `/acasa`). **Still to do:** try the install on a real Android and iPhone.

- [x] **D2. Phone calendar (F-23)** · ~2.5 h
  - Add pure `buildIcs(item, reminderDays)` in `packages/shared` with tests for escaping, all-day dates and a stable `UID`, so adding twice replaces. The reminder lead time goes in `plan-params.json` with an entry in `docs/11-open-questions.md`, plus the schema.
  - "Pune în calendarul telefonului" in `ItemSheet` for tasks with a date. Use the share sheet with a file where supported, otherwise a download. Test on real Android and iPhone, since installed-app file handling differs.
  - **Offline:** generated on the phone.
  - **Still to do:** the real-phone test above. Check that the file opens, that adding twice replaces the event, and that the alarm survives, since calendar apps may ignore alarms in imported files.

- [x] **D3. Send to family (F-30, plan step 11f)** · ~2 h
  - Per `docs/functions.md` §18: a pure text summary of salary, assumptions and next money, shown before sending. `navigator.share` on Salariu and Subvenții, with copy and print as fallbacks.
  - **Offline:** the text is ready; sending depends on the chosen app.

## Phase E: Bigger screen changes

- [ ] **E1. Unknown balance (F-27)** · ~2.5 h · after Q2 is decided
  - Add `balanceUnknown` to `HarvestsInputSchema`, optional so saved documents stay valid. Onboarding sets it on skip, and `savePlanFigures` clears it.
  - Acasă shows "Nu știm încă" with a link, and a label on the salary. The calculation still uses 0, which is the cautious direction.
  - **Deploy:** API together with web, because the schema is strict. Update `docs/06-features-mvp.md`.

- [ ] **E2. Other crops in onboarding (F-28)** · ~4 h
  - Extract the own-crop sheet from `Recolte.tsx` into `components/app/OwnCropSheet.tsx`. Onboarding gets "Altă cultură", pre-named when a paper had `unknownCrops`.
  - Add optional `ownCrops` to `OnboardingInputSchema`. `POST /farmers` validates against `withOwnCrops`, as the update route already does. `onboardingHarvests` writes them.
  - No new reference crops without sourced figures. The form says the figures are the farmer's own.
  - **Tests:** a farm with only an own crop completes onboarding; API accepts it; existing crops are unaffected.

- [ ] **E3. When money runs out (F-26)** · ~4 h
  - Add `components/app/ShortOfMoney.tsx`, shown on Prognoză when money falls short and linked from Acasă and Salariu. Follows `docs/07-architecture.md` §4: the informative sentence (variant A), and "Iau un credit" (variant C), a form with amount, month and repayment month that calls the existing `add_credit`, with `remove_credit` for undoing. Pension effect through `whatIfPension`.
  - **Scope change from the audit:** "sell earlier" is dropped. No function calculates it, and building one is a separate feature.
  - No bank names. Shows the effect and leaves the choice to the farmer.
  - **Offline:** the explanation shows; the form's button is a `NetButton`.

- [ ] **E4. Editable split (F-32)** · ~3 h
  - Add pure `rebalance(proposal, key, deltaBani, stepBani)` in `packages/shared`, keeping the total. "Schimb" in the Bani split sheet opens steppers with the months-covered figure updating. Step size in `plan-params.json`.
  - **Offline:** viewing works, saving needs internet and never queues.

- [ ] **E5. Larger text (F-25)** · ~5 h
  - **Step 1:** a throwaway script converts `font-size: Npx` to `rem` across `web/styles/*.css` and `public/assistant.css`. The landing page's inline styles are excluded. No visual change at this point.
  - **Step 2:** under 760 px, body 16 px, secondary text at least 14 px, eyebrows at least 13 px.
  - **Step 3:** "Scris mai mare" chips in Contul tău set `data-text` on `<html>`, applied in the same place as the palette to avoid a flash. Saved on the phone.
  - **Check:** the 360 px script at both sizes, including SVG labels in `FarmChart` and `PensionChart`, which don't scale with `rem`. Computer layout unchanged except for the option.

- [ ] **E6. Shorter pages and empty states (F-29, F-31)** · ~6 h
  - **Acasă:** salary, next money, next deadline, one action, then a link for the rest. Remove the repeated "Notează o vânzare" and the tiles that duplicate tabs.
  - **Calendar on phones:** list first, month grid folded.
  - **Prognoză, Subvenții:** secondary sections in folds.
  - **Empty states:** one sentence plus a first-action button on the empty rows in Recolte, Acasă, Bani and Calendar.
  - **Tests:** update `Acasa.test.tsx`, `pages.test.tsx`, skeletons. Done after the other steps because it moves what they add.

## Phase F: Decisions and new backend

- [ ] **F1. Privacy, export, delete (F-05)** · ~6 h · needs Q3, Q4 · before the first real user
  - **Privacy page:** `/confidentialitate`, open to everyone, linked from sign-up, the landing footer and the paper consent sheet. Lists every service that receives data (Supabase, Stripe, Anthropic, Netlify, the VPS, Open-Meteo).
  - **API:** `GET /api/account/export` and `DELETE /api/account`, needing `{ confirm }`. Delete order: take a new `account` lease, `stopPension` (already safe to repeat), remove the Stripe test objects, delete the farm (references already cascade), then delete the auth user last so a failed attempt can be retried. Refuse for the `DEMO_EMAIL` account.
  - **UI:** "Descarcă datele mele" and "Șterge contul" in Contul tău, with a summary and a typed word. Needs internet, never queued.
  - **Tests:** `npm run test:integration` proves no row remains; `npm run test:stripe` covers a running pension.

- [ ] **F2. Measurement (F-34)** · ~3 h · needs Q5 and F1's privacy page
  - Migration for `events` (name, time, farmer reference that deletes with the farm). `POST /api/events`, batched. `web/lib/live/events.ts` queues in `localStorage`, under `storageKey`, and sends when online. Never sends from Ion's farm. No amounts or names, and a test enforces the allowed event list. A funnel query goes in the docs.

- [ ] **F3. Help (F-35)** · ~3 h · needs Q7
  - `/ajutor`, open to everyone: short FAQ, contact from `docs/data`, and "Nu cerem niciodată datele cardului prin SMS." A pre-filled message with page, app state and queue count, no amounts. Linked from Contul tău, `PageFailed` and Login. A "Vorbește cu un om" link in the assistant footer.
  - **Offline:** FAQ is cached, and the contact button says what it needs.

- [ ] **F4. Real reminders (F-33, plan step 9f)** · ~10 h · push part can start, SMS needs Q6
  - Follows `docs/functions.md` §17. Migration for `push_subscriptions`, `inbox_messages` and settings. `apps/api/src/jobs/` beside `payoutScheduler`: weekly summary, spring warning, deadlines. Move the message builders from `web/lib/ui/messages.ts` to `packages/shared` so server and phone share them.
  - VAPID keys in `.env.example`. `push` and `notificationclick` in `lib/live/service-worker.mjs`. "Mesaje" reads the server inbox and keeps the last copy offline.
  - Permission is asked after a first useful moment, not on opening. Settings per tier in Contul tău. Frequency and quiet hours in `plan-params.json`, with open-question entries. No exact amounts on the lock screen. The demo button stays.
  - `docs/10-plan.md` estimates 9f at 4 h. With the shared-builder move and settings, 10 h is more realistic.
  - **Done when:** the 9f criteria pass on a real phone. Tick 9f in `docs/10-plan.md` as well.

- [ ] **F5. Helper access (F-36)** · ~16 h or more · **blocked on Q1**
  - If approved: `farm_helpers` table and new row-level policies on every table scoped to a farmer, an invite flow, a permanent "Ești ajutorul lui X" indicator, and owner-only checks on every money route. Needs its own design pass and a change to `docs/07-architecture.md` and `docs/functions.md` §18 first.

## Risks

- **Another session was using this app during the audit** (same browser daemon, a server on port 4179). The working tree is also heavily uncommitted. Check nothing else is editing `web/components` before starting, or steps will collide.
- **Back-button handling** (A2, B1) interacts with the Next.js router. Test on a real Android phone before moving on.
- **E5 and E6 change the look of every page.** Do them after the demo unless the team accepts the risk.
- **Not yet seen live:** signed-in flows were read from code, so the first test of A2, A4, B1 and B2 on a real account may reveal more.
