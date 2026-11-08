# Functions plan

Every function in CropCash that a farmer can trigger with a button, or the AI can call as a tool. Based on `docs/01` to `docs/11`, the code in `apps/` and `packages/`, and the monitor's tables.

This replaces `app-functions-plan.md`, which assumed Next.js and a separate `farm-core` package. The real stack is React + Vite, Express and `packages/shared`.

## Rules every function follows

These come from `CLAUDE.md` and the docs.

- **One definition.** Each function has one name, one Zod input schema and one implementation. Buttons and AI tools use the same one, so they can't give different answers.
- **Figures come only from `docs/data/*.json`.** A missing figure is returned as `null`, with `DE-VERIFICAT` in `unverified`. It is never guessed. The one planned exception is the daily exchange rates in section 15, which only change how amounts are displayed.
- **Money is whole bani or eurocents, and area is whole ari.** Tools return these, and the UI or AI formats them. The farmer sees lei.
- **Pure logic stays in `packages/shared`,** with no I/O and with tests.
- **Every feature states what it does offline.** Anything that moves money needs internet and never enters the outbox.
- **User data is read as the user,** so row-level security applies. `admin()` stays for webhooks, jobs and seed.
- **Stripe is test mode only.**

## How functions are defined

```text
packages/shared/src/functions/
  define.ts          defineRead, defineWrite, the result format
  registry.ts        every function: name, Zod input, access, what it does
  plan.ts            planView, and buildFarmPlan from cashflow/farm-plan.ts: the one plan calculation
  explain.ts, whatIf.ts, fuel.ts, pension/, risk/   (later steps)
apps/api/src/routes/functions.ts
                     POST /api/functions/:name runs read functions
apps/api/src/ai/
  assistant.ts       the tool loop
  tools.ts           turns the registry into AI tools
apps/web/src/functions/
  call.ts            sends a write through the API
```

```ts
export const getSalary = defineRead({
  name: 'get_salary',
  description: 'The monthly salary this farm can safely take...',
  input: ScenarioInput,
  run: ({ scenario }, ctx) => maxSafeSalary(timeline(ctx, scenario), ctx.plan.smoothing, ctx.data),
});

export const addCredit = defineWrite({
  name: 'add_credit',
  description: 'Adds a credit the farmer took or plans to take to the plan...',
  input: CreditInputSchema,
  request: (body) => ({ method: 'POST', path: '/api/credits', body }),
});
```

A read runs immediately, on the phone or on the API, and has no way to touch the database. A write only describes its API call, and the existing routes stay the one place that performs it. There is no route that runs a write by name.

### Access: what the AI may do

| Access | Button | AI |
|---|---|---|
| `read` | Runs | Runs it directly |
| `confirm` | Runs | Proposes it only. The farmer sees a card with exact values and taps to confirm. |
| `user` | Runs | Not a tool, so the AI can't see it |

A `confirm` tool never executes during the AI's turn. It returns a pending action to the app, and the farmer's tap calls the normal API route. Text the AI reads therefore can't move money or change data.

### Runs: where it executes and what happens offline

| Runs | Where | Offline |
|---|---|---|
| `phone` | `packages/shared` on the device. The API can run it too. | Works, with the last saved data |
| `outbox` | Saved locally, then sent to the API | Works. Shows "Se trimite când ai internet." |
| `api` | Express | The button is a `NetButton` (`web/components/app/bits.tsx`): `data-needs-net`, turned off without internet, and it says why |

### Status in the tables below

- **Built:** works today.
- **Web only:** the logic exists, but only inside `apps/web/src/lib/plan.ts`, so the server and AI can't use it.
- **Shared:** a pure function exists but nothing exposes it.
- **New:** nothing exists yet.

## 1. Farm and account

| Function | Button or screen | Input | Returns | Access | Runs | Status |
|---|---|---|---|---|---|---|
| `sign_up`, `sign_in`, `sign_out` | Login, account sheet | email, password | session | `user` | `api` | Built |
| `create_farm` | O3 to O5, "Arată-mi banii" | name, county, age, parcels, start balance | farm, subsidy | `user` | `api` | Built |
| `get_farm` | App start, account sheet | none | farm, parcels, envelopes, payments | `read` | `phone` | Built |
| `update_farm` | Not on a screen yet | name, county, age, parcels, start balance | new farm and subsidy | `confirm` | `api` | Built |
| `save_harvests` | Not on a screen yet | harvest years, closed crops, gathered grain | what was saved | `confirm` | `api` | Built |
| `delete_account` | Account sheet | password | none | `user` | `api` | New |
| `read_document` | Paper buttons: onboarding O6, Recolte „Notează”, Subvenții hero | 1 to 6 photos or one PDF | kind, year, parcels, amount, date, category, crop, to confirm; nothing saved, file kept nowhere | `user` | `api` | Built (farm-app) |
| `save_apia_decision` | Subvenții „Bine așa” after a decision; onboarding save | campaign year, total in bani | none; the plan and salary use the total | `user` | `api` | Built (farm-app) |
| `clear_apia_decision` | Subvenții „Scoate suma din decizie” | none | none; back to the estimate | `user` | `api` | Built (farm-app) |
| `parse_onboarding_answer` | O2 to O5, mic button | step, spoken text | fields for that step, to confirm | `user` | `api` | New, step 9e |
| `explain_numbers` | "De unde vin cifrele?" | none | each main figure, how it was worked out, its source | `read` | `phone` | New, step 11 |

`update_farm` changes the subsidy, so the confirm card shows the new amount before saving.

`parse_onboarding_answer` only fills in the form. The farmer checks the fields and taps, and `create_farm` stays out of the AI's reach.

## 2. Subsidies

| Function | Button or screen | Input | Returns | Access | Runs | Status |
|---|---|---|---|---|---|---|
| `estimate_subsidy` | O7, subsidy sheet, subsidy tile | none, or a farm for what-if | min, probable, max, advance, balance, schemes, `unverified` | `read` | `phone` | Built |
| `check_scheme` | "De ce nu primesc?" | scheme code | eligible, reasons, `unverified` | `read` | `phone` | Built |
| `list_schemes` | Subsidy sheet | none | schemes with status, rate and unit | `read` | `phone` | Built |
| `explain_subsidy` | Row in the subsidy sheet | scheme code | formula, rate, exchange rate, source, status | `read` | `phone` | Built |
| `what_if_subsidy` | New slider in the subsidy sheet | changed hectares, crops or age | difference from today, schemes gained or lost | `read` | `phone` | Built |
| `get_subsidy_payments` | C2 event detail | none | advance and balance windows, with the date the plan assumes | `read` | `phone` | Built |

`what_if_subsidy` matters because of cliffs in the rules: PD-04 starts at 10,01 ha, and CRISS is lost above 50 ha. Both limits come from `subsidies-2026.json`, and the CRISS one is still `DE-VERIFICAT`.

## 3. Salary and plan

| Function | Button or screen | Input | Returns | Access | Runs | Status |
|---|---|---|---|---|---|---|
| `get_plan` | Acasă, Prognoză | scenario | timeline, salary, tight months, spring need | `read` | `phone` | Built |
| `get_salary` | Salary card | scenario | safe salary, the month limiting it, deficit | `read` | `phone` | Built |
| `explain_salary` | "De ce atât?" | scenario | plain reason, limiting month, cumulative money | `read` | `phone` | Built |
| `get_forecast` | Prognoză, "An slab / normal / bun" | scenario | 12 months, key figures, where money goes | `read` | `phone` | Built |
| `get_tight_months` | Tight-months card, Rezerve | scenario | months, lowest point, amount missing | `read` | `phone` | Built |
| `list_upcoming` | "Ce urmează", calendar tile | days | payments, deadlines and work | `read` | `phone` | Built |
| `set_salary_target` | Target field | target in lei | new salary and credit need | `confirm` | `outbox` | New |
| `check_purchase` | "Pot să-mi iau...?", assistant | amount, month, optional | salary after it, tightest month after it | `read` | `phone` | Built (step 9c) |

**First step:** move the combining code from `useFarmPlan` into `buildFarmPlan` in `packages/shared`. Without it, the AI can't use any function in this section.

`check_purchase` shows the effect and never says yes or no. It reuses the same plan calculation as `get_salary`.

## 4. Credit

Decision A + C in the docs: informative only, with no bank names or offers.

| Function | Button or screen | Input | Returns | Access | Runs | Status |
|---|---|---|---|---|---|---|
| `suggest_credit` | Credit suggestion card | target, optional | amount, month, resulting salary | `read` | `phone` | Built |
| `what_if_credit` | Credit form, before saving | amount, take month, repay month | salary with this credit, check against 90% limit | `read` | `phone` | Built |
| `add_credit` | "Iau un credit", "Pune creditul în plan" | amount, take month, repay month | group id | `confirm` | `api` | Built |
| `remove_credit` | Remove on a credit row | group id | none | `confirm` | `api` | Built |
| `list_credits` | Rezerve, credit list | none | declared credits | `read` | `phone` | Built |
| `get_credit_cost` | Credit form, assistant | amount, take month, repay month | interest cost, or `null` with the reason | `read` | `phone` | New, step 11 |

Interest isn't calculated because ROBOR 6M is missing (open question 18). Results say so, and `get_credit_cost` returns `null` until the figure exists.

## 5. Envelopes and income

| Function | Button or screen | Input | Returns | Access | Runs | Status |
|---|---|---|---|---|---|---|
| `get_envelopes` | Contul tău, envelope bars | none | balances (salary, spring costs, debts, pension) | `read` | `phone` | Built |
| `propose_split` | B3 "Au intrat bani!" | amount | proposed envelopes | `read` | `phone` | Built |
| `save_envelopes` | "Bine așa", envelope form | balances | none | `confirm` | `api` | Built |
| `get_envelope_history` | B2 envelope detail | kind | movements | `read` | `phone` | New |
| `record_sale` | Not on a screen yet | crop, tonnes, price or total, date | transaction, split proposal | `confirm` | `api` | Built |
| `add_expense` | Not on a screen yet | category, amount, date, envelope | transaction, new salary | `confirm` | `api` | Built |
| `list_transactions` | Not on a screen yet | month, kind | transactions | `read` | `phone` | Built |
| `undo_transaction` | Not on a screen yet | transaction id | none | `user` | `api` | Built |
| `edit_transaction` | Row in Activitate | transaction id, changed fields | transaction, new salary | `user` | `api` | New, step 11 |
| `open_record` | Assistant | what the farmer described | the matching row, opened pre-filled | `read` | `phone` | New, step 11 |
| `record_income` | "Au intrat bani", assistant | amount, date, source, optional | transaction, split proposal | `confirm` | `api` | New, step 11 |
| `label_income` | Row with no label | transaction id, source | transaction | `user` | `api` | New, step 11 |
| `record_apia_payment` | Subsidy sheet, event detail | payment, amount, date | received payment, new salary, whether it fell below the minimum | `confirm` | `api` | New, step 11 |

`set_envelopes` now counts recorded sales and expenses (migration 010), and income from Stripe (migration 012).

**How records change the plan:**

- Every record changes the money the farmer has today.
- A sale or planned cost recorded **in the same month** as its forecast entry takes that entry off the plan, so it isn't counted twice.
- Repairs, rent, "other" and sales with no matching forecast only change the money.
- **Known gap:** a sale recorded in an earlier month than its forecast (wheat sold in June, forecast in July) leaves the forecast in place, so the plan counts it twice.

**Editing:** the AI never edits or removes a record. It finds the row with `open_record` and opens it pre-filled, and the farmer changes it and taps.

**Money with no label:** `record_income` accepts a missing source. The amount counts in the money the farmer has, stays out of the split until labelled, and the app asks once what it was.

**APIA pays less:** `record_apia_payment` marks the planned payment as received with the real amount. Below the minimum, the salary is recalculated and the farmer is told, as `07-architecture.md` §4 requires.

## 6. Stripe money flow

| Function | Button or screen | Input | Returns | Access | Runs | Status |
|---|---|---|---|---|---|---|
| `get_payouts` | Salary history | none | scheduled and paid salaries, pension payments | `read` | `phone` | Built |
| `pay_salary` | Run by the scheduler | month | payout | none | `api` | Built as `runMonth` |
| `simulate_apia_advance` | "Simulează avansul APIA" | none | amount, split proposal | `user` | `api` | Built |
| `advance_clock` | "Dăm timpul înainte" | months | starts the run; the page follows `demo_now` | `user` | `api` | Built |

The two demo functions exist only when `DEMO_MODE` is on. `pay_salary` is a job, not a button or tool. Webhooks are covered in `08-stripe.md`.

**Money through Stripe and the plan:**

- Income joins the balance and leaves the forecast at once. An APIA payment matches its forecast by payment window, so it can arrive in any month of that window.
- The bad-year fund's share of income that arrived is reserved straight away, and money in that envelope never counts towards the salary. Without this, money arriving would raise the salary.
- Pension payments lower the money for spending but stay in the farmer's envelopes, so `set_envelopes` still counts them.
- Only the server writes salaries, pension plans, Stripe ids and income rows (migration 012).
- A salary counts as gone from the moment it is sent, before Stripe confirms it.
- **Offline:** salaries already paid stay visible. The buttons that move money are disabled, with a message, and never enter the outbox.
- `apps/api/src/stripe/sandbox.e2e.ts` runs the whole flow on the sandbox and replays Stripe's real events through the webhook route. It needs network and the test key, so it isn't part of `npm test`.

## 7. Crops and sales

| Function | Button or screen | Input | Returns | Access | Runs | Status |
|---|---|---|---|---|---|---|
| `get_crop_economics` | Culturi, crop cards | crop, optional | income, cost, gain per hectare, break-even price | `read` | `phone` | Web only |
| `simulate_sale` | Î4 price and yield sliders, assistant | crop, price, yield, sale month (optional) | income, gain, new salary | `read` | `phone` | New, step 8 |
| `project_sales` | Quarterly projections and the 1–10 year slider | years | three scenarios by quarter, or by 12-month block (`longForecast`) | `read` | `phone` | New, step 8 |
| `get_price_history` | Crop detail | crop | monthly prices | `read` | `phone` | New, needs data |
| `get_county_yields` | Crop detail, risk fund | crop | yields by year | `read` | `phone` | New, needs INS data |
| `get_weather` | Culturi, weather card | none | 7-day county forecast from Open-Meteo | `read` | `api` | Built as `GET /api/weather`, not yet in the registry or open to the AI |

Until INS data exists, county results are labelled "date ilustrative".

`simulate_sale` answers "Să vând la 0,88?" and "Dacă vând mai târziu?" with figures only. Selling later changes when the money arrives. Monthly prices and storage costs aren't in `docs/data/`, so anything depending on them is `null` until they are.

`get_weather` needs a new kind of read in the registry, one that runs on the API, before the AI can use it.

## 8. Risk fund and pension

| Function | Button or screen | Input | Returns | Access | Runs | Status |
|---|---|---|---|---|---|---|
| `simulate_pension` | Pension page, slider | monthly amount, optional return, optional fund | amount at 65, total put in, range, whether it is under the minimum | `read` | `phone` | Built |
| `suggest_pension` | Pension page | optional fund | suggested monthly amount, minimum, whether it is above 5% | `read` | `phone` | Built |
| `what_if_pension` | Pension page: slider and the change and stop sheets | monthly lei (0 = none), optional fund | salary before and after, salary paid before and after, whether it is under the fund minimum | `read` | `phone` | Built |
| `list_pension_funds` | Pension page, fund list (read from the data on the phone) | none | funds A to Z with minimums, chosen fund | `read` | `phone` | Built |
| `set_pension_fund` | Pension page, fund list | fund id or null | none | `confirm` | `api` | Built |
| `start_pension` | "Pornesc" | monthly amount, refused under the minimum | monthly amount | `confirm` | `api` | Built with F5, because step 6 needs its invoices. The Î3 screen is still step 7 |
| `change_pension` | Pension page, „Schimbă suma” | monthly amount, inside the slider range | none; the new amount applies from the next payment and the salary is fixed again | `confirm` | `api` | Built |
| `stop_pension` | Pension page, „Opresc” | none | none; the payments stop now, what was paid stays, the salary is fixed again | `confirm` | `api` | Built |
| `skip_pension_payment` | Pension page (button shown disabled) | month | next payment date, new amount at 65 | `confirm` | `api` | New, step 11 |
| `what_if_fund_withdrawal` | Fund card, assistant | amount | what's left in the fund, how many bad years it still covers | `read` | `phone` | New, step 11 |
| `withdraw_from_fund` | Fund card | amount, reason, optional | new balances | `confirm` | `api` | New, step 11 |

Pension answers are simulations, with no fund recommendations. Pilonul III and CEI ceilings stay `DE-VERIFICAT`.

It's the farmer's money. The app shows the effect of taking money out of the fund, and doesn't refuse.

## 9. Calendar and tasks

| Function | Button or screen | Input | Returns | Access | Runs | Status |
|---|---|---|---|---|---|---|
| `list_tasks` | Not on a screen yet | status | tasks by deadline | `read` | `phone` | Built |
| `complete_task` | Not on a screen yet | task id | none | `confirm` | `api` | Built |
| `reopen_task` | Not on a screen yet | task id | none | `confirm` | `api` | Built |
| `get_event` | C2 event detail | event id | dates, explanation, source, status | `read` | `phone` | Web only |
| `get_required_documents` | Event detail, assistant | event id | documents needed, source, or `null` | `read` | `phone` | New, step 11 |
| `get_weekly_summary` | Sunday notification, Acasă | none | money in and out, deadlines and work for the next 7 days | `read` | `phone` | New, step 9f |
| `add_recurring_cost` | Expense sheet, "Se repetă" | name, amount, how often, next date | recurring cost, new salary | `confirm` | `api` | New, step 11 |
| `list_recurring_costs` | Rezerve | none | recurring costs | `read` | `phone` | New, step 11 |
| `remove_recurring_cost` | Row in the list | id | none | `confirm` | `api` | New, step 11 |

`get_required_documents` reads a new `documents_ro` field in `calendar-2026.json`. Each list needs an official source, so until then it's `null` with `DE-VERIFICAT`.

Recurring costs join the plan as expected payments, so the salary already counts them.

Tasks come from `calendar-2026.json`, so only completions are stored, in `task_completions`, once per year for each event. The screens for sections 1, 5 and 9 are planned in `docs/f4-screens.md`, which also covers working offline. Until the outbox arrives with step 9b, the writes here need internet.

## 10. Diesel report

| Function | Button or screen | Input | Returns | Access | Runs | Status |
|---|---|---|---|---|---|---|
| `add_fuel_log` | Diesel form | date, litres, invoice, supplier, parcel | entry | `confirm` | `outbox` | New, step 10a |
| `list_fuel_logs` | Diesel screen | quarter | entries | `read` | `phone` | New, step 10a |
| `delete_fuel_log` | Row in the list | entry id | none | `user` | `outbox` | New, step 10a |
| `get_fuel_refund` | Diesel screen | quarter | litres, refund estimate, `unverified` | `read` | `phone` | New, step 10a |
| `export_fuel_report` | "Printează" | quarter | printable table | `read` | `phone` | New, step 10a |

The refund rate, the quarterly schedule and the deadline are all `DE-VERIFICAT`. The report has a logical structure and isn't the official form.

## 11. Tax

| Function | Button or screen | Input | Returns | Access | Runs | Status |
|---|---|---|---|---|---|---|
| `estimate_income_tax` | Calendar item for Declarația Unică | none | tax estimate, or `null` | `read` | `phone` | New |

Income norms for Teleorman are missing (open question 13), so this returns `null` for Ion until the figure is verified. It must not use the Vrancea example.

## 12. Funding opportunities

These read the monitor's `opportunities` table.

| Function | Button or screen | Input | Returns | Access | Runs | Status |
|---|---|---|---|---|---|---|
| `search_opportunities` | "Toate" tab | programme, status, deadline, budget, text | calls with source links | `read` | `api` | Built |
| `get_opportunity` | Row in the list | stable key | full call, relevance note, source | `read` | `api` | Built |
| `match_opportunities` | Acasă, "Pentru tine" tab | none | calls for this farm in `forYou`, `check` and `notForYou`, each with a level, reasons and doubts | `read` | `api` | Built |
| `list_closing_soon` | No screen yet, for the assistant | days | calls by deadline | `read` | `api` | Built |
| `list_opportunity_changes` | "Noutăți" tab | days | new calls, changed deadlines and budgets | `read` | `api` | Built |
| `follow_opportunity` | "Pune în calendar" | stable key | task in the calendar | `confirm` | `api` for now | Built. The outbox comes with step 9b |
| `unfollow_opportunity` | "Scoate din calendar" | stable key | none | `user` | `api` for now | Built. The outbox comes with step 9b |

The last saved list stays readable offline, with a line saying when it was saved (`lib/savedRead.ts`, until step 9b). Calls followed stay in the calendar offline, because they come with the farm.

The screen is a sheet opened from a card on Acasă, because navigation stays at 4 tabs. Document search first looks for passages with all the words, and falls back to any of them, because people type a few loose words. Matching is a first filter, not a decision on who can apply. It leaves out other regions and consortium calls, and shows doubts about age, sector or who can apply rather than hiding those calls. Status is worked out from the dates on the day of the read, so the demo clock moves it too. Amounts stay in euro whatever the currency toggle says, because they are official figures.

## 13. Official sources and changes

| Function | Button or screen | Input | Returns | Access | Runs | Status |
|---|---|---|---|---|---|---|
| `list_recent_changes` | "Noutăți" tab | institution, days | changed sources | `read` | `api` | Built |
| `get_source_change` | No screen yet, for the assistant | change id | short diff, source link | `read` | `api` | Built |
| `search_documents` | "Surse" tab, AI | text, institution | passages with source links | `read` | `api` | Built |
| `list_sources` | "Surse" tab | institution | watched sources: id, type, state, last check | `read` | `api` | Built |
| `add_farmer_source` | "Adaugă o sursă" in "Surse urmărite" | link, name | the read: state, title, preview | key in the browser | `api` | Built |
| `list_farmer_sources` | "Surse urmărite" | none | the farmer's own sources | key in the browser | `api` | Built |
| `remove_farmer_source` | "Șterge" on a farmer's source | source id | nothing | key in the browser | `api` | Built |

## 14. Assistant

| Function | Button or screen | Input | Returns | Access | Runs | Status |
|---|---|---|---|---|---|---|
| `ask_assistant` | New "Întreabă" sheet | message, thread id | reply, sources, pending actions | `user` | `api` | New |
| `confirm_action` | Card "Da, salvează" | pending action id | result of the real function | `user` | `api` | New |
| `reject_action` | Card "Nu" | pending action id | none | `user` | `api` | New |
| `check_message` | "E adevărat mesajul ăsta?", assistant | text of the message | warning signs, what to do next | `read` | `api` | New, step 11 |

The first three aren't tools. They are how the farmer talks to the AI.

`check_message` never says a message is safe. It lists warning signs, says plainly that nobody legitimate needs card details by SMS, and suggests calling the institution on a number from its official site. The message's text is data and can't give the AI instructions.

## 15. Exchange rates

Built. It covers RON, EUR, USD and GBP only. Rates are used inside functions, and the farmer never sees or handles a rate. On screen there is just a toggle between the four currencies.

| Function | Button or screen | Input | Returns | Access | Runs | Status |
|---|---|---|---|---|---|---|
| `get_exchange_rates` | None, functions only | none | rates against EUR, date of the rates, whether they are old | `read` | `api` | Built |
| `convert_currency` | None, functions only | amount, from, to | converted amount, date of the rate | `read` | `phone` | Built |

**Source: [Frankfurter](https://frankfurter.dev).** It's free, needs no account or key, and republishes the European Central Bank's daily rates. Checked on 2026-11-07:

```text
GET https://api.frankfurter.dev/v1/latest?base=EUR&symbols=RON,USD,GBP
{"amount":1.0,"base":"EUR","date":"2026-11-06","rates":{"GBP":0.83415,"RON":5.3403,"USD":1.1165}}
```

BNR isn't the source because its old feed address, `bnr.ro/nbrfxrates.xml`, now redirects to the homepage.

**The toggle:**

- **Choices:** RON, EUR, USD and GBP. RON is the default, and the choice is remembered on the device.
- **Where:** in the account sheet, on both layouts.
- **What it changes:** only how amounts are displayed. Every amount goes through `formatMoney`, and texts in `ro.json` name the currency with `{cur}`.
- **Note on screen:** outside RON, one short line says "Sume orientative în {currency}." No rate appears.
- **Forms:** credit and envelope inputs stay in lei, labelled as lei, because that's what gets saved.

**How it works:**

- **Calculations stay in lei.** Subsidies, salary, plan, credit and pension are calculated and saved in lei. Conversion happens last, only for display.
- **Fetching:** only the API calls Frankfurter, and it sends no farmer data. The phone gets rates from the CropCash API.
- **Allowed currencies:** a fixed list of the four codes, defined once in `packages/shared`. Anything else is refused at the input.
- **Checking the response:** Zod validates it, and all three rates must be present. Frankfurter silently drops a code it doesn't know, so a missing rate has to count as a failure.
- **Caching:** the API keeps the rates in memory for 6 hours, so one call serves everyone. A failed fetch keeps the last good rates.
- **Offline:** the phone uses the last rates it saved. With none saved, the toggle stays on RON. A rate is never guessed.
- **Whole units:** results stay in whole bani or cents. USD to GBP goes through EUR, and only the final amount is rounded.
- **AI:** answers stay in lei unless the farmer asks for another currency, and then the figure comes from `convert_currency`.

**Rules:**

- **Never used to calculate a subsidy.** APIA pays at the fixed campaign rate in `subsidies-2026.json`, not at a daily rate. The toggle only changes how that lei amount is displayed.
- **Stripe stays in RON.**

`EXCHANGE_RATE_EUR_RON` is gone, so the API and the phone can no longer disagree on a subsidy.

## 16. Voice

**Dropped on 2026-11-08 at the team's request.** The assistant is text only. The plan below is kept for reference.

Was part of the demo minimum (decision from 2026-11-07). 36 of the 50 use cases are spoken. There are no new functions, because voice is only another way to reach `ask_assistant` and `parse_onboarding_answer`.

| Part | Plan | Fallback |
|---|---|---|
| Speaking to the app | The browser's speech recognition, set to Romanian. It needs no key or server of ours | Typing is always there. If it fails the test on a cheap phone, a server service needs choosing, which is an architecture change, so ask first |
| Hearing the app | The browser's speech output with a Romanian voice | The text is always on screen. Not every phone has a Romanian voice |
| The button | One large mic button on every tab, opening the assistant sheet | Same sheet, with the keyboard |

**Rules:**

- **Show before sending.** The farmer sees what the app heard and can correct it.
- **Speech never saves.** Saying "da" doesn't confirm. Every write still needs a tap on the card, and the card is read aloud first.
- **Amounts are repeated.** Any amount heard appears on the card in figures, because a misheard number is the main risk.
- **Audio isn't stored.** Only the text goes to the API.
- **Offline:** the mic is wrapped in `<NeedsInternet>`, with "Pornește internetul ca să vorbești cu mine."

**Test before building on it:** 20 real phrases on a cheap Android phone, with weak signal and background noise, including spoken amounts such as "douăzeci și cinci de mii". Record the result in `docs/11-open-questions.md`.

## 17. Notifications

8 use cases start with the app speaking first. Needs the service worker from step 9b.

| Function | Trigger | Returns | Access | Runs | Status |
|---|---|---|---|---|---|
| `save_push_subscription` | "Vreau să mă anunți" | none | `user` | `api` | New, step 9f |
| `set_notification_settings` | Account sheet | none | `user` | `api` | New, step 9f |
| `list_inbox` | New "Mesaje" card on Acasă | latest messages | `read` | `phone` | New, step 9f |

| Job | When | Message |
|---|---|---|
| `weeklySummary` | Sunday | What comes this week, from `get_weekly_summary` |
| `springGapWarning` | November, from `get_tight_months` | Which month gets tight and how much is missing |
| `deadlineReminders` | Before a calendar deadline | The deadline and what to do |
| `salaryLowered` | When `record_apia_payment` falls below the minimum | The new salary and why |
| `fundingRadar` | After the monitor finds a matching call or a changed rate | The call or change, with its source |

**Rules:**

- **Permission comes after a first useful moment,** not on opening the app.
- **Every message also lands in "Mesaje",** so it isn't lost if push is refused or doesn't work on the phone.
- **Exact amounts stay off the lock screen.** The message opens the app.
- **Frequency and quiet hours** come from `plan-params.json`. The values are product assumptions, listed in `docs/11-open-questions.md`.
- **Demo:** with `DEMO_MODE` on, a button sends the November warning, because no one can wait for a job on stage.
- **Offline:** "Mesaje" shows the last saved list.

## 18. Sharing with family

The daughter has no account of her own. Sharing uses the phone's own share menu, such as WhatsApp, so there's no new login or permission to build. This is browser only and needs no function.

- **What can be sent:** the `explain_numbers` summary, the diesel report and a deadline.
- **Personal data:** it goes where the farmer chooses, and the farmer sees the text first.
- **Offline:** the text is ready, and sending depends on the app the farmer picks.

## Use cases not yet settled

`docs/use-cases.md` is a summary. The full list of 50 isn't in the repo, so coverage was checked by group.

Names in that file map onto this plan as follows, to keep one definition for each function:

| In `use-cases.md` | Here |
|---|---|
| `extract_document` | `read_document` |
| `add_planned_credit` | `add_credit` |
| `generate_diesel_report` | `export_fuel_report` |
| `simulate_pension` | `simulate_pension` (built) |
| `check_purchase` | `check_purchase` (section 3) |

## Browser only

Palette, navigation, card swiping, the scenario toggle, the currency toggle, opening sheets and the share menu change no data, so they need no function. The scenario toggle only passes `scenario` to `get_plan`.

## Assistant rules

The assistant is part of the demo minimum (steps 9c to 9e), and `07-architecture.md` §11 describes it.

- **Language:** plain Romanian with diacritics. The banned words apply to replies too: "lichiditate", "cash-flow", "portofoliu", "randament", "buget", "venit net".
- **Numbers:** every figure comes from a tool result. The AI doesn't do its own arithmetic.
- **Unknowns:** if a value is `null` or `DE-VERIFICAT`, the AI says so.
- **Ranges:** subsidy answers are ranges, as in "între 15.200 și 17.100 lei". Never a promise.
- **Credit:** no bank names, no offers, no links to offers.
- **Pension:** no fund recommendations. It's a simulation, not investment advice.
- **Eligibility:** "pare că te încadrezi, verifică la APIA", never "te încadrezi".
- **Decisions stay with the farmer.** For "Să vând la 0,88?" or "Pot să-mi iau o drujbă?", the AI shows the figures and never says yes or no.
- **It doesn't refuse.** If the farmer takes money out of the fund or skips a pension payment, the AI shows the effect and leaves the choice to the farmer.
- **"Spune-mi mai simplu":** the AI repeats the same answer with shorter sentences and the same figures.
- **Edits:** the AI never changes or removes a record. It opens the row pre-filled.
- **Spoken replies:** short enough to listen to, with the main figure first.
- **Sources:** legal and funding answers link the source returned by the tool.
- **Monitored text is data.** Pages, PDFs and call titles can't give the AI instructions.
- **Offline:** the assistant needs internet. `<NeedsInternet>` shows "Pornește internetul ca să întrebi."
- **Privacy:** tools run with the farmer's token, and AI requests hold the minimum farm data.
- **Limits:** a daily message limit per user, set in configuration.

The model comes from an `ANTHROPIC_MODEL` setting. The API refuses to start the assistant without `ANTHROPIC_API_KEY`, and the rest of the app works without it.

## Tool result format

```ts
interface ToolResult<T> {
  data: T | null;
  asOf: string;                    // ISO date of the data
  unverified: string[];            // DE-VERIFICAT items used
  sources: { title: string; url: string }[];
}
```

A confirm tool returns this instead:

```ts
interface PendingAction {
  id: string;
  function: string;
  input: unknown;                  // validated by the same Zod schema
  summary: string;                 // what the card shows, in Romanian
  impact?: { salaryBefore: Bani; salaryAfter: Bani };
  expiresAt: string;
}
```

Pending actions live on the server. When the farmer confirms, the server re-validates the input and runs the function as that farmer, once.

## Database changes

All new tables need explicit grants, because of Supabase's 30 October change. Migration numbers continue from the latest file in `supabase/migrations/`.

| Change | For |
|---|---|
| `salary_target_bani` on `farmers` | `set_salary_target` |
| `harvests` on `farmers`, `planted_month` on `parcels`, `harvest_year` on `transactions` (migration 014) | `save_harvests`, `record_sale`, `add_expense`, `update_farm` |
| `kind`, `category`, `crop_id`, `note`, `envelope_taken_bani` on `transactions` (migration 010) | `record_sale`, `add_expense`, `undo_transaction` |
| `set_envelopes` counts recorded income and expenses (migration 010) | Section 5 |
| `task_completions` (migration 010) | `complete_task` |
| `opportunity_follows` | `follow_opportunity` |
| Read policy and `select` grant to `authenticated` on `opportunities` | Section 12 |
| `source_changes`: source, date, kind, short diff, written by the monitor | Section 13 |
| `documents`: passages with Romanian full-text search, written by the monitor | `search_documents` |
| `assistant_threads`, `assistant_messages`, `pending_actions` | Section 14 |
| `push_subscriptions`, `inbox_messages`, notification settings on `farmers` | Section 17 |
| `demo_now` on `farmers`, server-only writes for money tables (migration 012_team_stripe_money) | Section 6 |
| `recurring_costs` | `add_recurring_cost` |
| `source` nullable on income, `received_amount_bani` and `received_on` on `expected_payments` | `record_income`, `record_apia_payment` |

`sources`, `snapshots` and `change_events` stay locked to the monitor. The app reads `source_changes` and `documents`, so private columns and Storage paths stay out of reach. `list_sources` is read by the server, with the service key and a fixed list of columns. All of this is migration 013.

## Build order

| # | Work | Done when |
|---|---|---|
| F1 | Registry, `defineFunction`, `buildFarmPlan`. **Done.** | Web and API give the same salary for Ion: 850 lei without credit, 2.700 lei with 14.800 lei in April. |
| F2 | Expose sections 2 to 5 through the registry. **Done.** | Each existing button that saves data calls the registry, and all current tests pass. Screens still read the plan object directly, which is the same data the read functions return. |
| F3 | Missing pure functions: `explain_*`, `what_if_*`, `simulate_pension`, risk fund. **Done.** | Each has tests, including the 29.450 lei pension example. |
| F4 | Writes: `record_sale`, `add_expense`, tasks, `update_farm`. **Built; Supabase tests not run yet.** | RLS tests pass for the new tables. |
| F5 | Stripe functions, with step 6. **Built; waiting for migration 012 and a run with live webhooks.** | Plan step 6 is complete. |
| F6 | Opportunities and sources. **Built; waiting for migration 013 and `npm run documents -w subventii-monitor`.** | Migration applied, and the screens work on real monitor data. |
| F7 | Assistant, read tools only | 20 test questions pass: right figures, no banned words, no bank names. |
| F8 | Confirm flow | A page containing fake instructions can't cause a write. Every write needs a tap. |
| F9 | Diesel and tax | Plan step 10a is complete. |
| F10 | Exchange rates and the currency toggle (section 15). **Done.** | The toggle shows every amount in all four currencies, works offline with the last saved rates, and no calculated or saved figure changes. |
| F11 | Voice (section 16), plan step 9e | The phrase test passes on a cheap phone, and every write still needs a tap. |
| F12 | Notifications (section 17), plan step 9f | The November warning reaches a real phone, and also appears in "Mesaje". |
| F13 | Use-case gaps, plan step 11 | Each function has tests, and no `null` figure is guessed. |

F1 to F3 need nothing from Stripe. F5 follows the plan's own step 6. F7 can start after F2, with the tools that exist by then.

**Order for the demo:** F7 first, answering the four questions from the farmer's own figures. Then F8 with voice logging (F11), then the money-arriving and November-warning story (F12), then safety (F13).

## Tests every function needs

- Input is rejected when invalid.
- `null` is returned, not a guess, when a figure is missing.
- A user can't reach another user's data, for anything touching the database.
- The offline behaviour matches its `runs` value.
- A check over the registry confirms that no `confirm` or `user` function can run during an AI turn.

## Decisions needed

1. **Assistant placement:** settled on 2026-11-07 as a sheet opened from a mic button on every tab, because navigation stays at 4 tabs.
2. **Risk fund target for Ion:** `07-architecture.md` says about 33.100 lei, while step 7 in `10-plan.md` and the sample message in `07-architecture.md` still say about 20.000 lei. The code and the F3 tests use 33.100.
