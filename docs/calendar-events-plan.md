# Plan: The farmer's own events in the calendar, and what moves the forecast most

Status: **built 2026-11-14, steps 1–3 and 5–11, and the assistant half of 12; migration 023 written, not applied; push reminders wait for 9f.** Owner's answers:
1. Money events **do** change the plan (salary, lowest point, forecast).
2. The farmer's events **do** count in „termene în 30 de zile” and in the warnings on `/acasa`.
3. Editing or deleting a repeating event offers **both** „Doar asta” and „Toate”.
4. „E toată recolta” starts ticked when the sum is within ±`whole_harvest_match_pct` of the crop's estimate (yes).
5. „De acum înainte” is in too: it splits the series in two (yes).
6. A farmer with a fixed salary sees the lowest point first and the salary effect too, with a note that the salary is fixed (yes).

Plus a new part: **a list of the income and costs that move the forecast most, largest first** (Part B).

---

# Part A — Adding events to the calendar

## What the farmer gets
- An **„Adaugă”** button on `/calendar`, plus a **„+”** on the day picked in the grid (the date is already filled in).
- One sheet, „Despre ce?”, for anything a farmer plans or wants to remember:
  - **On a parcel:** erbicid, fungicid, insecticid, îngrășat, arat/discuit, semănat, irigat, recoltat, altă lucrare.
  - **On a crop** (all its parcels): „verific rapița de dăunători”, „sun cumpărătorul pentru porumb”.
  - **Animals:** vaccinare, vizita veterinarului, fătare, tuns.
  - **Machinery:** revizie tractor, ITP, RCA, reparație combină.
  - **Bani de plătit / Bani de primit:** rata la bancă, arenda, impozitul pe teren, o vânzare promisă, o chirie încasată. **With a sum, these change the plan** (Decision 3).
  - **Paperwork:** primărie, APIA, registrul agricol, contracte.
  - **Altceva:** free text.
- Each event has a day (or several days), an optional hour, an optional reminder („cu 3 zile înainte”), an optional repeat (every year / every month), and a note.
- The events show in the grid, on the day panel, in the list by month, in „Urmează” and in „termene în 30 de zile”. The farmer can tick them „Făcut”, edit them, delete them, or add them to the phone's calendar (.ics).
- For a repeating event, „Schimbă” and „Șterge” ask **„Doar asta” or „Toate”**.
- A money event, once its day has passed, asks **„Ai plătit?” / „Ai primit banii?”**. „Da” records the real sale or expense (prefilled, the farmer can fix the sum), and the planned one leaves the plan.
- **Offline:** adding, editing, ticking and deleting all work without internet and are sent later. Nothing here moves money: a planned sum only changes the forecast, and „Da, am plătit” goes through the existing expense/sale flow, which may already be queued (CLAUDE.md: recorded sales and expenses can wait in the queue).

## What already exists (reuse, don't duplicate)
| Piece | Where | How this plan uses it |
|---|---|---|
| Calendar page (grid, day panel, tabs, month list, „Făcute”) | `web/components/pages/Calendar.tsx` | Events become one more source of `Item`s, beside plan entries and followed calls. |
| Detail pop-up + actions | `web/components/app/ItemSheet.tsx` (`ItemDetail`, `ItemActions`) | Adds edit / delete / .ics / „Ai plătit?” for events. |
| Parcels with stable ids, and work on them | `supabase/migrations/020_plots.sql` (`plots`, `plot_operations`), `packages/shared/src/plots/{model,operations}.ts` | **Parcel work is a `plot_operations` row**, not a new table. `docs/harta-plan.md` §10 already says planned operations show in the calendar. |
| Plan inputs | `timelineInput()` in `cashflow/farm-plan.ts`, `TimelineInput` in `cashflow/timeline.ts` | Planned money enters here, so `buildFarmPlan`, `longForecast` and `afterBadHarvest` all see it with no extra wiring. |
| „Replaces the estimate” rule | `PLANNED_CATEGORIES`, `replacesPlannedCost`, `RecordedItem.replacesPlanned` in `farm/plan-inputs.ts` | Same rule for planned money, so a planned seed bill and a recorded one behave alike. |
| Expense categories | `EXPENSE_CATEGORIES` | Money-out events use the same list (no second list of words). |
| Offline queue | `web/lib/live/outbox.ts` (`QUEUEABLE`), `web/lib/cc/store.ts` | New queueable names for events. |
| Idempotent writes | `client_id` columns (017), replay cache (018) | Every new insert carries a `clientId`. |
| .ics export | `packages/shared/src/calendar/ics.ts` | One occurrence → one .ics, same as deadlines. |
| Confirmation cards in the assistant | 9d, `packages/shared/src/functions/registry.ts` | Later step: „Pune-mi tratamentul pe vineri”, „Ce îmi scade salariul cel mai mult?”. |

## Decisions
1. **Two stores, one sheet.** Parcel work goes to `plot_operations` (status `planned`, or `done` when the date is past and the farmer says so). Everything else goes to a new `farm_events` table. The farmer sees one form; the category picks where it is saved. Reason: the parcel page, `operationsStatus`, treatment expenses and the invoice reader already read `plot_operations`, so a second copy of „fungicid pe Bloc 286” would drift.
2. **Link to `plots`, never to `parcels`.** `update_farm` deletes and re-inserts `parcels`, so their ids don't last. `plots.id` does. A parcel event needs `020_plots.sql` applied to Supabase (still waiting, see `docs/harta-plan.md` step 1). Until then the sheet offers „Pe o cultură” instead of „Pe o parcelă”.
3. **Money events change the plan.** A `money` event with a sum becomes a planned entry in the timeline, in every scenario (bad/medium/good), at its own day. It is the farmer's own figure, so it is **not** `unverified` and has `min = probable = max`.
   - **Out, in a category the plan already estimates** (`PLANNED_CATEGORIES`: seeds, fertiliser, treatments…, with a crop): it **replaces** that crop's planned cost in the same month, exactly like a recorded expense does today. The sheet says so: „Pune asta în locul estimării pentru grâu din martie”.
   - **Out, in any other category** (rent, constructions, machine_service, services, other, loan rate): it is **extra**, on top of the plan.
   - **In, with a crop:** a planned sale of that crop. It replaces the plan's estimated sale of that crop in the same harvest year **only if** the farmer ticks „E toată recolta” (default off); otherwise it is extra (e.g. selling straw). Open question 1.
   - **In, without a crop:** extra (rent received, a grant already promised in writing).
   - A sum the farmer types is never shown as an official figure; the row says „suma ta”.
4. **Past money events don't vanish.** An unconfirmed money event whose day has passed stays in the plan in the current month (like a late payment) until the farmer says „Da” (it becomes a recorded transaction and the planned entry goes away) or „Nu mai e cazul” (cancelled for that occurrence).
5. **Occurrences have their own rows when they differ.** A repeating event stores the series; a `farm_event_occurrences` row holds anything about one date: moved, renamed, other sum, cancelled, done, or the transaction it became. „Doar asta” writes that row; „Toate” changes the series. When „Toate” changes the day pattern, rows for dates that no longer exist are kept only if done or confirmed; the others are dropped, and the sheet says how many before saving.
   - A one-off event uses the same table for its done state (one row, `original_date = starts_on`), so ticks work one way for everything. `task_completions` stays for official deadlines only.
6. **Repeats are „în fiecare lună” and „în fiecare an”,** with an optional end date. Occurrences are computed, never stored in bulk. Monthly on the 31st falls on the month's last day; yearly on 29 Feb falls on 28 Feb.
7. **Salary safety.** A fixed salary (`salary_bani`) stays fixed. If a new planned cost means it no longer fits, the existing `salaryToPay` rule lowers it and `/salariu` explains why, naming the event („din cauza ratei din martie”). Adding an event never starts a payout or a transfer.

## Data model — `023_farm_events.sql` (safe to run again)
`022` went to fertilizers (renamed `024` later), so this is `023`.

```sql
create table if not exists public.farm_events (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  category text not null check (category in
    ('crop', 'animals', 'machinery', 'money', 'paperwork', 'other')),
  title text not null check (char_length(title) between 1 and 80),
  note text check (char_length(note) between 1 and 500),
  starts_on date not null,
  ends_on date,                                  -- null = one day
  at_time time,                                  -- null = all day
  repeat text not null default 'none' check (repeat in ('none', 'monthly', 'yearly')),
  repeat_until date,
  remind_days_before int check (remind_days_before between 0 and 60),
  crop_id text check (char_length(crop_id) between 1 and 40),   -- checked against crops + ownCrops in the API
  plot_id uuid,                                  -- an event *about* a parcel that isn't work (e.g. „vine expertul de la asigurare”)
  -- Money (only when category = 'money'):
  direction text check (direction in ('in', 'out')),
  amount_bani bigint check (amount_bani > 0),    -- per occurrence, integer bani
  expense_category text,                         -- one of EXPENSE_CATEGORIES (checked in the API, the list lives in TS)
  replaces_estimate boolean not null default false,
  client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  check (repeat_until is null or repeat_until >= starts_on),
  check (repeat = 'none' or ends_on is null),    -- no multi-day repeating events
  check ((category = 'money') = (direction is not null)),
  check (amount_bani is null or category = 'money'),
  check (expense_category is null or direction = 'out'),
  unique (farmer_id, client_id),
  foreign key (plot_id, farmer_id) references public.plots (id, farmer_id) on delete set null (plot_id)
);
create index if not exists farm_events_farmer_start on public.farm_events (farmer_id, starts_on);

create table if not exists public.farm_event_occurrences (
  event_id uuid not null references public.farm_events(id) on delete cascade,
  farmer_id uuid not null references farmers(id) on delete cascade,
  original_date date not null,                   -- which date of the series this is about
  moved_to date,                                 -- „Doar asta” moved it
  at_time time,
  title text check (char_length(title) between 1 and 80),
  note text check (char_length(note) between 1 and 500),
  amount_bani bigint check (amount_bani > 0),    -- „Doar asta” changed the sum
  cancelled boolean not null default false,
  done_at timestamptz,
  transaction_id uuid references public.transactions(id) on delete set null,   -- „Da, am plătit” became this
  client_id uuid,
  primary key (event_id, original_date),
  unique (farmer_id, client_id)
);
-- RLS on both: for all to authenticated, using/with check farmer_id in (select public.my_farmer_ids()).
-- A trigger (or a composite FK on (event_id, farmer_id)) keeps an occurrence on its own farm's event.
-- Grants: select, insert, update, delete to authenticated and service_role (no automatic grants since 30 Oct 2026).
```
- `FARM_SELECT` in `apps/api/src/db/repo.ts` adds `farm_events(*, farm_event_occurrences(*))`, and `plot_operations` for the current and next harvest year, so the phone has everything offline.
- `StoredFarm` gets `farm_events?: StoredEvent[]` (with `occurrences`) and `plot_operations?: StoredOperation[]`.

## Shared logic (pure, tested)
### `packages/shared/src/calendar/events.ts`
- `EVENT_CATEGORIES`, `EventInputSchema` (Zod, `strictObject`, same limits as the SQL; `amountLei` int → `leiToBani`; `expenseCategory` from `EXPENSE_CATEGORIES`), `OccurrenceInputSchema`, `StoredEvent`.
- `AddToCalendarInputSchema`: a discriminated union on `target` — `{ target: 'plot', ...OperationInput }` or `{ target: 'event', ...EventInput }` — so the API and the outbox take one shape.
- `occurrences(event, from, to)`: expands repeats inside a window, then applies the occurrence rows (moved, renamed, other sum, cancelled, done). Month-end and 29 Feb rules; respects `repeat_until`. A moved occurrence shows on its new day even if that day is outside the series pattern.
- `eventItems(events, operations, plots, seasons, from, to)`: turns both stores into calendar rows `{ id, source: 'event' | 'operation', date, endDate, title, category, cropId, plotId, remindOn, direction, amount, done }`. Occurrence id `ev:<uuid>:<original date>`; operation id `op:<uuid>`.
- `forCrop(items, cropId, seasons)`: what the crop view (`view.crop`) shows.
- `dueReminders(items, today)`: events whose `remindOn` is today or past and aren't done. Feeds „Urmează” and `/acasa` now, and 9f notifications later.
- `editScope(event, originalDate, change, scope: 'one' | 'all')` → what to write: an occurrence row, or a series update plus the list of occurrence rows that will be dropped (for the warning).

### Money into the plan — `cashflow/timeline.ts` + `cashflow/farm-plan.ts`
- `TimelineInput` gets `planned?: PlannedMoney[]`:
  `{ id: 'ev:<uuid>:<date>', direction, amount, date, cropId?, category?, replacesPlanned, title }`.
- New `EntryKind`s: `'farmer_in'` and `'farmer_out'`. `buildTimeline` places them on their day; when `replacesPlanned`, it drops the matching planned crop cost (`costEntryId`) or crop sale in that month, with the same code path `recorded` uses.
- `timelineInput()` builds `planned` from `farm.farm_events` with `occurrences()` over the plan horizon (and over `long_forecast` months for `longForecast`), skipping done / confirmed / cancelled occurrences. Past unconfirmed ones move to the current month (Decision 4).
- Tests: a monthly rate lowers the safe salary by the right amount; a planned seed bill replaces the estimate, not adds to it; a confirmed occurrence isn't counted twice (it's in `recorded` now); a cancelled one disappears; `afterBadHarvest` and `longForecast` include yearly events in later years.

## API — `apps/api/src/routes/events.ts`
- `POST /api/events` — body `AddToCalendarInput`. `target: 'plot'` → `plot_operations` (same repo method the future `POST /api/plots/:id/operations` will call). `target: 'event'` → `farm_events`. Checks: `crop_id` known for this farm (`knownCrop`, as in `records.ts`), `plot_id` is this farm's (RLS + composite FK; map the error to `400 invalid_input`), `expense_category` in `EXPENSE_CATEGORIES`. Idempotent on `clientId`. Returns `201 { id, salary }` — the new safe salary, like `/expenses` does, so the sheet can say „Salariul sigur devine X lei”.
- `PATCH /api/events/:id` — „Toate”. Returns the occurrence rows it dropped.
- `PUT /api/events/:id/occurrences/:date` — „Doar asta” (move, rename, sum, cancel, done/undone). Upsert on `(event_id, original_date)`.
- `DELETE /api/events/:id` — „Toate”. `DELETE /api/events/:id/occurrences/:date` is „Doar asta” = `cancelled: true` (so it doesn't reappear from the series).
- `POST /api/events/:id/occurrences/:date/confirm` — „Da, am plătit / am primit”: creates the sale or expense through the existing repo methods (`addSale` / `addExpense`, with envelope rules unchanged) and links `transaction_id`, in one go. Same idempotency key as the queued sale/expense.
- `PATCH`/`DELETE /api/plots/:plotId/operations/:id` — from `docs/harta-plan.md` step 3; this plan needs only status/date/note edits.
- Tests in `apps/api/src/events.test.ts`: invalid input, unknown crop, another farm's plot or event, replay with the same `clientId` saves once, „Doar asta” vs „Toate”, confirm creates exactly one transaction, the returned salary reflects the event.

## Web
1. **Store** (`web/lib/cc/store.ts`, `web/lib/live/outbox.ts`): add `add_event`, `update_event`, `delete_event`, `set_occurrence`, `confirm_occurrence` to `QUEUEABLE`. `confirm_occurrence` is allowed because it only records money that already moved (same reason sales and expenses are queueable). The store applies each change locally right away (temporary `outbox:` id, which `takeBack` already understands), so the event and the new salary show at once offline. The plan is recomputed on the phone from the local farm, as it is now. On Ion's farm everything lives under `storageKey('cropcash-events')` and never reaches the API.
2. **`web/components/app/EventSheet.tsx`** (new; add and edit):
   - Step 1, „Despre ce?”: chips Parcelă · Cultură · Animale · Utilaje · Bani de plătit · Bani de primit · Acte · Altceva. „Parcelă” is hidden until the farm has plots.
   - Step 2: parcel or crop picker; a short list of common titles for the category (Parcelă uses `OPERATION_KINDS` with Romanian labels; „Altă lucrare” opens free text); day (prefilled), „Mai multe zile”, „La o anumită oră”, „Să-mi amintești” (Nu / în ziua aceea / cu 1 / 3 / 7 zile înainte), „Se repetă” (Nu / în fiecare lună / în fiecare an, „până când”), note.
   - Money: „Cât?” in lei (whole lei, like the expense form), „Pentru ce?” (`EXPENSE_CATEGORIES` labels for costs), optional crop; „În locul estimării” shown only when the plan has an estimate to replace, with the estimate's sum next to it; for income with a crop, „E toată recolta”. Under the sum, live: „Salariul sigur: 3.200 → 2.950 lei pe lună”.
   - Parcel work in the past: „Ai făcut-o deja?” → saved `done`.
   - Editing a repeating event: the save button becomes two, „Doar în ziua asta” / „Toate”. If „Toate” drops occurrence rows: „3 schimbări făcute doar pe o zi se pierd.”
   - Big targets, Romanian with diacritics, plain words. Save is a normal button (works offline); no `NetButton`.
3. **`Calendar.tsx`**:
   - Items from `eventItems(...)` merged with plan entries and followed calls. Money events already come through the plan as `farmer_in`/`farmer_out` entries, so they are drawn from the plan (one source) and enriched with the event's details — no double rows.
   - Header „Adaugă” button; „+ Adaugă în ziua asta” at the end of the day panel.
   - Icons and tones per category (new `IconName`s if needed: `tractor`, `cow`, `doc`). Money events use the existing in/out shades and chips.
   - Tabs: add **„Ale mele”**. „Bani” includes money events; „De făcut” includes open events/operations; „Lucrări” includes parcel operations and crop events.
   - „Termene în 30 de zile” and the „Urmează” card count the farmer's open events (answer 2).
   - The footer note „Sumele de aici nu scad salariul…” changes: the farmer's own sums do lower it, so the note says that.
   - Crop view (`view.crop`) uses `forCrop`.
4. **`ItemSheet.tsx`**: for an event/operation, show category, parcel/crop, repeat, reminder and, for money, the sum and „suma ta”; actions „Făcut” / „Nu e făcut”, „Schimbă”, „Șterge” (asks in the sheet, no browser `confirm()`; for a series: „Doar asta” / „Toate”), „Pune în calendarul telefonului” (`ics.ts`), and for a past money occurrence „Da, am plătit” / „Nu mai e cazul”.
5. **`/acasa`**: the `UpcomingCard` and the warnings include the farmer's events and due reminders, and a past unconfirmed money event („Ai plătit rata din 15?”).
6. **Other entry points** (after the calendar works): „Adaugă în calendar” on a crop row in `/recolte` and on a parcel in `/harta` when it exists, opening the same sheet prefilled.
7. Skeleton: no new screen, so `SCREENS` and `skeleton/screens.tsx` don't change; anything that replaces content on load calls `markReady()`.

---

# Part B — „Ce schimbă cel mai mult prognoza”

## What the farmer gets
A list of every income and cost in the next 12 months, **ordered by how much each one moves the forecast, largest first**. Each row:
- the name, in plain words („Avansul APIA”, „Vânzarea porumbului”, „Îngrășăminte pentru grâu”, „Rata la bancă — suma ta”),
- when it comes, and the sum over 12 months,
- **the effect**: „Fără ea, salariul ar fi cu 640 lei mai mic pe lună” (or „mai mare” for a cost), plus a bar showing its size against the top row,
- a small „cât de sigur” tag when the sum is an estimate with a wide range („poate fi între 18.000 și 31.000 lei”), or „suma ta” for the farmer's own figure,
- tap → its detail (the same `ItemSheet`, or the `EventSheet` for the farmer's own events, so it can be changed right there).

Filters: **Toate · Intră · Ies**. A second ordering, **„Cele mai nesigure”**, sorts by how far apart the bad and good cases are, so the farmer sees which sums to check first.

## Where it shows
- A section on **`/prognoza`**: „Ce schimbă cel mai mult salariul”, top 5 with „Arată toate”.
- A link from `/salariu` under the salary: „De ce atât? Vezi ce contează cel mai mult” → the same section.
- In the crop view (`view.crop`), only that crop's rows.
- Later: the assistant answers „ce-mi scade salariul cel mai mult?” from the same function.

## How the effect is measured — `packages/shared/src/cashflow/drivers.ts` (pure, tested)
- **Group the plan's money entries into drivers** over the 12-month medium timeline: one driver per APIA payment (advance, balance), per crop sale, per crop's costs, per credit and its repayment, per farmer money event series, per grain in the barn. Deadlines (no money) are skipped. Past recorded money is not a driver (it already happened; it's in the start balance).
- **Effect = leave-one-out:** rebuild the month totals without that driver's entries and recompute what the page shows:
  - `salaryDelta` = `maxSafeSalary(without).salary − maxSafeSalary(with).salary` (lei per month; the main number),
  - `lowestDelta` = change in the lowest balance (`timeline.lowest`),
  - `total` = the driver's 12-month sum.
- **Order:** by `|salaryDelta|` descending, then `|lowestDelta|`, then `|total|`. When the farmer fixed the salary (`salary_bani`), the main number becomes `lowestDelta` („cel mai jos ar fi …”), because the salary itself won't move.
- **Uncertainty:** `spread` = the driver's value in the good timeline minus the bad one; „Cele mai nesigure” sorts by `|spread|`.
- **Implementation detail:** don't rebuild from inputs per driver. Extract the month-total step at the end of `buildTimeline` into `finishMonths(months, startBalance)` (in/out/net/balanceEnd/hard/lowest) and call it on the months with the driver's entry ids removed. ~20 drivers × one cheap pass: fine on a phone, offline.
- **Why leave-one-out and not „share of the total”:** the salary is limited by the hardest month (`bindingMonth`), so a big sum that comes after that month can matter less than a small one before it. Leave-one-out shows that honestly, and the row explains it when it happens: „Vine după luna cea mai grea, așa că schimbă puțin salariul.”
- **Tests:** ordering on Ion's farm; a cost before the binding month outranks a bigger income after it; fixed salary switches to `lowestDelta`; a farmer event appears as a driver with „suma ta”; integer bani throughout; a farm with no money entries returns an empty list (the section then says „Încă nu sunt sume în plan.”).
- All words and thresholds (how many rows on the first view, when a spread counts as „nesigur”) come from `docs/data/plan-params.json`, not from components.

---

## Demo (Ion)
- `docs/data/demo-ion.json` gets ~6 events, marked as demo assumptions: fungicid on the wheat (planned, late April), revizia combinei (June, with a sum), ITP tractor (yearly), rata la bancă (monthly, with a sum — so the drivers list and the salary show its effect), vizita la primărie for the registrul agricol, and one past rate left unconfirmed so „Ai plătit?” shows on `/acasa`. `seed:demo` inserts them for the `DEMO_EMAIL` account. The sums need a source or a `DE-VERIFICAT` note in `docs/11-open-questions.md`.

## Steps
Each step: `npm test` green → tick here → one status line. No commits unless asked.

1. [x] **Shared: events** — `calendar/events.ts` (schemas, `occurrences`, `eventItems`, `forCrop`, `dueReminders`, `editScope`) + tests; `StoredFarm` fields. (~4 h)
2. [x] **Shared: money in the plan** — `planned` in `TimelineInput`, `farmer_in`/`farmer_out`, replace rule, `timelineInput()` wiring + tests. (~3 h)
3. [x] **Shared: drivers** — extract `finishMonths`, `cashflow/drivers.ts` + tests, params in `plan-params.json`. (~3 h)
4. [~] **Migration** — `023_farm_events.sql` (both tables); check on PGlite like 020; `db:migrate` and the RLS integration test only after the owner's go-ahead (it changes the cloud DB). (~2 h)
5. [x] **API** — `routes/events.ts` (add, „Toate”, „Doar asta”, delete, confirm), repo methods, `FARM_SELECT`, tests. (~4 h)
6. [x] **Store + outbox** — queueable names, optimistic apply, Ion's local key, tests (offline add → visible + salary changes → sent once when back online). (~3 h)
7. [x] **EventSheet + Calendar + ItemSheet** — add/edit („Doar asta”/„Toate”)/delete/tick/confirm, tabs, grid, crop view, counts, footer note; page tests. (~6 h)
8. [x] **„Ce schimbă cel mai mult prognoza”** — section on `/prognoza`, link from `/salariu`, crop view; page tests. (~3 h)
9. [x] **`/acasa`** — upcoming events, reminders, „Ai plătit?”. (~1.5 h)
10. [x] **Parcel work** — once `020_plots.sql` is applied: the „Parcelă” chip writes `plot_operations`; planned operations from the parcel page show in the calendar. (~2 h)
11. [x] **Extras** — .ics per occurrence, `/recolte` entry point, Ion's demo events, `docs/app-inventory-web.md` + `docs/functions.md` updates. (~2 h)
12. [~] **Later** — assistant functions `add_event` (confirmation card, 9d pattern) and `explain_drivers`; push reminders through 9f.

**Status 2026-11-14:** 1–3 and 5–11 done and tested. 4: `023_farm_events.sql` written, waits for the owner's go-ahead to run `db:migrate` (the API reads `farm_events`, so deploy it only after). 10: the „Parcelă” chip shows when the parcels load online and writes `add_operation`; planned operations show in the calendar online. 11: .ics, Ion's demo events, „Adaugă în calendar” on `/recolte`, `docs/functions.md` and `docs/app-inventory-web.md` done. 12: the assistant can propose `add_event` as a card and answers with `explain_drivers`; `list_upcoming` includes the farmer's events. Push reminders wait for step 9f (notifications) in `docs/10-plan.md`, which isn't started; until then reminders show on `/acasa` („Din calendarul tău”) and in the calendar.

## Done when
- On a real account, the farmer adds „Rata la bancă, 1.500 lei, pe 15, în fiecare lună” offline; the calendar shows it every month, the safe salary drops right away, and it is saved once when back online.
- „Doar asta” moves March's rate to the 20th and leaves the other months alone; „Toate” changes the sum for every month.
- On 16 March the farmer is asked „Ai plătit?”; „Da” records one expense, and the plan counts it once.
- `/prognoza` lists the drivers largest first; on Ion's farm the order matches the test, and the rate shows with „suma ta”.
- On `/ferma-lui-ion/…` all of this works, stays on the phone, and makes no API call.
- `npm test`, `npm run typecheck` green; the RLS test refuses another farm's events, occurrences and plots.

## Open questions
1. ~~„E toată recolta” on by default~~ answered: yes.
2. ~~„De acum înainte”~~ answered: yes, built.
3. Animals: the farm has `dairy_cows` / `beef_cattle`; should animal events link to a herd later, or stay free text?
4. Reminders before 9f exists: is showing them in „Urmează” and on `/acasa` enough for the demo?
5. ~~Fixed salary~~ answered: yes, both, with a note.
