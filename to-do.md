# CropCash: what still needs to be built

Written 2026-11-18 from the plan docs in `docs/`, `docs/10-plan.md`, and a read of the database (`public._migrations`).
Each item points to the doc that has the details. Where a doc's own status line is out of date, the item says so.

---

## 0. First: get the source code back (blocks everything else)

On 2026-11-18 a `git worktree remove --force` followed directory junctions and deleted the contents of the
workspace folders. Nothing below can be built until this is done.

- [ ] Pause every other Claude session working on this repo (session `1a99ab44` was active at 11:24).
- [ ] Restore the committed files: `git checkout -- web apps packages subventii-monitor` (HEAD `20c9085`, 15 nov).
- [ ] Replay the uncommitted work that was lost, from the session transcripts
      (`~/.claude/projects/D--Grind-mode-zone-Proiecte-web-cropcash/*.jsonl`) and `~/.claude/file-history/<session>/`,
      in the order it was made. Known lost work:
  - Workspaces steps 1–8 web/API code, people on the farm, worker app (`/lucru`), several farms (`/ferme`).
  - Cerere documents + Google map steps 1–6, G1–G3 (`docs/cerere-documents-google-map-plan.md`).
  - APIA papers autofill steps 2–3 and the work in progress on step 4+ (`documents/proposals*.ts`).
  - Facturi steps 1–9 (`packages/shared/src/invoices`, `apps/api` invoicing routes, `/facturi`, `/contabil`).
  - „Ce mai poți primi” (levers, the "applied" state, the card on `/subventii`).
  - Admin opportunities tab, plots changes, members, cards, documents reader changes.
  - Pension removal steps 1, 2, 5 and 6 (see §1). Root files survived: `scripts/stop-pensions.ts`, `package.json`.
- [ ] Reinstall: `npm ci --legacy-peer-deps=false` (it fails with "No workspaces found" until the workspace
      `package.json` files are back). Check `ls node_modules/vite node_modules/rolldown node_modules/@cropcash`.
- [ ] `npm test`, `npm run typecheck`, `npm run build` green again. Before the loss, `npm run typecheck` already
      failed on `packages/shared/src/documents/proposals.ts` (another session's work in progress).
- [ ] Commit once green, so this can't happen to uncommitted work again.

---

## 1. Remove the pension (`docs/remove-pension-plan.md`)

Order agreed on 2026-11-18: **5 → 6 → 3 → 4 → 7 → 8 → 9**. Steps 1, 2, 5 and most of 6 were built, then lost in §0.

- [ ] Rebuild step 1: `apps/api/src/stripe/stop-pensions.ts`, `apps/api/src/db/stop-pensions.ts`, `apps/api/src/stop-pensions.test.ts`
      (the script `scripts/stop-pensions.ts` and the `pensions:stop` npm script survived).
- [ ] Rebuild step 2: assistant and registry (4 pension reads, `pension`/`pension_change` cards, `SYSTEM` line).
- [ ] Rebuild step 5: `/pension` routes, `PUT /pension/fund`, `startPension`/`changePension`/`stopPension`/`syncPensionInvoices`,
      the `invoice.paid` case, the Stripe customer in setup, `upsertPension`/`updatePension`/`setPensionFund`,
      the 4 registry writes, tests (`pension-change.test.ts` deleted; `webhook`, `idempotency`, `app`, `tests/stripe/flow.test.ts`).
      Keep `pension_plans` in `MONEY_FARM_SELECT` and the `'pension'` lease for the stop job until step 7.
- [ ] Rebuild step 6: delete `/pensie` (page, screen, `Pensie.tsx`, `PensionChart.tsx`, skeleton, CSS block), nav entries,
      `netlify.toml` redirects (`/pensie` and `/ferma-lui-ion/pensie` → salariu, already in the file), Acasa card, Bani,
      Salariu, DatePlan, Prognoza, Calendar, Admin, FarmPeople, landing and manifest texts, `lib/cc` (`pensionBani`,
      `ownPension`, `setOwnPension`, storage keys cleared via `goneKeys`), `lib/live` (money-check, farm, fail-text),
      reports, demo-account, landing-data.
- [ ] Web tests still failing after step 6 (before the loss): `paths`, `Frame` ("Mai mult" lists), `phase-d`, `Salariu`,
      `skeleton` (Pensie.tsx in the busy-buttons list), `auth` (`/pensie` in `safeNext`), `live` (`start_pension` →
      `save_envelopes`), `store` FAIL-03 cases (`start_pension` → `save_envelopes`), `ui` (TABS list).
      `phase-d`'s "send to family" test only passed by luck: it matched „0 lei pe lună” inside the pension line.
      Ion's demo is in deficit in a normal year (bank rate 1.500 lei/month), so check `'banii nu ajung'` instead.
- [ ] Step 3: plan math in `packages/shared` (smoothing, allocation, explain, plan, farm-plan, plan-diff, whatIf,
      plan-inputs, `farm/index.ts`, members, worker regex); delete `packages/shared/src/pension/`. Also drop
      `withoutSetAsides` (it only differed by the pension) and the `pension` key in envelope splits in tests.
- [ ] Step 4: data files (`pension-funds.json`, `pension-options.json`, `plan-params.json` keys), schemas, loader,
      admin factors; the override reader must ignore old `params.pension*` keys.
- [ ] Run `npm run pensions:stop -- --apply` right before deploying step 5.
- [ ] Step 7: migration — **renumber to `048_remove_pension.sql`** (045 is free, but 046 and 047 are already applied,
      so a 045 would run out of order).
- [ ] Step 8: docs (`CLAUDE.md` tagline and `stripe listen` events, `docs/05-taxes-pension.md` → `docs/05-taxes.md`, others).
- [ ] Step 9: the `git grep` check, then `npm test`, typecheck, build, `test:integration`, `test:stripe`,
      `test:assistant`, one `demo:rehearse`.

---

## 2. Assistant tools (`docs/assistant-tools-plan.md`)

Plan only, nothing built.
- [ ] Decide A1b (invoices + stornos per day from chat) and A4b (farm comparisons per month).
- [ ] Paging helper `{limit 15, max 50, cursor}` → `{items, total, nextCursor}` for every list read.
- [ ] Owner-only gate (403 `owner_only`) and account scope (farms I own).
- [ ] New reads and cards from §3.1–3.7.
- [ ] Invoices to ANAF from chat (§3.8): `get_invoicing_status`, `list_invoice_buyers`, `issue_invoice`, `cancel_invoice`,
      `resend_invoice`, `draftFromChat` + `validateInvoice`, `InvoiceCard`, `created_via` column, daily limit.
- [ ] `assistant_quota` table + `use_assistant_quota()` (§4.8).
- [ ] Security fixes F1 (readRunner skips `farmViewFor`), F2 (24k cut), F3 (managers can use the assistant).

---

## 3. APIA papers fill the farm (`docs/apia-documents-autofill-plan.md`)

Steps 1–3 done (migration 046 applied). Step 4 was in progress in another session (lost in §0).
- [ ] 4. Splitter + classifier (one PDF with many papers).
- [ ] 5. Extractors, in order of value (D1/D2 → P9 + diesel invoices → P4 leases → …).
- [ ] 6. Review screen `PileReview`, „Salvează tot”, 24 h undo. 6b. Checklist page („Ce poți pune”).
- [ ] 7. Entry points (onboarding card, buttons, `/acasa` card). 8. Share target (PWA).
- [ ] 9. Tier 2: bank statements. 10. Ion's synthetic folder. 11. Real test (costs money). 12. Docs.

---

## 4. Cerere documents and the Google map (`docs/cerere-documents-google-map-plan.md`)

Steps 1–6 and G1–G3 built; migration 041 applied.
- [ ] 7. Draw a new parcel (start sheet: tap bloc / GPS / zero / coords; absorb unplaced ha; split later).
- [ ] G4. Remove MapLibre / MapTiler / OpenFreeMap fully, and the docs (partly done).
- [ ] 8. Demo + polish (Ion's cerere in `seed:demo`, worst cases: 0/1/150 rows, 40-row cerere, 20 farms).
- [ ] Google Maps key + Map ID (`VITE_GOOGLE_MAPS_KEY`, `VITE_GOOGLE_MAP_ID`) and a budget alert.

---

## 5. Harta leftovers (`docs/harta-plan.md`)

- [ ] Step 1b: import SIRUTA + LPIS blocs (migration 034 applied, `geo:import` not run; waits for APIA's answer on
      bulk copying, open question 1). Then village-level SIRUTA, UAT names with diacritics, built-up outlines,
      ANCPI UAT outlines, the pmtiles overlay on the VPS, `--year` for newer LPIS, copy `village_siruta` on save.
- [ ] Sales per parcel (`record_sale` with `p_plot_id`).
- [ ] `add_operation` in the offline queue (`QUEUEABLE`).
- [ ] A test of the expense route with `plotId`.
- [ ] A 40-row cerere fixture with a real AI reading (costs money).
- [ ] „Sunt aici acum” using `/api/lpis/at`.
- [ ] Drag-editing checked on a real phone.

---

## 6. Bigger farms, people, arenda (`docs/employees-arenda-plan.md` §8)

Steps 1–8 done; step 10 (workspace) done through `docs/workspaces-plan.md`.
- [ ] 0a. Demo only on the demo account (`is_demo`, gated routes/card/functions, no Test Clock for real farms).
- [ ] 0b. Take existing accounts off the demo clock, keep their records.
- [ ] 0c. Pivot docs, size limits (max 1 000 ha), soft 100 ha minimum, `legal_form`, the 100 KB limit on saving plots.
- [ ] 0d. Subsidy rules for large farms checked and tested.
- [ ] 0e. Up to 5 000 ha: money caps, cerere read in chunks, paged transactions.
- [ ] 9. Rent day screen, receipts, offline; `lease_contract_id` on transactions; photo of the contract.
- [ ] 11. Worker view extras: assignments, hours, zilier register.
- [ ] 12. Renewals, map colouring, APIA export, heirs; wide layout for long tables.
- [ ] 13. Ion rescaled (`demo-ion.json`, `seed:demo`, `demo:rehearse`, pitch; demo clock records people's pay).
- [ ] Workspaces "later": SMS sign-in for workers.

---

## 7. Facturi leftovers (`docs/facturi-plan.md`, `docs/10-plan.md`)

All 9 steps built. Still open:
- [ ] PDF with „SIMULARE” and XML download for the accountant.
- [ ] Run `seed:demo` + `demo:rehearse` with the invoices on Supabase.
- [ ] Real Oblio account test (`npm run test:oblio`, question 31).
- [ ] App registered at ANAF, then `npm run test:efactura` and the production switch (question 32).
- [ ] `INVOICING_KEY` and `INVOICING_ALLOW_PROD` on the VPS (`docs/12-deploy.md` §7).

---

## 8. Product work from `docs/10-plan.md` and `docs/ux-build-plan.md`

- [ ] 9f. Notifications: jobs, `push_subscriptions`, `inbox_messages`, „Mesaje”, Sunday summary, deadline pushes
      (also unblocks calendar push reminders and UX F4).
- [ ] 11. Use-case gaps (none of these functions exist yet):
  - a. `record_income`, `label_income`, `record_apia_payment`.
  - b. Recurring costs: calendar events with `repeat` already cover part of it; decide whether `add_recurring_cost` is still needed.
  - c. `edit_transaction`, `open_record` (`undo_transaction` exists).
  - d. ~~Fund and pension~~: dropped with the pension.
  - e. `check_message` (fake SMS).
  - f. `explain_numbers`.
  - g. `get_required_documents`, `get_credit_cost` (stay `null` until there are sources).
- [ ] UX phase E: E1 unknown balance (after Q2), E2 other crops in onboarding, E3 when money runs out,
      E4 editable split, E5 larger text, E6 shorter pages and empty states.
- [ ] UX phase F: F1 privacy, export, delete (before the first real user; needs Q3, Q4), F2 measurement,
      F3 help, F4 real reminders, F5 helper access (blocked on Q1).
- [ ] Rapoarte: shortcuts from `/bani` and `/subventii`; CSV export (postponed).

---

## 9. Mobile app (`docs/14-mobile-expo.md`)

- [ ] Phase 0 run on a device.
- [ ] 1. Wrapper handling (`.ics`, share sheet, printing, camera permissions).
- [ ] 2. `web/` knows it runs in the app (needs a yes: architecture change).
- [ ] 3. Test on real Android and iPhone.
- [ ] 4. EAS builds (APK, TestFlight); store release needs in-app account deletion and a privacy policy.

---

## 10. Checks never run

- [ ] Browser check of login, Ion's farm and skeletons at phone/desktop widths, light/dark, online/offline
      (`docs/13-auth-demo-loading-plan.md` step 9).
- [ ] `npm run test:integration` against all migrations (members, RLS, reference-geo tests were never run).
- [ ] `npm run test:assistant` (new questions since 9 nov, the pension answer; costs money).
- [ ] `npm run test:stripe`, `npm run seed:demo`, `npm run demo:rehearse`, `npm run admin:rehearse`.
- [ ] Admin opportunities tab looked at in a real browser.
- [ ] New pitch figures in `docs/09-demo-pitch.md` (an slab / an bun) after `seed:demo` and `demo:rehearse`.
- [ ] Measure the real cost per assistant message (open question 10).

---

## 11. Open decisions and data (`docs/11-open-questions.md`)

Section A lists the figures still `DE-VERIFICAT`, and section D "Deschise" holds the open decisions (up to 32). The ones that
block building:
- [ ] APIA terms for bulk LPIS copy (1): blocks harta step 1b.
- [ ] Notifications: how many, when, iPhone without install (9): blocks 9f.
- [ ] Weather: spray wind threshold (3), frost threshold (4), Open-Meteo licence at launch (5).
- [ ] Costs, yields and prices for crops other than wheat, maize and sunflower (20).
- [ ] Arenda tax form, rounding, rent in kind, agricultural register (21–25).
- [ ] VAT rates and reverse charge after 31 dec 2026 (26–30); Oblio (31); ANAF registration (32).
- [ ] Crop loss: do INS yields count lost fields? (P33, `docs/crop-loss-plan.md`).
- [ ] Remove question 13 („Pensia sărită o lună”) with the pension docs (pension step 8).

---

## 12. Docs whose status is out of date

- [ ] Every migration up to 047 is applied (read from `_migrations` on 2026-11-18). Update the "not applied" notes in
      `docs/10-plan.md`, `calendar-events-plan.md`, `ce-mai-poti-primi-plan.md`, `cerere-documents-google-map-plan.md`,
      `facturi-plan.md`, `harta-plan.md`, `workspaces-plan.md`.
- [ ] Headers that say "plan, nothing built" but are built: `harta-plan.md`, `facturi-plan.md`, `workspaces-plan.md`,
      `employees-arenda-plan.md`, `cerere-documents-google-map-plan.md`, `13-auth-demo-loading-plan.md`, `farm-app-wiring.md`.
- [ ] `docs/10-plan.md` step 10 (Extra): fuel report, APIA PDF reading and the funding radar are built
      (Rapoarte, documents reader, `subventii-monitor`); tick them.
