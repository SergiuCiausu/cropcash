# Plan: remove the pension from the app

Status: **plan, nothing built.** Written 2026-11-18. Decisions marked **P?** need an answer first.
After this, CropCash turns subsidies and harvest into a **monthly salary** only. The salary, envelopes, Stripe
salary payouts, credits, calendar and everything else stay.

## 0. What "pension" is today (checked 2026-11-18)

About 150 files mention it. It isn't one screen: it runs through the plan math, Stripe, the DB and the pitch.

| Layer | What it does | Where |
|---|---|---|
| Plan math | A monthly pension is taken out **before** the safe salary (`smoothing.pensionMonthly`), so it lowers the salary. It's also an envelope kind and a split share | `cashflow/smoothing.ts`, `allocation.ts`, `plan.ts`, `farm-plan.ts`, `plan-diff.ts`, `farm/plan-inputs.ts` (`StoredPension`, `activePensionMonthly`), `functions/explain.ts`, `whatIf.ts` (`whatIfPension`) |
| Pension logic | Simulation to 65 at 2/4/6 %, suggested amount, fund minimums, options ("De ce nu Casa de Pensii?") | `packages/shared/src/pension/` (index, options, scenarios, path + tests) |
| Registry / assistant | 8 functions: `simulate_pension`, `what_if_pension`, `suggest_pension`, `list_pension_funds`, `set_pension_fund`, `start_pension`, `change_pension`, `stop_pension`; the pension part of `get_payouts`; cards `pension`, `pension_change`; pension lines in the assistant's `SYSTEM` | `functions/registry.ts`, `functions/cards.ts`, `ai/assistant.ts` |
| API | `POST/PUT/DELETE /pension` (Stripe subscription, lease `pension`, salary re-fix), `PUT /pension/fund` | `routes/money.ts`, `routes/plan.ts` |
| Stripe | A **customer** on the Test Clock exists only for the pension subscription; `startPension`, `syncPensionInvoices`, `invoice.paid` webhook writes `transactions` kind `pension`, source `subscription` | `stripe/money.ts`, `db/admin.ts` (`upsertPension`, `updatePension`, `LeaseOp 'pension'`) |
| DB | `pension_plans` table (001, 018 `start_key`, 040 owner-only policy); `farmers.pension_fund_id` (011, grants in 012); enum value `envelope_kind 'pension'` (001); `transactions.kind 'pension'` and `source 'subscription'` (001/012) | `supabase/migrations/` |
| Data | `docs/data/pension-funds.json`, `docs/data/pension-options.json`; `plan-params.json` keys `pension`, `pension_suggest_*`, `pension_round_lei`, `pension_demo_lei`, `pension_target_age`, `pension_return_pct`; schemas in `data/schemas.ts`, loader `data/files.ts`; admin factors group `pension` (`data/factors.ts`) and their checks (`data/overrides.ts`) | |
| Web | Page `/pensie` (`web/app/pensie/page.tsx`, `web/screens/pensie.tsx`, `components/pages/Pensie.tsx`, `components/app/PensionChart.tsx`, CSS block in `styles/subsidies.css`); nav entries (`lib/ui/nav.ts`, `REACT_PAGES`, `WHOLE_FARM_PAGES`); Acasa KPI card; pension rows in Bani, Salariu, DatePlan (slider), Prognoza notes ("înainte de salariu și pensie"), Calendar, Admin (`pensionAtTarget`), FarmPeople texts; assistant cards `PensionCard`, `PensionChangeCard`; `lib/live/money-check.ts`, `intent.ts`, `farm.ts`; `lib/cc/plan.ts`, `store.ts`, `farm.ts`, `storage.ts` (local key `pension`, `ownPension`); `lib/reports/build.ts` (PDF row); `lib/demo-account.ts`; `lib/landing-data.ts` + landing text in `app/page.tsx` | |
| Members | `farmViewFor` hides `pension_fund_id`, `pension_plans`; the worker money filter regex mentions `pension` | `members/index.ts`, `worker/index.ts` |
| Scripts / tests | `seed-demo.ts` (customer for the pension), `rehearse-demo.ts`, `tests/stripe/flow.test.ts`, `webhook.test.ts`, `pension-change.test.ts`, `idempotency.test.ts`, `app.test.ts`, `f3`/`f5`/`pension-what-if` tests, integration `rls.test.ts`, `people-on-the-farm.test.ts`, many web tests | |
| Docs | `CLAUDE.md` (tagline, `stripe listen` events), `docs/05-taxes-pension.md`, `01`, `02`, `06`, `07`, `08`, `09` (pitch), `10`, `11`, `functions.md`, `workspaces-plan.md`, `idempotency-plan.md`, `failure-handling-plan.md`, `ux-cx-plan.md`, README, and the new `assistant-tools-plan.md` | |

Not pension, leave alone: "suspensie" in `docs/data/fertilizers.json` (a fertilizer form) and the farmer's
**birth year**, which subsidies use (young farmer schemes).

## 1. What changes for a farmer

- The salary goes **up** on farms that had a pension running, since the pension came out of it. The fixed salary
  (`farmers.salary_bani`) is re-fixed once, the same way `routes/money.ts` does after a pension change today.
- The pension envelope's money moves into the **salary** envelope (**P2**).
- `/pensie` is gone. An old link or bookmark goes to `/salariu`.
- The assistant answers "Nu mai fac calcule de pensie în aplicație." to pension questions (one line in `SYSTEM`),
  and has no pension tools or cards.

## 2. Steps, in order

Each step leaves the app working and `npm test` green.

### Step 1: stop the money first (before any code goes) — [x] built 2026-11-18, not yet applied
`npm run pensions:stop` (dry run) / `npm run pensions:stop -- --apply`. Logic in `apps/api/src/stripe/stop-pensions.ts`
(tests: `apps/api/src/stop-pensions.test.ts`), store in `apps/api/src/db/stop-pensions.ts`, wiring in
`scripts/stop-pensions.ts`. Holds the farm's `pension` lease; also cancels live subscriptions `pension_plans` doesn't
know about (the customer exists only for the pension). First dry run on the real DB (2026-11-18): 1 farm (Ion),
nothing to cancel, move or fix. Run `--apply` right before deploying Step 5.

Script `scripts/stop-pensions.ts` (run once, idempotent, service key since it's a job):
1. For every `pension_plans` row with status `active`/`stopping`: cancel its Stripe subscription
   (`subscriptions.cancel`, idempotency key per farm). Otherwise the next Test Clock advance still bills it.
2. Mark the row `stopped`, re-fix that farm's salary with the plan **without** pension (the existing
   `computeFarmPlan` path in `routes/money.ts`).
3. Move the `pension` envelope balance into `salary` (P2).
4. Print what changed per farm. `--dry-run` first.

### Step 2: assistant and registry — [x] built 2026-11-18
Done: `simulate_pension`, `what_if_pension`, `suggest_pension`, `list_pension_funds` removed; `get_payouts` lists
salaries only; cards `pension`/`pension_change` gone (schemas, `PensionCard.tsx`, `PensionChangeCard.tsx`, the
salary card's pension line); `SYSTEM` has no pension rules and answers „Nu mai fac calcule de pensie în aplicație.”;
tests updated (`pension-what-if.test.ts` deleted; an old saved pension card now shows the fallback). `npm test` green.
`npm run test:assistant` (real Claude, costs money) not run yet: its pension question now expects that sentence.
Moved to later steps, because the Pensie page still uses them until step 6:
- `set_pension_fund`, `start_pension`, `change_pension`, `stop_pension` stay in the registry (access `confirm`, but
  not in `ASSISTANT_WRITES`, so the assistant never had them) → removed with their routes in step 5 and the page in
  step 6. Same for `money-check.ts`.
- `get_envelopes`' description ("…and pension") and `explain_salary`'s `setAside.pensionMonthly` come from the plan
  math → step 3.

Original list:
- Remove the 8 pension functions from `registry.ts` and `FUNCTIONS`; remove `pension`/`pension_change` from
  `cards.ts` (`ASSISTANT_CARDS`, `CARD_TYPES`, schemas, `setAside`, `pensionBefore`).
- `get_payouts`: drop the `pension` list; it returns salaries only. `get_envelopes`/`propose_split`/`save_envelopes`
  lose the pension share.
- `ai/assistant.ts`: drop the pension rules and card mentions in `SYSTEM`, add the one-line answer from §1.
- `money-check.ts`: drop `start/change/stop_pension`, `set_pension_fund`.
- Tests: delete `pension-what-if.test.ts`; trim `f3`, `f5`, `cards.test.ts`, `registry.test.ts`,
  `assistant.test.ts`, `tests/assistant/assistant.test.ts` (and its 20 questions if one is about pension).

### Step 3: plan math (`packages/shared`)
- `smoothing.ts`: remove `pensionMonthly` and the fixed `pension` set-aside; `explain.ts` loses the `pension` column.
- `allocation.ts`: `EnvelopeKind` without `pension`; the share it took goes to salary.
- `plan.ts`, `farm-plan.ts`, `plan-diff.ts` (`pensionAtTarget`), `whatIf.ts` (`whatIfPension`), `plan-inputs.ts`
  (`StoredPension`, `activePensionMonthly`, `'pension'` transaction kind), `farm/index.ts` (`pension_fund_id`,
  `pension_plans` on `StoredFarm`), `members/index.ts`, `worker/index.ts` regex.
- Delete `packages/shared/src/pension/` and its export in `src/index.ts`.
- Update the salary/plan tests that expect a pension deduction (`smoothing`, `payroll-plan`, `one-plan`,
  `simulate`, `plan-diff`, `scenarios`, `county-yields`). **Every expected salary changes only where a test set a
  pension**; any other changed number is a bug.

### Step 4: data files and admin
- Delete `docs/data/pension-funds.json`, `pension-options.json`; their schemas and loader entries.
- Remove the pension keys from `plan-params.json` and `schemas.ts`.
- `factors.ts`: remove the `pension` group; `overrides.ts`: remove the pension checks.
- Admin versions already published in the DB may carry `params.pension*` overrides: make the override reader
  **ignore unknown keys** (don't fail), and add a note in the version list. Test it with an old version.
- `Admin.tsx`: drop the `pensionAtTarget` row and "și pensia" from the text.

### Step 5: API and Stripe
- `routes/money.ts`: remove `/pension` (POST/PUT/DELETE), `pensionAmount`, `pensionOf`, lease `pension`.
  `routes/plan.ts`: remove `PUT /pension/fund`. Old clients calling them get 404; offline queue never held them.
- `stripe/money.ts`: remove `startPension`, `syncPensionInvoices`, the `invoice.paid` case, and the customer
  creation in setup (it existed only for the subscription). Test Clock stays: salary payouts use it.
- `db/admin.ts`: `upsertPension`, `updatePension`, `'pension'` / `'subscription'` in types, `pension_plans` in select.
  `db/repo.ts`: `setPensionFund`, `pension_fund_id` and `pension_plans` in `FARM_SELECT`.
- Tests: delete `pension-change.test.ts`; trim `webhook`, `idempotency`, `app`, `admin` tests, `tests/stripe/flow.test.ts`.
- `scripts/seed-demo.ts`, `rehearse-demo.ts`: no customer, no pension step. Rebuild `apps/api/dist`.

### Step 6: web
- Delete `/pensie`: `app/pensie/page.tsx`, `screens/pensie.tsx` (+ `SCREENS`, skeleton entry), `pages/Pensie.tsx`,
  `app/PensionChart.tsx`, the `---- Pensie ----` CSS block. Add a redirect `/pensie` → `/salariu` (Netlify
  `netlify.toml` and the `/ferma-lui-ion/pensie` path too).
- Nav: `nav.ts` (rail and "Mai mult"), `REACT_PAGES`, `WHOLE_FARM_PAGES`, `Frame.tsx` comments.
- Acasa: remove the Pensie KPI card (P3), and let the row reflow.
- Bani: drop the pension label, "Pus deoparte pentru pensie", the pension total.
- Salariu: drop "pentru pensie", the "Doar … pensia" wording, `ownPension`.
- DatePlan: drop the pension slider and its check.
- Prognoza: "înainte de salariu și pensie" → "înainte de salariu" (4 places). Calendar: same in its sentence.
- FarmPeople: "fără pensia și salariul tău" → "fără salariul tău" (2 texts).
- Assistant cards: delete `PensionCard`, `PensionChangeCard`, their entries in `assistant-cards/index.tsx`.
- `lib/cc/plan.ts`, `store.ts` (`savePlanFigures` pension arg, `setOwnPension`), `farm.ts` (`ownPension`),
  `storage.ts` (key `pension`): remove, and on load delete the old `cropcash-*-pension` key from the phone.
- `lib/live/farm.ts`, `intent.ts`, `reports/build.ts` (PDF row), `demo-account.ts`, `landing-data.ts`.
- Landing (`app/page.tsx`): "Salariu și pensie din subvenție și recoltă" → "Un salariu lunar din subvenție și recoltă".
- Service worker: the precache list rebuilds with `npm run build:web`; check `/pensie` isn't left in it.
- Trim web tests (`store`, `Frame`, `Sheet`, `phase-c`, `fail-text`, `live`, `paths`, `demo-account`, `ui`, …).

### Step 7: database (migration `045_remove_pension.sql`, after Step 5 is deployed)
Safe to run again, like the others.
```sql
-- money already moved by scripts/stop-pensions.ts; this only cleans up
update envelopes set kind = 'salary' where kind = 'pension';           -- if any is left (merge balances first)
-- P1: past pension contributions are deleted
delete from transactions where kind = 'pension' or source = 'subscription';
drop table if exists pension_plans cascade;
alter table farmers drop column if exists pension_fund_id;
-- enum: Postgres can't drop a value; recreate envelope_kind without 'pension'
-- transactions.kind / source checks: recreate without 'pension' / 'subscription'
-- re-grant farmers columns without pension_fund_id (as 012 does)
```
Run `npm run test:integration` after (`rls.test.ts`, `people-on-the-farm.test.ts` lose their pension cases).
Old migrations stay as they are (history); `045` is the one that removes.

### Step 8: docs
- `CLAUDE.md`: tagline "într-un **salariu lunar**" (no "și o pensie"); drop `invoice.paid` from `stripe listen`;
  remove `docs/05` row wording "pensie".
- `docs/05-taxes-pension.md` → `docs/05-taxes.md`, with §2–§4 (CAS, Pilon III, the simulation) removed (P4).
  Update the link to it in `CLAUDE.md`.
- Pitch `09-demo-pitch.md`: out of scope (P5). `01`, `02`, `06`, `07`, `08`, `10`, `11`, `functions.md`, `workspaces-plan.md`
  (owner-only pension), `idempotency-plan.md` (IDEM-02/06), `failure-handling-plan.md`, `ux-cx-plan.md`, README,
  `assistant-tools-plan.md`.
- `docs/11-open-questions.md`: close the pension items (return rates, fund minimums).

### Step 9: check nothing is left
```bash
git grep -nIiE "pension|pensie|pensia|pensii|pilon" -- . ':!supabase/migrations/0[0-3]*' ':!supabase/migrations/04[0-4]*' ':!superseded' ':!landing-variations' ':!financial-futures-context*'
```
Allowed hits: `suspensie`/`suspension` in fertilizers, migration `045` itself, `docs/09-demo-pitch.md` (P5), the
assistant's one-line answer to pension questions in `apps/api/src/ai/assistant.ts` and its case in
`tests/assistant/assistant.test.ts`, and the card fallback test in `web/lib/assistant-cards.test.ts`.
Then `npm test`, `npm run typecheck`, `npm run build`, `npm run test:integration`, `npm run test:stripe`,
`npm run test:assistant`, and one pass of `npm run demo:rehearse`.

## 3. Risks

- **Stripe keeps billing** if Step 7 runs before Step 1. The order is fixed: money stops first, tables go last.
- **Salary jumps** for farms with a pension: expected, and the re-fix in Step 1 is what pays it. Say it in the
  release note to those owners.
- **Old admin versions** with pension params: handled in Step 4.
- **Phones offline** with an old app version: their queue never holds pension calls (money is never queued), so
  nothing replays. An old cached `/pensie` page shows until the new service worker takes over.

## 4. Decisions (answered 2026-11-18)

- **P1:** Past pension contributions are **deleted** from `transactions` (migration 045).
- **P2:** The pension envelope balance **moves into the salary envelope** (Step 1 script).
- **P3:** Acasa's Pensie card is **removed**, nothing replaces it.
- **P4:** The CAS / Pilon III / simulation sections of `docs/05` are **removed**; the file becomes `docs/05-taxes.md`.
- **P5:** The demo is **out of scope**: no re-timing of the pitch script or `demo:rehearse` story. Only remove
  pension calls the scripts make so they still run.
