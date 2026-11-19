# Plan: all of a farm's contracts — expiry, what to do, taxes to the state, money impact

Status: **steps 0–5 done (2026-11-18): decisions, the law and data files, the pure model, the tax lines, migration 048 + the API, contracts in the plan.** Next: step 6 (the Contracte screen). Decisions marked **C?** need an answer before the step that uses them; each has a
recommendation.

Goal: the farmer adds **any contract** the farm has signed (not only arendă). For each one the app:

1. knows **when it ends** and **by when he must act** (renew, refuse, end, buy out, deliver…), and reminds him in time;
2. says **what he does** at the end, as concrete actions;
3. shows **the taxes the contract brings to the state**: which tax, to whom, which form, by when, and **the amount
   computed** (or `null` + `DE-VERIFICAT` when we haven't read the rule);
4. shows **how the contract weighs on the farm's money**: per year, per month in the plan, effect on the monthly salary,
   and per hectare for land;
5. adds all this up **per farm** and **across all the farms** the person runs.

Same rules as everywhere (CLAUDE.md): figures only from `docs/data/*.json`, money in integer bani, no invented rates,
offline-first, nothing that moves money goes in the queue. The app shows the calculation; the accountant confirms it.

---

## 0. What exists today (checked 2026-11-18)

| Piece | Where | Today | What it means here |
|---|---|---|---|
| Arendă contracts | `lease_contracts` + `landowners` (033), `packages/shared/src/arenda/contracts.ts` | Taken/given, area, plots, lei/ha and kg/ha, pay month, primărie registration. `refuseRenewalBy` (art. 1848), `expiringContracts`, `coverage` | The richest contract type already works. **Keep it as is**, map it into the common view (§2) |
| Rent tax | `arenda/prices.ts` `rentTax`, `arenda/schedule.ts` `rentPayments` | 10% of net (8% of gross), due on the 25th of the next month; timeline entries `rent`, `rent_tax`, `rent_in` | The model for every other tax line (§4) |
| Legal sources | `docs/15-arenda.md` | Codul civil + Codul fiscal read for arendă | Same format for the new types: `docs/16-contracts-law.md` (step 1) |
| People | `employees` (026), `payroll/` | Total cost per person (D2: no tax rates), `starts_on`/`ends_on` | An employment contract **links** to an employee; doesn't duplicate pay (§1, C3) |
| Credits | `expected_payments.group_id` (009) | A credit and its repayments | A credit contract **links** to that group (C4) |
| Invoices | `invoices` (041), `vat-2026.json`, `legal_form` on the farm | VAT rates, Oblio/e-Factura | VAT lines of a contract reuse `vat-2026.json`; `legal_form` (PF/PFA/II/SRL) decides which tax lines apply |
| Papers | `farm_documents` (041), `document_proposals` (046), `source_document_id` on `lease_contracts` | A photo/PDF is read by Claude and turned into proposals the farmer confirms | Photo of a contract → proposed contract (step 8). `source_document_id` goes on `contracts` too |
| Calendar | `farm_events` (023), timeline `deadline` entries | Deadlines and repeating events | Contract deadlines and tax due days become derived timeline entries, not stored events (§3.4) |
| Several farms | `my_farms()` (039), `X-Farm-Id`, `farmStore()` per farm on the phone, `/ferme` | Pick one farm at a time; no totals across farms | The cross-farm totals are new (§6) |
| Roles | `farm_members` (035/040) | Owner/manager read and write farm money; workers see no amounts | Contracts carry amounts → owner/manager only, accountant read-only |

---

## 1. Contract types

A type decides: the default end rule, the actions at the end, the money shape and the tax lines.

| Type (`kind`) | UI name | Example | Money shape | Ends how | Taxes to the state (§4) |
|---|---|---|---|---|---|
| `arenda` | Arendă | existing `lease_contracts` | lei/ha and/or kg/ha per year | **tacit renewal** unless refused in writing ≥ 1 year before (art. 1848) | rent tax withheld, CASS hint, land tax |
| `comodat` | Folosință gratuită (comodat) | a neighbour's 3 ha for free | none | at its term | none (land tax: who pays) |
| `sale` | Vânzare de recoltă | 200 t wheat to a trader, 1 050 lei/t, delivery Jul–Aug, 20% advance | income on dates, tonnes of a crop | after the last delivery | VAT (reverse charge or special regime), income tax per `legal_form` |
| `supply` | Cumpărare pe credit / la recoltă | seeds and fertilizer now, paid at harvest (sometimes in grain) | expense moved to a later date, lei or kg | after the last payment | VAT on the invoice |
| `service` | Servicii | combine hire, accountant, transport, ANIF irrigation | fee per month / per ha / per job | at its term; may auto-renew with notice | VAT on the invoice |
| `leasing` | Leasing utilaj | a tractor over 48 monthly rates | monthly rates + residual value | last rate → **buy out or return** | VAT on each rate |
| `insurance` | Asigurare | crop insurance, machinery CASCO | yearly premium, maybe in instalments | at its term, **no automatic cover after** | none for the farm (C6) |
| `credit` | Credit | bank loan, APIA advance credit | linked to `expected_payments` group | last repayment | none (interest is a cost) |
| `employment` | Contract de muncă | fixed-term tractor driver, seasonal | linked to `employees` | fixed-term: at its term; indefinite: none | income tax, CAS, CASS, CAM (C3) |
| `other` | Alt contract | anything else | free schedule | free | none computed; the farmer may type an amount |

**C1. Which types in the first version?** Recommended: `arenda` (exists), `sale`, `supply`, `service`, `leasing`,
`insurance`, `other`. Then `comodat`, `credit`, `employment` (they need links to existing tables and more law).

---

## 2. Data model

### 2.1 One new table beside `lease_contracts` (C2)

**C2. Generalize `lease_contracts` or add a table beside it?** Recommended: **beside it.** Arendă has legal rules,
plots, in-kind rent, landowners and a working screen; moving it risks all of that for no gain. Both tables are read
into one pure `ContractView` (§2.3), which is what every screen, the plan and the totals use.

Migration `048_contracts.sql` (safe to run again, RLS through `my_farmer_ids()`, grants like 033, no delete: archived):

```sql
create table public.parties (                   -- the other side: a company or a person
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  name text not null,                           -- "Agricover", "Banca Transilvania", "Vasile Popa"
  kind text not null check (kind in ('company', 'person')),
  cui text,                                     -- a company's CUI is public; no CNP, no IBAN, ever (as D4)
  locality text, phone text, note text,
  archived_at timestamptz, client_id uuid,
  constraint parties_id_farm unique (id, farmer_id)
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  party_id uuid not null,                       -- (party_id, farmer_id) → parties: never crosses farms
  kind text not null check (kind in ('comodat','sale','supply','service','leasing','insurance','credit','employment','other')),
  title text,                                   -- "Grâu 2027 la Cargill"
  number text, signed_on date,
  starts_on date not null,
  ends_on date,                                 -- null: indefinite
  auto_renews boolean not null default false,   -- prefilled from the type, the farmer can change it
  notice_days int check (notice_days between 0 and 730),  -- how long before the end he must say no / announce
  renew_months int check (renew_months between 1 and 120), -- length of a renewal; null = same as the first term
  plot_ids uuid[] not null default '{}',        -- land contracts (comodat), insurance of given parcels
  crop_id text, quantity_kg bigint,             -- sale / supply in kind
  employee_id uuid references employees(id),    -- employment (C3)
  credit_group_id uuid,                         -- credit (C4): expected_payments.group_id
  vat_bp int,                                   -- VAT rate on the amounts, basis points; null = none / not known
  residual_bani bigint,                         -- leasing: buy-out value
  decision text check (decision in ('renew','end','renegotiate','buy_out','return')),
  decided_on date,
  source_document_id uuid references farm_documents(id),
  archived_at timestamptz, client_id uuid, created_at timestamptz default now()
);

create table public.contract_payments (         -- the money schedule, in or out
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null,
  contract_id uuid not null,                    -- (contract_id, farmer_id) → contracts
  direction text not null check (direction in ('in','out')),
  label text,                                   -- "Avans", "Rata", "Prima", "Livrarea 1"
  first_on date not null,
  repeat text not null default 'none' check (repeat in ('none','monthly','quarterly','yearly')),
  times int check (times between 1 and 600),    -- null with a repeat: until the contract ends
  amount_bani bigint check (amount_bani > 0),   -- without VAT
  per_ha boolean not null default false,        -- amount is per ha of the contract's plots (services, insurance)
  kg bigint, crop_id text,                      -- paid or delivered in kind
  constraint amount_or_kind check (amount_bani is not null or kg is not null)
);
```

- Owner and manager read and write; accountant reads (through the API, like `/contabil`); worker sees nothing.
- `lease_contracts` gets nothing new except `decision` + `decided_on` (same meaning as on `contracts`).
- Zod schemas in `packages/shared/src/contracts/model.ts`, same checks as the SQL (like `ContractInputSchema`).

### 2.2 Why a payment schedule and not "amount per year"

The types differ exactly in when the money moves: leasing is 48 equal rates plus a residual, a sale is an advance plus
deliveries, insurance is a premium in two instalments, a service is monthly. A list of `first_on + repeat + times`
rows covers them all and expands into dated flows with one pure function.

### 2.3 The common view (pure, `packages/shared/src/contracts/view.ts`)

```ts
interface ContractView {
  id: string; source: 'arenda' | 'contract'; kind: ContractKind;
  party: string; title: string; startsOn: IsoDate; endsOn: IsoDate | null;
  end: EndPlan;           // §3
  flows: ContractFlow[];  // dated money in/out, bani, plus kg of a crop (§5)
  taxes: TaxLine[];       // §4
  plotIds: string[]; areaAri: Ari | null;
}
fromLease(c: StoredContract, landowner, data, county): ContractView   // reuses refuseRenewalBy, rentPayments, rentTax
fromContract(c: StoredGeneralContract, payments, party, data, farm): ContractView
```

---

## 3. Expiry and what to do

### 3.1 The end rule, per contract (`contracts/end.ts`)

```ts
interface EndPlan {
  endsOn: IsoDate | null;
  actBy: IsoDate | null;    // last day to act; null = nothing to decide
  remindFrom: IsoDate | null;
  renewsItself: boolean;    // past actBy with no decision: it renews (arendă, auto-renew services)
  actions: EndAction[];     // what he can do, in the order we show them
  status: 'running' | 'decide_soon' | 'overdue' | 'renewed' | 'ending' | 'ended';
}
```

| Type | `actBy` | Reminder from | Actions offered | Without a decision |
|---|---|---|---|---|
| `arenda` | `refuseRenewalBy` (1 year before; 6 months for ≤ 1 year) | 1 month before `actBy` (as today) | **Las să se reînnoiască** · **Refuz în scris** (letter text to print/send, delivery proof kept) · **Renegociez** (new terms → act adițional, registered again at the primărie: `DE-VERIFICAT`) | renews for the same length; the plan keeps paying |
| auto-renewing `service`/`other` | `ends_on − notice_days` | 30 days before `actBy` | Las să continue · Anunț că închei · Renegociez | renews for `renew_months` |
| `insurance` | `ends_on` (a new policy must start the next day) | 45 days before | **Reînnoiesc** (new premium, asks the amount) · Caut altă ofertă · Nu mai asigur | **uncovered**: red on Acasă from `ends_on`, the plan drops the premium |
| `leasing` | `ends_on − notice_days` (contract's buy-out notice) | 60 days before | **Cumpăr utilajul** (residual in the plan) · Îl dau înapoi · Prelungesc | as the contract says: the farmer picks the default when adding it |
| `sale` | each delivery date | 14 days before each | Livrez · Am livrat (records the sale) · Amân (needs the buyer's OK) | late delivery: "verifică penalitățile din contract" |
| `supply` | each payment date | 14 days before | Plătesc · Plătesc în natură | the plan keeps the payment |
| `comodat` | `ends_on` (renewal by a new contract: `DE-VERIFICAT`) | 60 days before | Fac un contract nou · Predau terenul | parcels flagged "fără contract" by `coverage` |
| `employment` fixed-term | `ends_on − 1 day` (prolonging needs an act adițional and REVISAL before the end: `DE-VERIFICAT`) | 30 days before | Prelungesc · Îl angajez pe perioadă nedeterminată · Se încheie | `DE-VERIFICAT` whether it becomes indefinite (Codul muncii) |
| `credit` | last repayment | 30 days before | — | — |

The defaults (`auto_renews`, `notice_days`, which actions) live in `docs/data/contract-types.json`, each with its
source or `DE-VERIFICAT`; the farmer can change them on the contract ("Ce scrie în contractul tău?").

### 3.2 Recording the decision

"Am hotărât" writes `decision` + `decided_on`. It only notes what was decided, so it may go in the offline queue.
Effects in the plan: `end` stops the flows after `ends_on`; `renew` extends them by the renewal length; `buy_out`
adds the residual; `renegotiate` opens the contract to edit and keeps the old terms until saved.

### 3.3 The refusal letter (arendă first)

A printable text with the parties, contract number and primărie registration, and "refuz reînnoirea" with the date
(art. 1848 asks for writing). Built on the existing PDF path (`rapoarte-pdf-plan.md`). The farmer adds "trimis pe …,
cu confirmare de primire" and a photo of the proof → `farm_documents`. Wording reviewed by a lawyer: open question.

### 3.4 Where reminders show

- **Acasă**: one card "De hotărât" with the next contract whose `actBy` is closest ("Arenda cu Popa Ion: până pe
  1 oct 2027 spui dacă o mai vrei").
- **Calendar**: derived timeline entries `contract_act_by`, `contract_ends`, `contract_tax` (computed each time, not
  stored, so editing a contract can't leave stale events).
- **Notifications** (step 9f, not built): when it exists, it reads the same entries.

---

## 4. Taxes to the state

### 4.1 One shape for every tax (`contracts/taxes.ts`)

```ts
interface TaxLine {
  contractId: string;
  tax: 'rent_income_tax' | 'cass' | 'land_tax' | 'vat' | 'income_tax' | 'cas' | 'cam' | 'micro_tax';
  to: 'ANAF' | 'primarie';
  form: string | null;          // "D100", "D112", "D300", "DU", "decizia de impunere"; null when unread
  baseBani: Bani | null; rateBp: number | null; amountBani: Bani | null;
  dueOn: IsoDate | null;
  paidBy: 'farm' | 'other_side'; // withheld by the farm vs owed by the other side (shown, not counted)
  status: 'confirmed' | 'DE-VERIFICAT';
  source: string;               // article + link, from the data file
  note?: string;                // "Întreabă contabilul: depinde de celelalte venituri ale proprietarului"
}
```

Rates, bases, forms and due days come from **`docs/data/contract-taxes-2026.json`** (new), each with `source`, `url`,
`checked`, `status`. A rate not read in the official text is `null` + `DE-VERIFICAT` + an entry in
`docs/11-open-questions.md`; the line then shows "Nu știm încă suma" instead of a number.

### 4.2 The lines, per type

| Type | Line | Computed from | Status today |
|---|---|---|---|
| `arenda` taken | Impozit pe arendă reținut (10% × 80% of gross), due 25th of the next month | `rentTax` (exists) | rule read (docs/15 §3); form `DE-VERIFICAT` (#21) |
| `arenda` taken | CASS reținut pentru proprietar | not computed; hint when one owner's net rent ≥ 6 minimum wages (docs/15 §4) | `DE-VERIFICAT` (#24) |
| `arenda`/`comodat` | Impozit pe teren, to the primărie, whoever `land_tax_by` says | **typed** by the farmer from the decizia de impunere (rates are per locality) | no figure in data: typed only |
| `arenda` given | Impozitul reținut de arendaș (paid by the other side) | `rentTax` on the rent received; PF only. SRL: falls into its income tax | read; SRL rule `DE-VERIFICAT` |
| `sale` | TVA: taxare inversă for cereals and oilseeds between VAT payers / regim special agricol (compensație) / normal | `vat-2026.json` + `legal_form` + the buyer's VAT status | `DE-VERIFICAT` (Cod fiscal art. 331, 315^1 to read) |
| `sale` | Impozit pe venit | PF/II on normă: **none per contract** (the yearly DU line already in the calendar). SRL micro: turnover × rate | normă: docs/05; micro rate `DE-VERIFICAT` |
| `supply`, `service`, `leasing` | TVA pe factură (cost if not a VAT payer, deductible if he is) | amounts × `vat_bp` | rates in `vat-2026.json` |
| `employment` | Impozit, CAS, CASS, CAM, D112 by the 25th | C3 | `DE-VERIFICAT` (rates and any agri facilities for 2026) |
| `insurance`, `credit`, `comodat` | — | nothing to the state | C6 |

### 4.3 "Taxe" view

On the Contracte screen, a tab **Taxe**: month by month, what goes to the state, to whom, which form, by when, total
per month, "din care sume pe care nu le știm încă: 3". Withheld taxes are separate from the farm's own taxes
("Reții din arenda proprietarilor și plătești tu la ANAF"). Export as CSV for the accountant (like the arendă list).

**C3. Employment taxes.** D2 says the farmer types the person's **total cost**, with no rates. Recommended: keep D2
for the plan; on an employment contract show the taxes **only as a split of that total cost** once the rates are read
and confirmed in `contract-taxes-2026.json`; until then the line says "incluse în costul omului, le calculează
contabilul". No second source of pay.

**C6. Insurance premium tax.** Recommended: no line (the insurer settles any tax on premiums). Revisit only if the
law reading in step 1 says the farm owes something.

---

## 5. Money impact

### 5.1 Flows into the plan

`contractFlows(view, from, to)` expands the payment schedule (and the arendă rent via `rentPayments`) into dated
entries. In `cashflow/timeline.ts` a new source `contracts` adds entries of kind `contract_in`, `contract_out`,
`contract_tax`, the same way `rent` / `rent_tax` / `rent_in` come in today:

- a `sale` contract **fixes the price** of its tonnes: the forecast sells only what's left at the market price
  (that's the honest effect of a forward contract), and kg in kind reduce grain to sell, as rent in kind does;
- a `supply` payment in kind lowers the grain to sell at harvest;
- a recorded transaction linked to the contract (`transactions.contract_id`, new nullable column) replaces that
  month's planned payment, the rule `rent` already follows;
- VAT: added to `out` flows when the farm isn't a VAT payer; shown apart when it is (comes back by D300).

### 5.2 What the contract card says

Pure function `contractImpact(view, plan)`:

| Line | Computed | UI copy |
|---|---|---|
| Per year | sum of flows per agricultural year, in and out, with taxes | „Pe 2027: plătești 48.000 lei, plus 3.840 lei impozit reținut” |
| Share | out ÷ the year's costs, in ÷ the year's income | „Asta e 12% din cheltuielile fermei pe an” |
| Salary | smoothing run with and without the contract's flows (what-if, as Oameni does) | „Fără contractul ăsta, salariul tău lunar ar fi 6.200 lei, nu 5.400 lei” |
| Per ha (land) | (margin of the crop on those plots from `crops-reference.json`) − rent − taxes, per ha | „Pământul ăsta îți lasă 410 lei/ha pe an după arendă” — the number that decides „îl mai iau?” |
| Until the end | flows from today to `ends_on` (or to the next `actBy`) | „Până se termină mai ai de plătit 96.000 lei” |

The per-ha line uses the same margins as the scenarios; where a crop has no reference figure it says so instead of
guessing.

### 5.3 Per farm

On the Contracte screen header: contracts in force, money out and in per year from contracts, taxes per year, next
decision. The same numbers feed one line on Acasă and the Rapoarte PDF (a "Contracte" section).

---

## 6. Across all farms

### 6.1 What it shows

On `/ferme` (already the farms list, outside `SCREENS`): a section **„Toate fermele”**, and the Contracte screen gets
a toggle **„Doar ferma asta / Toate fermele”**:

- per farm and in total: contracts in force, money out/in per year from contracts, taxes to the state per year, the
  hectares taken / given in arendă, decisions due in the next 90 days;
- one merged list "De hotărât" and one merged "Taxe" month view, each row tagged with its farm;
- only the farms where the person is **owner or manager** (an accountant sees the farms they're invited to, read-only;
  a worker sees none).

### 6.2 How

- Pure: `sumFarms(perFarm: FarmContractsSummary[]): CrossFarmSummary` in `packages/shared/src/contracts/totals.ts`.
  Integer bani throughout; no currency mixing (all lei).
- API: `GET /api/farms/contracts-summary` loops over `my_farms()` with role owner/manager/accountant, builds each
  farm's views with the same pure code, returns per farm + total. No `X-Farm-Id` (it's the one route that spans farms).
- **The same landowner on two farms** stays two rows (each farm's `landowners` is its own); the total says
  "proprietari: 240 (unii pot fi pe mai multe ferme)". **C5** below.

### 6.3 Offline

Each farm's data is on the phone only if that farm was opened there (`farmStore` per farm). Offline the total is
built from the farms the phone holds, and says which are missing: „Fără Ferma Vida: n-a fost deschisă pe telefonul
ăsta.” Online it uses the API. The contracts themselves and their expiry and tax maths are pure, so a held farm works
fully offline.

**C5. Match the same person across farms?** Recommended: **no** for now (no CNP stored, names collide). Later, an
explicit "e același om" link if a user asks.

**C7. Totals across farms owned by different legal persons** (an SRL and a PFA): taxes are per legal person, so the
total is an overview, never a filing figure. Recommended: show it with that sentence under it.

---

## 7. Screens and copy

New screen **Contracte** (`/contracte`, in `SCREENS` + skeleton in `web/components/skeleton/screens.tsx`), in the nav
under Bani for owner/manager. Arendă stays its own screen for landowners and rent day; its contracts appear in the
Contracte list and open the existing arendă card.

- **De hotărât** (default tab): cards sorted by `actBy`, big buttons with the actions from §3.1.
- **Toate**: grouped by type, each row: party, what for, until when, money per year.
- **Taxe**: §4.3.
- **Adaugă un contract**: pick the type (big tiles with icons), then at most 6 fields on one screen: cu cine, de
  când, până când, cât și când plătești/primești, se reînnoiește singur?, poza contractului (optional). The rest is in
  "Mai multe detalii".
- Words: "se termină", "până pe … hotărăști", "îl mai vrei?", "bani la stat", "îți rămân". Never "lichiditate",
  "randament", "cash-flow" (CLAUDE.md).
- `appHref` for links, `storageKey` for keys; Ion's farm (`/ferma-lui-ion/contracte`) reads contracts from
  `demo-ion.json` and never calls the API.
- Offline: adding, editing, archiving a contract and recording a decision go in the outbox (they note what was signed
  or decided; no money moves). The cross-farm summary and reading a photo need internet (`NetButton` with a reason).

### Assistant

Functions (`packages/shared/src/functions/contracts.ts`, like `arenda.ts`): `addContract`, `updateContract`,
`archiveContract`, `decideContract` with confirmation cards; read tools for "ce contracte expiră anul ăsta?", "cât
plătesc la stat în decembrie?", "cât mă costă leasingul pe an?", "pe toate fermele, cât dau arendă?". Five new test
questions in `test:assistant`.

---

## 8. Steps, in order

Each step: `npm test` green → tick in `docs/10-plan.md` → one line of status. No commit unless asked.

| # | Step | Touches | Done when |
|---|---|---|---|
| 0 | Answer C1–C7 | this doc | decisions in §9. *Done 2026-11-18: the recommendations* |
| 1 | **Read the law** for the chosen types: Codul civil (comodat art. 2146+, contract term and tacit renewal in general, sale), Codul fiscal (VAT art. 331, 315^1; micro tax; salary taxes if C3), Codul muncii (fixed-term), REVISAL/REZ. Write `docs/16-contracts-law.md` and `docs/data/contract-types.json` + `contract-taxes-2026.json`, sources and `DE-VERIFICAT`; new entries in `docs/11`. *Done 2026-11-18 for the C1 types (+ comodat); employment not read (C3). Open items: docs/11 #42–49, P-C1–P-C3* | docs, data | every number in the two files has a source or is `null` |
| 2 | **Pure model**: `packages/shared/src/contracts/` — `model.ts` (Zod), `schedule.ts` (expand payments), `end.ts` (`EndPlan`), `view.ts` (`fromLease`, `fromContract`), with tests incl. leap days, 31st of the month, indefinite, renewed twice | shared | tests for each type's end rule and schedule. *Done 2026-11-18; `contracts` also gets `area_ari` (ha for per-ha payments) in 048* |
| 3 | **Taxes**: `taxes.ts` from the data file; arendă through `rentTax`; tests that a `null` rate gives `amountBani: null`, never 0 | shared | tests per type and per `legal_form`. *Done 2026-11-18: `TaxLine` also has `effect` (owed / withheld / deductible / cost / other_side) instead of only `paidBy`; the farm's `legal_form` + `vat_status` (041) + a micro yes/no come in as `TaxProfile`; the other side's VAT status from its CUI (RO); land tax only from a typed yearly amount* |
| 4 | **Database + API**: migration 048 (`parties`, `contracts`, `contract_payments`, `transactions.contract_id`, `decision` on `lease_contracts`), RLS + grants, `/api/contracts` CRUD + decide, idempotent by `client_id`; integration tests (owner/manager write, accountant reads, worker refused, no cross-farm party) | migration, `apps/api` | `npm run test:integration` green. *Done 2026-11-18: 048 applied; the contracts suite is green. The accountant reads through RLS (a select policy), not a separate route. Schedules are replaced through `replace_contract_payments` in one transaction. 45 older integration tests were already red at `227d6aa`* |
| 5 | **Into the plan**: `contract_*` entries in the timeline, fixed-price sale tonnes, recorded transaction replaces the planned one; `contractImpact` (year, share, salary what-if, per ha) | `cashflow/`, `contracts/impact.ts` | a 200 t sale contract moves that income to its dates and lowers the market tonnes; tests. *Done 2026-11-18. The farm's tax profile isn't loaded with the farm yet (`PlanFarm.tax_profile`): until step 6 asks for it, VAT on costs counts as a cost and VAT on sales / micro tax stay out. Per-ha uses the farm's mean margin, not the crop on the contract's own parcels* |
| 6 | **Contracte screen**: tabs, add flow, card, decision buttons, refusal letter for arendă; Acasă card; calendar entries; skeleton; Ion's demo contracts in `demo-ion.json` (a sale, a leasing, an insurance ending soon) | `web/` | screen tests; works offline on a held farm |
| 7 | **Across all farms**: `totals.ts`, `GET /api/farms/contracts-summary`, `/ferme` section, toggle on Contracte, offline from held farms | shared, api, web | test: two farms, totals = sum, a worker on one sees nothing of it |
| 8 | **Photo → contract**: a new paper kind `contract` in `document_proposals`, Claude reads parties, dates, amounts, renewal clause; the farmer confirms each field | documents, api | a scanned contract proposes a full contract the farmer saves |
| 9 | **Assistant**: the functions and read tools, test questions | functions, assistant | `test:assistant` passes the new questions |
| later | `comodat`, `credit`, `employment` (if not in C1); reminders by notification (9f); "same person" link (C5) | | |

Steps 1 and 2 can run in parallel. Step 5 needs 3 and 4; 7 needs 5.

---

## 9. Decisions

**Taken 2026-11-18: all seven as recommended.**

- **C1.** First-version types: `arenda` (exists), `sale`, `supply`, `service`, `leasing`, `insurance`, `other`.
- **C2.** New `contracts` table beside `lease_contracts`, one pure view over both.
- **C3.** Employment taxes only as a split of the typed total cost (D2 stands), once the rates are confirmed.
- **C4.** A credit contract links to the existing `expected_payments` group instead of copying the repayments.
- **C5.** No matching of the same person across farms.
- **C6.** No tax line for insurance. *The law reading backs it: insurance is VAT-exempt (Codul fiscal art. 292 (2) lit. b)) and nothing else was found.*
- **C7.** Cross-farm totals are an overview; taxes stay per farm (per legal person) with that said on screen.
