# What each forecast is based on

Traced from the code and `docs/data/*.json` on 2026-11-08. If a value here ever differs from `docs/data/`, the data file is right and this page is out of date. The source links in the data files were not re-opened for this page.

**How firm each input is**

| Label | Meaning |
|---|---|
| Official | Stated by a named official source for 2026 (`confirmat-2026`). |
| Press / older | From an article or an earlier year (`din-2025`, `din-brief`, `din-presă`). |
| Our assumption | A product choice we made (`presupunere`, the P-list in `docs/11-open-questions.md`). |
| Unverified | `DE-VERIFICAT`: no good source yet. |
| Farmer | Typed in, or recorded, by the farmer. |

## At a glance

Every money forecast comes from one calculation, `buildFarmPlan` (`packages/shared/src/cashflow/farm-plan.ts`). None of them uses weather.

| Forecast | Shown on | Based on |
|---|---|---|
| [Money month by month](#1-money-month-by-month) | Prognoză, Calendar, assistant | Start balance + crop sales + crop costs + APIA + credits |
| [Crop sales](#2-crop-sales) | Prognoză | Hectares × yield × price from `crops-reference.json`, or the farmer's own |
| [Crop costs](#3-crop-costs) | Prognoză | Hectares × cost per ha, spread over months by our assumed shares |
| [APIA subsidy](#4-apia-subsidy) | Subvenții, Acasă, assistant | Scheme rates × farm area × ECB rate; range from PD-01's history |
| [APIA payment dates](#5-apia-payment-dates) | Calendar, Prognoză | Official 2026 windows, always the last day |
| [Bad, normal, good year](#6-bad-normal-and-good-year) | Prognoză chips | Which end of each range is used |
| [The next 1–10 years](#7-the-next-110-years) | Prognoză "Următorii ani" | One kind of year repeated at today's figures |
| [Monthly salary](#8-monthly-salary) | Salariu, Acasă, Stripe payout | The normal year only |
| [Hardest months](#9-hardest-months) | Prognoză, Acasă, Calendar, assistant | The running balance before salary |
| [Credit](#10-credit) | Assistant only | The normal year + 90% limit, no interest |
| [Purchase and pension what-ifs](#11-what-ifs) | Assistant | The plan recalculated with one change |
| [Crop profit and break-even](#12-crop-profit-and-break-even-price) | Prognoză, Salariu | Normal-year figures only |
| [Money split](#13-money-split) | Bani | Normal-year plan, months until next income |
| [Pension at 65](#14-pension-at-65) | Pensie, Acasă, assistant | Contribution + our assumed 2 / 4 / 6% a year |
| [Upcoming dates](#15-upcoming-dates) | Acasă, Calendar, assistant | The plan's entries, from `calendar-2026.json` |
| [Weather](#16-weather) | Acasă | Open-Meteo, 7 days, county seat |

## Inputs shared by the forecasts

### The farm

| Input | Comes from | Label |
|---|---|---|
| Crops, hectares, age, county | Onboarding, `farmInputFromStored` | Farmer |
| Start balance | `start_balance_bani` plus recorded money (`recordedBalance`) | Farmer |
| Sales and expenses that happened | `transactions`; each takes the matching planned entry off the plan | Farmer |
| Declared credits | `expected_payments` | Farmer |
| Grain in the barn | `harvests.gathered`, minus later sales; counted as sold in the plan's first month (P28) | Farmer + our assumption |
| Sowing month | `planted_month`; only sets the first sale | Farmer |
| Ion's whole farm | `docs/data/demo-ion.json` | Our assumption (P9) |

### Crop figures (`docs/data/crops-reference.json`)

One national source for all counties: [capital.ro](https://www.capital.ro/este-agricultura-profitabila-in-romania-in-2026-analiza-costuri-vs-venituri-pentru-fermieri.html), label Press / older (2025). The file says each mean is the midpoint of min and max, calculated by us and not taken from the article.

| Crop | Cost lei/ha (min / mean / max) | Yield t/ha (min / mean / max) | Price lei/kg (min / mean / max) | Sold |
|---|---|---|---|---|
| Wheat | 3.500 / 4.250 / 5.000 | 4 / 5 / 6 | 0,90 / 1,05 / 1,20 | July |
| Maize | 4.000 / 5.000 / 6.000 | 5 / 6,5 / 8 | 0,80 / 0,95 / 1,10 | October |
| Sunflower | 3.500 / 4.500 / 5.500 | 2 / 2,5 / 3 | 1,80 / 2,15 / 2,50 | September |

The farmer's own figures replace these, in this order (`plannedFigures`, `withFarmerHarvest`, P26 and P29):

1. Expected yield and price from "Datele planului".
2. Yield and price noted in Recolte.
3. The table above.

Their figure becomes the normal year, and the bad and good years keep the same ratio to it. Costs always stay the table's, unless it's a crop the farmer added, which uses only their numbers (P30).

### Subsidy figures (`docs/data/subsidies-2026.json`, `subsidies-history.json`)

| Input | Value | Label |
|---|---|---|
| PD-01 basic support | 101,03 €/ha | Official |
| PD-02 redistributive | 55,69 €/ha | Marked official, source is folositor.ro |
| PD-03 young farmers | 55,36 €/ha | Official |
| PD-04 arable eco-scheme | 56,28 €/ha | Official |
| PD-05 small-farm eco-scheme | 100 €/ha | Unverified |
| PD-28 unproductive land | none, so left out of the total | Unverified |
| Advance share | 75% | `advance_pct` in the data |
| Exchange rate (FEGA) | 5,2788 lei/€, ECB on 30 Sep 2026 | Marked official; APIA's own announcement not checked |
| Yearly actual vs planned, PD-01 | 2023: 1,011 · 2024: 0,985 · 2025: 0,900 | Press / older |

## The forecasts

### 1. Money month by month

Code: `buildTimeline` in `cashflow/timeline.ts`. Covers 12 months from the current month.

For each month: **balance at the end = previous balance + money in − money out**. It's before salary and pension.

- **In:** crop sales (§2), grain in the barn, APIA advance and balance (§4, §5), declared credits.
- **Out:** crop costs (§3), declared credit repayments.
- A sale or expense the farmer recorded removes the matching planned entry for that month, since the real money is already in the balance. Money the plan never expected only changes the balance.

### 2. Crop sales

`hectares × yield (t/ha) × 1.000 × price (lei/kg)`, on the 15th of the crop's sale month. The sale month is the same as the harvest month, so storage isn't modelled.

Example: Ion's wheat in a normal year is 8 × 5 × 1.000 × 1,05 = 42.000 lei.

A crop with a sowing month gets its first sale from that date, and yearly sales restart once the next crop has had time to grow (`seasons.ts`).

### 3. Crop costs

`hectares × cost per ha × the month's share`, on the 15th. The shares are **Unverified** (`months_status` in the data file), taken from a general farm calendar.

| Crop | Mar | Apr | May | Jun | Jul | Sep | Oct |
|---|---|---|---|---|---|---|---|
| Wheat | 25% | 15% | | | 15% | 15% | 30% |
| Maize | 15% | 45% | 15% | 10% | | | 15% |
| Sunflower | 15% | 45% | 15% | 10% | | 15% | |

### 4. APIA subsidy

Code: `computeSubsidies` in `subsidies/index.ts`, `computeRangeFactors` in `subsidies/range.ts`.

1. Eligibility rules pick the schemes for the farm (hectares, arable area, number of crops, age).
2. **Probable total** = each scheme's € rate × its hectares, then converted at the exchange rate.
3. **Lowest** = probable × the lowest yearly actual-to-planned ratio. **Highest** = probable × the highest ratio, at least 1.
4. **Advance** = 75% of probable, treated as certain. **Balance** = total − advance, so all the uncertainty sits in the balance.
5. If the farmer saved their APIA payment decision, its total replaces the whole range (`withApiaDecision`), in every kind of year.

PD-01 is the only scheme with usable history. All the others borrow its ratios (`fallback_scheme`), giving 0,900 and 1,011 for every scheme.

Example, Ion: (101,03 + 55,69 + 56,28) € × 15 ha = 3.195 €, which is about 16.866 lei. The range is about 15.179 to 17.058 lei, and the advance about 12.649 lei.

### 5. APIA payment dates

From `calendar-2026.json`, label Official.

| Payment | Window | Date the plan uses |
|---|---|---|
| Advance | 16 Oct – 30 Nov 2026 | 30 Nov |
| Balance | 1 Dec 2026 – 30 Jun 2027 | 30 Jun |

The plan always assumes the last day, so it still holds if the money comes late (P13). Later years add one year to these dates and are marked estimated. Only the demo clock uses the middle of the window (`plannedForMonth`), so the balance lands in March as in the pitch.

### 6. Bad, normal and good year

These are three cases we chose (P4). They aren't predictions and have no probabilities attached.

| | Bad | Normal | Good |
|---|---|---|---|
| Yield | min | mean | max |
| Price | **mean** | mean | max |
| Costs | max | mean | min |
| APIA balance | lowest | probable | highest |
| APIA advance | same | same | same |
| APIA date | last day | last day | last day |

The price stays at the mean in a bad year on the assumption that it doesn't fall when national output falls.

### 7. The next 1–10 years

Code: `longForecast`, `rollingYears`. It's the §1 calculation run for up to 10 years (`long_forecast.max_years`), grouped in 12-month blocks.

Each year is identical: the same kind of year every time, the same crops and hectares, and today's prices, costs and 2026 subsidy rates (P21, P25). Subsidy rules are only set through 2027 (`subsidy_rules_until_year`), and the page says so. There is no inflation, crop rotation or price trend.

### 8. Monthly salary

Code: `maxSafeSalary` in `cashflow/smoothing.ts`.

For each month: `(money available by then, after pension) ÷ months so far`. The smallest result is the salary, rounded down to 50 lei (P8), and that month is the "limiting month".

It uses **the normal year only**, on the late APIA dates. A salary the farmer fixed is paid as long as it stays under this limit. Otherwise the salary is held steady between incomes, and drops only if the money would run out (`salaryToPay`).

### 9. Hardest months

From the §1 balance, before salary. The lowest month-end balance is the lowest point. The run of money-losing months leading up to it is "the hardest stretch". The spring need is what goes out during that stretch (`springNeed`).

### 10. Credit

Code: `suggestCredit`, `whatIfCredit`.

| Part | Based on | Label |
|---|---|---|
| Limit | 90% of the probable subsidy, minus credits already declared | Official (APIA, 27 May 2026) |
| First possible month | When the next APIA application opens (March) | Unverified (P14) |
| Amount | What the normal year needs to reach the higher salary, rounded up to 100 lei | Our assumption (P8) |
| Interest | **Not included.** `robor_6m_pct` is empty, so the repayment equals the amount borrowed | Unverified |

### 11. What-ifs

`check_purchase`, `what_if_credit`, `what_if_pension` and `what_if_subsidy` rerun the real calculation with one change and save nothing. The first three compare normal-year salaries. A purchase is added as one payment in the chosen month.

### 12. Crop profit and break-even price

Code: `cropEconomics`. Uses normal-year figures only: income from mean yield and price, cost from mean cost. Break-even price = mean cost per ha ÷ (mean yield × 1.000).

### 13. Money split

Code: `proposeAllocation`. For the months until the next income in the normal plan: first debts due, then pension, then salary, and whatever is left goes to farm costs.

### 14. Pension at 65

Only the monthly amount is the farmer's. The rest is **Our assumption** (P6, `plan-params.json`): target age 65, and 2 / 4 / 6% a year. Interest compounds monthly. Fees, inflation and tax aren't included.

- **Screens** (Pensie, Acasă, `simulatePensionScenarios`): the monthly illustration is the 4% total spread over 10 years (`payout_years`).
- **Assistant** (`simulate_pension`): the monthly illustration is the total spread over as many months as it took to save.

### 15. Upcoming dates

Code: `upcoming`, `list_tasks`. These are the §1 entries from today on, by default 42 days or at least 4 items. Dates come from `calendar-2026.json`, with each event's own status. For example, the diesel agreement on 20 December is Unverified. Later years are projected and marked estimated. Funding deadlines the farmer follows are added.

### 16. Weather

Code: `packages/shared/src/weather`, `apps/api/src/weather.ts`. Open-Meteo forecast for 7 days at the county seat's coordinates (`counties.json`), kept for 3 hours per county.

The frost warning triggers at 0 °C or below (Our assumption). The wind warning is off because its limit is Unverified. Weather feeds no money figure, and that's deliberate (`docs/07-architecture.md`).

## What no forecast uses

- Weather, either forecast or historical.
- County yields from INS: downloaded on 2026-11-08 into `county_history`, but no code reads them yet, so a farm's county doesn't change its crop figures (`docs/an-slab-an-bun-plan.md`).
- Monthly price history or live market prices.
- Storage costs or selling later than harvest.
- Interest on credits.
- Inflation or changing prices over the years.
- Crop rotation.
- Daily exchange rates: they convert displayed amounts only, and subsidies use the fixed rate in §4.

## Weak points to know about

1. **The "safe" salary is only safe in a normal year.** It's calculated from the normal year, and the bad-year fund was removed on 7 Nov 2026. In Ion's bad year the safe salary is 0.
2. **Yields, prices and costs rest on one 2025 press article**, with national figures and midpoints we calculated.
3. **The monthly cost shares are Unverified and carry no flag.** Their entries are marked `unverified: false`, and no code reads `months_status`. These shares decide when the hardest months fall.
4. **The subsidy range comes from three years of one scheme**, and every other scheme borrows it.
5. **A bad year stacks every bad outcome at once.** The lower subsidy also has nothing to do with drought: it comes from budget divided by total declared area.
6. **Credit what-ifs understate the cost**, because interest is missing.
7. **The multi-year view is a repeat, not a forecast.** It repeats today's figures for up to 10 years.
8. **Screens and the assistant calculate the pension's monthly figure differently.** They match for Ion, who has exactly 10 years left, and differ for everyone else.
9. **Two inputs may be labelled too firmly:** PD-02's source is a general guide site, and the FEGA rate counts as confirmed although APIA's own announcement wasn't checked.

## Where the docs and code disagree

- `docs/07-architecture.md` §5 gives the APIA balance date as 1 Dec / mid-window / 30 Jun by kind of year. The code uses the last day in all three.
- The same section gives Ion's subsidy as 16.869,60 lei, from an older exchange rate. It's now about 16.866 lei.
- `saleForecast`, `quarterlyProjection` and `salaryByScenario` are still in `cashflow/scenarios.ts`, but no screen or registry function calls them. `docs/10-plan.md` step 8 still describes that sale card and the quarterly view as shipped.
