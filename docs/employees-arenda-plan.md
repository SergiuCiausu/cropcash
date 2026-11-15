# Plan: employee salaries, the "arendaș" farm, and a shared workspace

Status: **plan, nothing built.** Decisions marked **D?** need an answer before the step that uses them.

**Pivot (decided 2026-11-14): CropCash now targets farms of at least 100 ha.** These farms nearly always have
employees and usually work land taken in arendă. See §6.

Five pieces:

1. **Employee salaries as expenses.** Works on every farm. Comes first.
2. **Two kinds of farm, chosen at onboarding.** "My land, my employees" or "I take land in arendă and my people do the work".
3. **The arendaș workspace.** Lease contracts, landowners, rent day, and several people on one farm.
4. **The 100+ ha pivot** (§6): what changes in limits, subsidies, docs and screens.
5. **Demo settings only on the demo account** (§7): real accounts run on the real date with no demo controls. The
   demo account and Ion's farm stay.

---

## 0. What exists today

| Piece | Where | Today |
|---|---|---|
| Expense categories | `packages/shared/src/farm/plan-inputs.ts` `EXPENSE_CATEGORIES` | 10 categories, `rent` among them. No salaries. The first five (`PLANNED_CATEGORIES`) replace the plan's crop cost |
| Recording an expense | `record_expense()` (migration 010), `transactions.kind = 'expense'` | One expense, optionally taken from an envelope |
| Repeating money | `farm_events` (023), `EVENT_REPEATS = none/monthly/yearly` | A farmer can already add "Bani de plătit" every month. That's how salaries would be typed today, by hand, with no notion of a person |
| Money for the plan | `timeline.ts` `extras`, `farmerEvents`; `smoothing.ts` "fixed set-asides before salary" | The farmer's own salary is what's left after the set-asides |
| Envelopes | enum `envelope_kind` = spring_inputs, debts, salary, risk_fund, pension | Nothing for employees |
| One user per farm | `farmers.user_id unique`, RLS via `my_farmer_ids()` | Every policy goes through that one function. That makes the workspace change smaller (§4) |
| Land | `plots` (020), `parcels` | No field for who owns the land |
| Arendă in the data | `docs/11` cites DAJ Alba prices for arendă 2025; `docs/04 §3` lists the zilieri register as roadmap | Nothing in code |
| Size limit | `MAX_FARM_HA = 1000`, persona 5–50 ha | Pivot to 100+ ha, see §6 |
| Demo switches | `DEMO_MODE` (API), `VITE_DEMO_MODE` (web), `farmers.demo_now`, `test_clock_id` | Global: every account gets the demo card and a frozen clock. See §7 |

---

## 1. Employee salaries as expenses (every farm)

### 1.1 Data

Migration `026_employees.sql` (025 is the admin panel's):

```sql
create table employees (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  name text not null,                    -- what the farmer calls them: "Nelu tractoristul"
  role text,                             -- tractorist, mecanic, paznic, muncitor, contabil… (free text + suggestions)
  kind text not null check (kind in ('permanent', 'seasonal', 'zilier')),
  cost_bani bigint not null check (cost_bani > 0), -- what the person costs the farm in total: per month, or per day for a zilier
  pay_basis text not null check (pay_basis in ('month', 'day')),
  days_per_month int,                    -- zilier/seasonal: planned days in an active month
  active_months int[],                   -- seasonal/zilier: 1..12. Null = every month
  pay_day int not null default 10 check (pay_day between 1 and 31),
  starts_on date not null,
  ends_on date,
  user_id uuid references auth.users(id), -- set once they join the workspace (§4). Optional
  archived_at timestamptz
);
alter table transactions add column employee_id uuid references employees(id) on delete set null;
```

Same RLS loop as 001. Grants as in 010 (new tables get none automatically).

**Total cost, as the farmer types it (D2, decided).** The farmer types what the person costs him in total
(pay + taxes + contributions), the number he sees from his accountant. The app doesn't split it into net and
taxes, so it needs **no tax rates**: no `payroll-2026.json`, nothing to source before building. The whole
cost counts on the pay day. (In reality the taxes leave about two weeks later; for a monthly plan that's close
enough, and it errs on the safe side.)

Pure function in `packages/shared/src/payroll/`:

```ts
payrollMonth(employees, month) => {
  perEmployee: { employeeId, costBani, payDate }[];
  totalBani: Bani;
}
```
Paid by the month: the work of a month is paid on the pay day of the next month (so the first pay comes a month after
someone starts, the last a month after they leave). Paid by the day: in the same month, dated on its last day.

Integer bani everywhere. Tests: permanent, seasonal off-month, zilier days × rate, one who starts mid-month
(whole month or pro rata: pro rata by days, rounded down to the ban), one who ends, archived.

### 1.2 Expense categories

Add to `EXPENSE_CATEGORIES` (after `rent`, outside the first five so they never replace the crop cost):

- `salaries` — "Salarii și taxele pe ele" (the whole cost of the people, matching D2)

`expenseCategory()` stays as it is. `ExpenseInputSchema` gains `employeeId: z.uuid().optional()`, allowed only
on `salaries`.

### 1.3 In the plan

- `TimelineInput` gets `payroll?: PayrollInput`. Each month adds the total cost on the pay day.
- They're **fixed set-asides** in `smoothing.ts`: the people are paid first, the farmer's own salary is what's left.
- A recorded `salaries` expense with `employee_id` replaces that person's planned pay in that month (same idea
  as `replaces_estimate` on events). Without `employee_id` it replaces nothing and comes on top.
- New insight in `insights.ts`: **"În [luna] nu ajung banii de salariile oamenilor"**. It ranks above the farmer's own
  salary warnings. Drivers (`drivers.ts`) list payroll as a driver when it's the largest out-flow.
- **Double counting (D3, decided: just ask).** `crops-reference.json` costs per ha include field work (arat, recoltat…)
  that a small farm pays someone else to do. A farm whose own people do it would count that work twice: once in the
  crop cost, once in payroll. The app asks once, on "Oameni" and in onboarding: **"Lucrările pe câmp le fac oamenii
  tăi?"** → `farmers.own_field_work boolean`.
  - Yes, and the farmer hasn't typed his own cost per ha → a card on Recolte: "Costul pe hectar al fermei tale nu
    include munca oamenilor? Scrie-l aici", which opens the existing own-cost field (P31). His own cost then replaces
    the average, as it already does.
  - Yes, and he typed it → nothing to do.
  - The app **doesn't** cut a guessed share out of the average: `crops-reference.json` has no labour share, and
    inventing one is against the rules.

### 1.4 Envelope

Add `payroll` ("Salariile oamenilor") to `envelope_kind` (`alter type … add value`), and to `ENVELOPE_KINDS`. **In step 3, in two migration files:** the runner wraps each file in one transaction, and Postgres can't use a new enum value in the transaction that adds it. The first adds the value, the second gives every existing farm its envelope row (`create_farm` already makes one per enum value for new farms).
`allocation.ts` fills it before `salary`: target = the next N months of payroll (N in `plan-params.json`).

### 1.5 Screens

- **New screen "Oameni"** (`web/screens/oameni.tsx`, in `SCREENS`, with a skeleton). List of people, what each costs a month,
  total for the month, add/edit sheet. Archive, never delete (old expenses keep their name).
- **"Am plătit salariile pe [luna]"**: one tap records every active person's pay as `salaries` expenses, from the
  payroll envelope. Editable amounts before saving. **Can go in the offline queue** (it records what already
  happened, same rule as other expenses).
- Calendar: pay day appears as a generated event (like the calendar-2026 tasks), not as a `farm_events` row.
- Bani: the expense list shows the person's name on a salary expense.

### 1.6 Assistant / functions

- `whatIf` gains "angajez pe cineva" (total cost, from which month, seasonal or not) → effect on the farmer's salary and the
  lowest month. Registered in `functions/registry.ts`, with tests like `f5.test.ts`.
- Assistant test questions: "Îmi permit încă un tractorist din martie?", "Cât mă costă oamenii pe an?".

### 1.7 Not in this step

Paying employees through Stripe (money movement, KYC for each person). Producing the payroll declaration
itself. The app reminds and adds up; the accountant files.

---

## 2. Two kinds of farm at onboarding

### 2.1 The question

New first step in `Onboarding.tsx`, before "Despre tine":

> **Cum lucrezi pământul?**
> - **Pământul e al meu, am oameni care îl lucrează.** Your land, your team: payroll, field work, your salary, your pension.
> - **Iau pământ în arendă și am oameni care fac munca.** You run it: landowners, contracts, rent day, your team.

(With the 100+ ha pivot, "I work it alone with the family" is no longer the main case, so both answers assume employees.
Most farms have both kinds of land, so the question is "which one is most of it", and tenure is set per plot anyway.)

Stored as `farmers.farm_mode text not null default 'own' check (farm_mode in ('own', 'arendas'))`.
`OnboardingInputSchema` gets `farmMode`. Changeable later in "Schimbă ferma".

### 2.2 What the mode changes (and what it doesn't)

The mode is a **preset for the interface**, not two data models. Land tenure and employees live on every farm,
because an owner with 300 ha often also takes some land in arendă, and an arendaș usually has some plots of his own.

| | `own` | `arendas` |
|---|---|---|
| Navigation | today's + **Echipa** (with **Oameni**) | adds **Arendă** too |
| Onboarding step 2 | crops + ha, "câte sunt în arendă?" (often some) | crops + ha, "câte sunt în arendă?" (most) |
| Onboarding extra step | "Câți oameni ai?" (quick add, can skip) | same, plus "Câți proprietari?" (just a number for now) |
| Home | the month's money: payroll, then your salary | rent due, payroll, then your salary |
| Salary / pension | yes | yes. The owner still wants a steady income; it's what's left after people and rent |
| Ha | from 100, see §6.1 | from 100, see §6.1 |

### 2.3 Land tenure per plot

`plots.tenure text not null default 'own' check (tenure in ('own', 'leased_in', 'leased_out'))`, plus
`lease_contract_id` (§3). `leased_out` is land the farm owns and lets to someone else (D5). The APIA cerere reader
can't tell tenure (and a cerere doesn't list land given away), so the onboarding asks: "câte ha sunt în arendă la
tine?" and "ai pământ dat în arendă altcuiva?".

---

## 3. Arendă: what the arendaș needs

Below in order of value. 3.1–3.4 is the minimum that makes the mode worth choosing.

### 3.1 Landowners (arendatori)

`landowners`: name, locality, phone (optional), preferred payment (`cash` / `in_kind` / `mixed`), note
(e.g. "moștenitorii lui X"), archived. **No CNP, no IBAN, ever (D4, decided).** Where a paper needs the CNP
(the tax withheld, §3.4), the accountant fills it in on their side. The app's export leaves that column empty.

Expect dozens to hundreds per arendaș, many elderly, many without phones. The list needs search, sort by
village, and "who hasn't been paid yet".

### 3.2 Contracts

`lease_contracts`: **direction** (`taken`: the farm works someone's land and pays rent; `given`: the farm lets its
own land to someone and gets rent, D5), landowner or lessee (same `landowners` table, renamed in the UI to
"Proprietari" / "Arendași" by direction), plots (or just ha + locality for land not yet on the map), start, end, rent per ha
as **lei and/or kg of a crop** (`rent_lei_per_ha`, `rent_kg_per_ha`, `rent_crop_id`), payment month, who pays
the land tax, registration number and date at the primărie, file (photo of the signed contract, through the
existing `Papers.tsx` upload).

Pure functions in `packages/shared/src/arenda/`:
- `rentDue(contract, year, prices)` → `{ lei, kg, cropId, leiEquivalent }`
- `expiringContracts(contracts, today, monthsAhead)`
- `coverage(plots, contracts)` → leased plots with no contract, contracts with no plot, total ha per landowner

The legal requirements (registration at the council, what APIA asks for leased land, duration rules) go in a new
`docs/15-arenda.md`, sourced. Everything unchecked → `DE-VERIFICAT`.

### 3.3 Money: rent in the plan

- **Cash rent** → planned out-flow in its payment month, category `rent` (already exists), linked by
  `lease_contract_id` on the transaction.
- **Rent in kind** → doesn't leave as money. It **lowers the tonnes left to sell**: `harvests.ts` / `StoredGrain`
  subtract the kg owed before the plan counts the sale. This is the part that's easy to get wrong and matters most:
  an arendaș paying 800 kg/ha in wheat has much less wheat to sell than his ha suggest.
- **Rent received (`given`, D5).** Cash → planned income in its month, new income type `rent_in` ("Arendă primită")
  next to `crop_sale`. In kind → grain that comes in: it **adds** to the grain to sell (`StoredGrain`), at the plan's
  sale price. Plots given away leave the farm's crop plan (no costs, no harvest) and, unless the contract says
  otherwise, the APIA subsidy for them is the lessee's: those ha drop out of `computeSubsidies`. Check that rule in
  `docs/15-arenda.md`.
- Conversion prices for in-kind rent (needed for tax, and to show a lei equivalent) are set per county each year
  by the DAJ. `docs/data/arenda-prices-2026.json` per county, sourced, `null` where not found (docs/11 already
  has Alba 2025).

### 3.4 Tax withheld on rent

When the arendaș pays an individual, he withholds the income tax and pays it to the state. The app shows per
landowner: gross, withheld, net (in lei or kg), and puts the deadline in the calendar. Rates, base (including
in-kind at the DAJ price), deadline and form all go in `arenda-prices-2026.json` with sources. **None of it is to
be filled from memory.** For the declaration itself, the app gives the accountant a list (name, locality, gross,
withheld, net; CNP column empty, D4) as CSV/PDF. On `given` contracts the farm is the one receiving: the app
shows what it should get after the lessee withholds, nothing to file.

### 3.5 Rent day ("ziua arendei")

The screen used in the yard, with people queueing:
- List for the year: each landowner, kg and/or lei net.
- Tap a name → "a primit" (kg given, lei given, date). Partial is allowed ("a luat 500 kg, vine pentru rest").
- A receipt for each (PDF/print/share), with what was given and what was withheld.
- **Fully offline.** It records what already happened, so it queues. One phone at a time does the handing out (or see §4.4).
- Totals at the end: kg given per crop (→ lowers stored grain), lei paid (→ `rent` expenses).

### 3.6 Later

- Renewal reminders **13 months** before a contract ends (7 for a one-year contract): it renews itself unless refused in writing a year ahead (Codul civil art. 1848, `docs/15-arenda.md` §1); a list of contracts expiring this year.
- Map (`harta-plan.md`): colour plots by tenure, tap a plot → its landowner.
- APIA cerere: export of leased plots with contract numbers for the declaration; warning for a leased plot with
  no registered contract.
- Heirs: move a contract to new landowners, keep history.
- Landowner statements: "Ce am primit de la [arendaș] în 2026", for their own tax return.

---

## 4. Workspace: several people on one farm

### 4.1 Data and RLS

```sql
create table farm_members (
  farmer_id uuid not null references farmers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'worker', 'accountant')),
  employee_id uuid references employees(id),
  invited_by uuid, joined_at timestamptz default now(),
  primary key (farmer_id, user_id)
);
```

- Backfill: every `farmers.user_id` becomes an `owner` row.
- `my_farmer_ids()` returns the farms the user is a **member** of. Every existing policy goes through it, so field
  work, calendar, plots and harvests open up to members in one change.
- Money tables (`transactions`, `envelopes`, `payouts`, `pension_plans`, `employees` pay columns, `landowners`,
  `lease_contracts`) switch to `my_farmer_ids_for('money')`: owner + manager + accountant (read-only for
  accountant via separate select/write policies). Worker never sees money or other people's pay.
- Every `where user_id = auth.uid()` lookup in the SQL functions (`record_expense`, `set_envelopes`,
  `update_farm`, …) changes to "the farm I'm acting on, and my role allows it". That's the real work here:
  list them all and test each with `npm run test:integration` (RLS tests on real Supabase).
- **Stripe stays owner-only.** Pension, payouts, Stripe setup: owner. The farm lease (`take_farm_lease`) already
  guards against two people running them at once.

### 4.2 Invites

Owner → "Invită pe cineva" → role → a link/code (share by WhatsApp/SMS, since many workers don't use e-mail).
The person makes an account (email + password, as today) and lands in the farm. Owner can change roles and
remove people. A member who leaves keeps nothing; their recorded work stays, with their name.

### 4.3 What a worker sees

A small app: **Azi** (what's assigned to me), **Am terminat** (finishes a `plot_operation`), **Motorină** (fuel log,
already a table), **Ore lucrate** (feeds the zilier register and seasonal pay). No money screens.

`plot_operations` gains `assigned_to employee_id`. The manager assigns from Calendar or the plot.

### 4.4 Shared state and offline

Today each phone queues its own writes. With several people, the order of writes matters for:
- envelopes (two people taking from one) — already guarded by `for update` in `record_expense`, OK;
- rent day on two phones — the same landowner marked paid twice. Use `client_id` idempotency (017) and a
  unique "one handover per landowner per year per crop", and show "deja dat de [nume]" when the second one syncs.

### 4.5 Activity

A simple feed on the farm: who recorded what, when. Comes almost free from `created_by` on the main tables (add
it when touching them in 4.1).

---

## 6. The 100+ ha pivot

### 6.1 Limits and onboarding

- `MIN_FARM_HA = 100` and `MAX_FARM_HA` move to `docs/data/plan-params.json` (not in code). Value from §6.3 (D6).
- **Soft minimum.** Under 100 ha onboarding says the app is built for farms from 100 ha and lets them go on. A hard block
  would lock out Ion's farm (15 ha, §7) and farms that grow into it.
- `parcels` with hundreds of rows: onboarding stops being "type each crop". It's the APIA cerere reader
  (`cerere-onboarding-plan.md`) or the LPIS map first, typing last. The cerere's photo limit (12 pages) is too low for a
  farm with 200 parcels: PDF upload becomes the main path, and the reader must handle long II.A tables (paged reading,
  totals checked against field 44).

### 6.2 What the bigger size changes in the engine

- **Subsidies.** Large farms hit rules small ones don't: capping/reduction of the basic payment above a threshold,
  the redistributive payment only on the first hectares, young-farmer limits per ha, eco-scheme ceilings. Check each
  rule in `03-subsidies.md` / `subsidies-2026.json` against the 2026 order; whatever isn't sourced → `DE-VERIFICAT`.
  Tests with a 100, 500 and 1500 ha farm.
- **Legal form.** At this size the farm is usually a company or an II/IF, not a person. `farmers.legal_form`
  (`pf`, `pfa`, `ii`, `if`, `srl`, `cooperative`…) asked at onboarding. It decides: who can employ, how the owner's
  "salary" is taxed (salary vs. dividends vs. self-employed income), and which pension options in `05-taxes-pension.md`
  apply. The owner's "salary" in the plan stays "what you can take out each month"; the tax part is shown per form
  from sourced data, never guessed.
- **Money scale.** Sums grow 10–100×. `MAX_RECORD_LEI` (10 000 000) and the `max` in the Zod schemas go into
  `plan-params.json`. `salary_round_lei` step likely bigger. Credit sizes in what-ifs too.
- **Several crops per plot and many plots.** Per-plot costs (`plot_id` on transactions) become the normal case, not
  the exception. Lists need search, grouping by crop/locality, and pagination (`lists/paginate.ts` exists).
- **Who uses the app.** The owner/manager of a 300 ha farm uses a laptop as much as a phone. Screens stay mobile-first
  but get a wide layout for the long tables (landowners, contracts, plots, payroll). The workspace (§4) stops being
  "later" and becomes core: a farm this size has a manager and an accountant.

### 6.3 How big a farm the app handles today (D6)

Per-ha figures from `crops-reference.json` (2025 data). Sale per ha = yield × price.

| Crop | Cost lei/ha (mean / max) | Sale lei/ha (mean / max) |
|---|---|---|
| Grâu | 4 250 / 5 000 | 5 × 1 050 = **5 250** / 6 × 1 200 = **7 200** |
| Porumb | 5 000 / 6 000 | 6,5 × 950 = **6 175** / 8 × 1 100 = **8 800** |
| Floarea-soarelui | 4 500 / 5 500 | 2,5 × 2 150 = **5 375** / 3 × 2 500 = **7 500** |

The limits in the code, and the farm size where each one breaks:

| Limit | Where | Value | Breaks at | Why |
|---|---|---|---|---|
| One sale, expense or money event | `MAX_RECORD_LEI` (`plan-inputs.ts`), `MAX_EVENT_LEI` (`events.ts`), `Amount` (`registry.ts`) | 10 000 000 lei | **~1 100 ha** of one crop (max porumb 8 800 lei/ha); ~1 600 ha at the mean | "Am vândut toată recolta de porumb" as one record, or a "toată recolta" sale in the calendar |
| A credit | `CreditInputSchema.amountLei` | 10 000 000 lei | ~1 700 ha (whole-farm spring costs at 6 000 lei/ha); 2 000 ha at the mean | A spring credit for all the inputs |
| Total farm | `MAX_FARM_HA` (`farm/index.ts`, total and per row) | 1 000 ha | **1 000 ha** | Set by hand for the old target |
| Reading the cerere | `MAX_TOKENS = 16000` (`ai/documents.ts`) | ~350 parcel rows (≈ 40 tokens per row of JSON, room for the rest) | ~1 000–1 700 ha at 3–5 ha per parcel | A long II.A table runs out of answer; the reader returns nothing (`stop_reason === 'max_tokens'`) |
| Saving plots on the map | `express.json({ limit: '100kb' })` (`app.ts`) | ~40 plots per save at 60 corners each (≈ 2,5 KB per plot) | **~200 ha** at 5 ha per plot | All plots of a year go in one `save_plots` call |
| APIA decision | `MAX_DECISION_BANI` | 10 000 000 lei | ~10 000 ha | Far off |
| Start balance | `startBalanceLei` | 100 000 000 lei | far off | — |
| Per plot | `plots.areaAri`, harvests `MAX_HA` | 1 000 ha / 100 000 ha | far off | — |
| Areas and money in the DB | `area_ari int`, `bigint` bani | 21 million ha / no limit | far off | — |

No limit that matters is slow, only fixed numbers, except one: `/api/farmers/me` (`FARM_SELECT`) loads **every**
transaction the farm ever recorded, embedded in one answer. A 300 ha farm with 10 people records several thousand
items a year (payroll, rent per landowner, per-plot costs). That's fine for a year or two, then it needs paging
(load the current and previous season, older on request).

**What it means:**
- **Today, without changes: 1 000 ha** is honest. The 10 M lei cap and the cerere reader both run out right around it.
- **One thing breaks well under 100 ha already:** saving map plots (~200 ha). Fix in step 0c whatever the max: raise the
  limit on that route only (like `routes/documents.ts` does), or save in batches.
- **To reach 5 000 ha** (the large family companies and big arendași, below the agroholdings): move the 10 M lei caps to
  `plan-params.json` and raise them to 100 M lei; read the cerere in chunks of pages, or as a PDF in several calls,
  and add the rows up; page the transactions in `/me`.
- Above 5 000 ha it's agroholdings: several farm units, their own ERP and accountants. Different product; not a target.

**Recommendation:** launch with `MAX_FARM_HA = 1 000` (no risk, only the plots fix), and plan step 0e to raise it to
5 000 once the three changes above are in and tested with a 5 000 ha test farm.

### 6.4 Docs and pitch to change

- `CLAUDE.md` (first paragraph: "fermelor mici și mijlocii (5–50 ha)", the persona), `docs/01-product.md`,
  `docs/persona.md`, `docs/02-problem-context.md`, `docs/09-demo-pitch.md`: new target, new persona (an owner or
  manager of a 100–1000 ha farm, with employees and landowners). The problem stays the same, only bigger: income in
  2–3 waves over 15 months, and now payroll and rent to pay every month and every autumn.
- `docs/10-plan.md`: add the steps from §8 below.
- `docs/11-open-questions.md`: the new `DE-VERIFICAT` items (payroll rates, arendă tax, DAJ prices, subsidy caps).

---

## 7. Demo settings only on the demo account

### 7.1 What's global today

| Setting | Where | Today |
|---|---|---|
| `DEMO_MODE=true` | `apps/api/src/env.ts`, `routes/money.ts` (`r.use('/demo', …)`) | `/api/demo/income` and `/api/demo/advance` answer for **every** signed-in farm |
| `VITE_DEMO_MODE` → `publicConfig().demo` | `web/components/pages/Bani.tsx` (`showDemo = !DEMO && !!publicConfig().demo && hasAccount`) | The **"Demo"** card (Simulează avansul APIA, move the clock forward) shows on every account |
| Test Clock + `demo_now` | `stripe/money.ts` `ensureSetup` | Every farm that sets up Stripe gets a Test Clock and a frozen `demo_now`. `farmToday()` then uses that date, so the farm's "today" stops moving |
| AI functions | `functions/registry.ts` `simulate_apia_advance`, `advance_clock` | Offered to the assistant on every account |
| Catalogue editors | `env.ts` `catalogueEditors` falls back to `DEMO_EMAIL` | Only the demo account can add fertilizers when `CATALOGUE_EDITORS` is unset |

### 7.2 The change: a per-account flag

- Migration `farmers.is_demo boolean not null default false`. **Only the server sets it**: no grant for `update` on
  that column to `authenticated` (or a trigger that refuses changes from non-service roles). The `seed:demo` script sets it
  on the `DEMO_EMAIL` farm.
- `DEMO_MODE` stays as a **kill switch** for the whole deployment (off → no demo anywhere, e.g. a production that
  shouldn't even have demo routes). On top of it, every demo route checks `farm.is_demo`:
  `r.use('/demo', …)` → 404 unless `deps.demoMode && farm.is_demo`.
- `ensureSetup` for a farm that's **not** demo: no Test Clock, no `demo_now`. The Stripe customer is created without
  `test_clock`. `farmToday()` already falls back to the real date when `demo_now` is null, so nothing else changes.
- The pension subscription: on the demo account it stays on the Test Clock (that's what makes "6 months forward" show
  invoices). On real accounts it runs on real time (still Stripe **test mode**; the `sk_test_` rule doesn't change).
- `/api/farmers/me` returns `isDemo`. The web shows the Demo card when `publicConfig().demo && me.isDemo`, and the
  assistant gets `simulate_apia_advance` / `advance_clock` only when `isDemo` (filter in the function registry by a
  context flag, like the existing "needs a farm" filter).
- Catalogue editors: `CATALOGUE_EDITORS` only. The `DEMO_EMAIL` fallback goes (it ties an admin right to the demo login).
  Set `CATALOGUE_EDITORS` in `.env` / the VPS before deploying, or nobody can add fertilizers.

### 7.3 Existing accounts

A one-off script (`scripts/undemo-accounts.ts`, dry-run by default, prints what it would do):
for every farm except `DEMO_EMAIL`'s: set `demo_now = null`, keep `test_clock_id` only as a pointer to clean up, and
delete its Test Clock in Stripe (deleting a clock deletes the customer and subscriptions on it, so the pension
subscription is re-created on a normal customer next time the farmer opens Pensie). **Records stay (D7, decided).**
Those written with a demo date may be dated after the real today. The plan already treats a recorded item by its date,
so a "future" expense simply shows in its month; the script prints how many there are per farm so we know.

### 7.4 What stays

- **The demo account** (`DEMO_EMAIL`, `is_demo = true`): Stripe Test Clock, demo clock, Demo card, `seed:demo`,
  `demo:rehearse`, all unchanged. `rehearse-demo.ts` gets a first check that the account is `is_demo`.
- **Ion's farm without an account** (`/ferma-lui-ion/…`, `demo-ion.json`, no API): the route and the account stay.

### 7.5 Ion, rescaled (D8, decided)

Ion becomes the new persona's farm. Same name, same county, same URLs, same `DEMO_EMAIL` account; only the data
grows. A proposal for `demo-ion.json` (these are Ion's own inputs, like his ha today, so they're demo data, not facts):

- **About 350 ha in Teleorman**: about 100 ha his own, about 250 ha taken in arendă from about 60 landowners, a few
  ha given in arendă to a neighbour (to show D5). Grâu, porumb, floarea-soarelui (the three crops with full data).
- `farm_mode = 'arendas'`, `legal_form` a company or an II, `own_field_work = true`, with his own cost per ha typed
  (so D3's card doesn't show in the pitch).
- **People**: a few permanent (tractoriști, a mecanic, a paznic) and a few seasonal for the harvest; their total costs
  typed as Ion would type them. Keep the numbers modest and in the file only.
- **Contracts**: mixed cash and in-kind, two expiring next year, one with no registered contract (shows the coverage
  warning), some already paid at "rent day" in October–November 2026 (the demo clock starts on 15 Nov 2026).
- Subsidies, the plan, the salary come out of the engine as today; nothing computed by hand into the file.
- The `seed:demo` script writes all of it into Supabase for the `DEMO_EMAIL` account (employees, landowners,
  contracts, plots with tenure) and sets `is_demo = true`. `demo:rehearse` and `docs/09-demo-pitch.md` §3 get the
  new story: income in waves vs. payroll every month and rent every autumn, and the owner's salary still steady.
- Check every screen with the bigger numbers (long lists, wide sums in lei, the Ion sidebar texts that say "15 ha").
- Tests: an API test that `/api/demo/*` is 404 for a non-demo farm with `DEMO_MODE=true`, 200 for the demo farm; a web
  test that the Demo card doesn't render without `isDemo`; a shared test that `farmToday` uses the real date when
  `demo_now` is null (likely exists already); an integration test that a signed-in user can't set `is_demo` on their own farm.

---

## 8. Order of work

| Step | What | Depends on |
|---|---|---|
| 0a | Demo only on the demo account (§7): `is_demo`, gated routes/card/functions, no Test Clock for real farms, catalogue editors | — (small, do first) |
| 0b | Take existing accounts off the demo clock, keep their records (§7.3) | 0a |
| 0c | Pivot docs (§6.4), size limits in `plan-params.json` (max 1 000 ha), soft 100 ha minimum, `legal_form`; fix the 100 KB limit on saving plots | — |
| 0d | Subsidy rules for large farms checked and tested (§6.2) | 0c |
| 0e | Raise to 5 000 ha: money caps to 100 M lei in `plan-params.json`, cerere read in chunks, paged transactions (§6.3) | 0c |
| 1 | ✅ (2026-11-14) `payroll` pure functions + tests (total cost, no tax rates needed) | — |
| 2 | ✅ (2026-11-14) Migration 026 (`employees`, `transactions.employee_id`, `record_expense` with the person); `/api/employees` add, change, archive; `salaries` category; people in `/api/me` | 1 |
| 3 | ✅ (2026-11-14) Payroll in the timeline + smoothing + insight + double-count question; the `payroll` envelope (migrations 030–031) | 2 |
| 4 | ✅ (2026-11-14) "Oameni" screen, "Am plătit salariile", calendar entries; the D3 question and the Recolte card (`cropsNeedingOwnCost`); the payroll warning on Acasă and Salariu (`plan.payrollShort`); what-if; assistant questions | 3 |
| 5 | ✅ (2026-11-15; migration 032) Onboarding mode question, `farm_mode`, `plots.tenure`, mode-aware navigation (Oameni moves under **Echipa**); cerere PDF as the main path; in onboarding, "Câți oameni ai?" (quick add) and the D3 question, which today is asked only on Oameni | 0c |
| 6 | ✅ (2026-11-15) `docs/15-arenda.md` + `arenda-prices-2026.json` sourced. Tax and county price in `packages/shared/src/arenda/prices.ts` (`rentTax`, `inKindPriceBani`); 5 counties read, the rest null; open items in docs/11 (21–25) | — (can run beside 1–4) |
| 7 | ✅ (2026-11-15; migration 033) Landowners + contracts, Arendă screen (its tab with `modes: ['arendas']` in `lib/ui/nav.ts`, also shown on an own-land farm with landowners or land let out), coverage; per-parcel tenure set here; onboarding's "Câți proprietari?". Pure: `packages/shared/src/arenda/contracts.ts` (`rentDue`, `refuseRenewalBy`, `expiringContracts`, `coverage`). Not yet: the contract's photo (`Papers.tsx`), the CASS hint (docs/15 §4) | 5, 6 |
| 8 | ✅ (2026-11-15) Rent in the plan (cash out, in-kind lowers grain to sell) + withholding. Pure: `arenda/schedule.ts` (`rentPayments`, `landownerYears`), entries `rent` / `rent_tax` / `rent_in` in `cashflow/timeline.ts`; county prices in `AppData.arenda`. A contract past its end keeps paying until marked ended (art. 1848). A `rent` expense replaces the month's planned money rent (no `lease_contract_id` on transactions yet: step 9). Accountant list as CSV on Arendă. No migration | 7 |
| 9 | Rent day screen, receipts, offline | 8 |
| 10 | Workspace: `farm_members`, RLS rewrite, invites, roles (core at 100+ ha, not "later"). Start from what Rapoarte already has: `028_farm_members.sql` (accountant/viewer, read-only reports). Oameni and the members go under one **Echipa** tab here | 4 (needs integration tests green) |
| 11 | Worker view, assignments, hours, zilier register | 10 |
| 12 | Renewals, map colouring, APIA export, heirs; wide layout for long tables | 9 |
| 13 | Ion rescaled (§7.5): `demo-ion.json`, `seed:demo`, `demo:rehearse`, pitch. The demo clock (`simulate.ts` `costsBetween`) must also record the people's pay as `salaries` expenses with the person, or the balance stays too high after "Dăm timpul înainte" | 9 (and 4 for the people) |

Each step: `npm test` green, tick in `docs/10-plan.md`, one line of status.

---

## 9. Decisions

- **D1. Target size.** Decided 2026-11-14: farms of at least 100 ha (§6).
- **D2. Pay.** Decided: the farmer types the **total cost** of each person. No tax rates needed (§1.1).
- **D3. Labour double counting.** Decided: **just ask** "Lucrările pe câmp le fac oamenii tăi?"; yes → prompt for his own
  cost per ha (§1.3).
- **D4. Landowner identity.** Decided: **no CNP stored**; the accountant fills it in (§3.1, §3.4).
- **D5. Land given in arendă.** Decided: **included** — `direction` on contracts, `leased_out` tenure, `rent_in` income (§2.3, §3.2, §3.3).
- **D6. Upper limit.** Decided 2026-11-14: **launch at 1 000 ha** (§6.3). 5 000 ha after step 0e. Not a target above that.
- **D7. Existing test accounts.** Decided: **keep their records** (§7.3).
- **D8. Ion.** Decided: **rescale** to about 350 ha with employees and landowners; same account and URLs (§7.5).

No open decisions left.
