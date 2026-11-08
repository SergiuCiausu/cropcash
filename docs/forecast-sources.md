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
| [Crop sales](#2-crop-sales) | Prognoză | Hectares × county yield (INS) × price, or the farmer's own |
| [Crop costs](#3-crop-costs) | Prognoză | Hectares × cost per ha, spread over months by our assumed shares |
| [APIA subsidy](#4-apia-subsidy) | Subvenții, Acasă, assistant | Scheme rates × farm area × ECB rate; range from PD-01's history |
| [APIA payment dates](#5-apia-payment-dates) | Calendar, Prognoză | Official 2026 windows, always the last day |
| [Bad, normal, good year](#6-bad-normal-and-good-year) | Prognoză chips | The county's real harvests |
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

**Yields** come from INS by county (next section). The yield columns below are used only for a crop INS doesn't cover. **Costs and prices** come from one national source for all counties: [capital.ro](https://www.capital.ro/este-agricultura-profitabila-in-romania-in-2026-analiza-costuri-vs-venituri-pentru-fermieri.html), label Press / older (2025). The file says each mean is the midpoint of min and max, calculated by us and not taken from the article.

| Crop | Cost lei/ha (min / mean / max) | Yield t/ha (min / mean / max) | Price lei/kg (min / mean / max) | Sold |
|---|---|---|---|---|
| Wheat | 3.500 / 4.250 / 5.000 | 4 / 5 / 6 | 0,90 / 1,05 / 1,20 | July |
| Maize | 4.000 / 5.000 / 6.000 | 5 / 6,5 / 8 | 0,80 / 0,95 / 1,10 | October |
| Sunflower | 3.500 / 4.500 / 5.500 | 2 / 2,5 / 3 | 1,80 / 2,15 / 2,50 | September |

The farmer's own figures replace these, in this order (`plannedFigures`, `withFarmerHarvest`, P26 and P29):

1. Expected yield and price from "Datele planului".
2. Yield and price noted in Recolte.
3. The county's INS history (below).
4. The national INS row, and only then the table above.

Their figure becomes the normal year, and the bad and good years keep the same ratio to it. Costs always stay the table's, unless it's a crop the farmer added, which uses only their numbers (P30).

### County yields (`crops-reference.json` → `county_history`)

INS table AGR110A, average yield per hectare, all ownership forms, 2011–2025, for every county and the country. Label Official. Calculated in `cashflow/county-yields.ts`, with the settings in `plan-params.json` → `yield_history`.

| Crop in Teleorman, t/ha | Bad | Normal | Good |
|---|---|---|---|
| Wheat | 2,97 | 4,31 | 5,03 |
| Maize | 1,47 | 4,01 | 7,09 |
| Sunflower | 1,02 | 2,09 | 3,09 |

A county with fewer than 12 reported harvests of a crop uses the country's figures. That applies to București, and to sunflower in Brașov and Harghita.

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

A kind of year is defined by the harvest, from the county's last 15 harvests (P4). It says what has happened, not what will happen.

| | Bad | Normal | Good |
|---|---|---|---|
| Yield | average of the 3 worst | median | average of the 3 best |
| Price | mean | mean | mean |
| Costs | mean | mean | mean |
| APIA balance | lowest | probable | highest |
| APIA advance | same | same | same |
| APIA date | last day | last day | last day |

Price stays at the mean because INS farm-gate prices barely follow national yield. Costs stay at the mean because they're paid before the harvest is known.

**After a bad harvest** (`afterBadHarvest`, shown under "An slab" on Prognoză and through `get_after_bad_harvest`): the 12-month plan can't show a drought, because its limit usually falls before the harvest. This runs the bad year for 24 months and reports the lowest point after the first harvest and the salary that would hold.

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
- Monthly price history or live market prices.
- Storage costs or selling later than harvest.
- Interest on credits.
- Inflation or changing prices over the years.
- Crop rotation.
- Daily exchange rates: they convert displayed amounts only, and subsidies use the fixed rate in §4.

## Weak points to know about

1. **The "safe" salary is only safe in a normal year.** It's calculated from the normal year, and the bad-year fund was removed on 7 Nov 2026. After one bad harvest, the salary that holds for Ion over 24 months is 0.
2. **Prices and costs rest on one 2025 press article**, with national figures and midpoints we calculated. Costs were probably written for bigger harvests than most counties get, so a crop can show a loss at its county's real yield, as maize does for Ion.
3. **The monthly cost shares are Unverified and carry no flag.** Their entries are marked `unverified: false`, and no code reads `months_status`. These shares decide when the hardest months fall.
4. **The subsidy range comes from three years of one scheme**, and every other scheme borrows it.
5. **The lower subsidy in a bad year has nothing to do with drought.** It comes from budget divided by total declared area, and is kept there as a small, separate risk.
6. **Credit what-ifs understate the cost**, because interest is missing.
7. **The multi-year view is a repeat, not a forecast.** It repeats today's figures for up to 10 years.
8. **Screens and the assistant calculate the pension's monthly figure differently.** They match for Ion, who has exactly 10 years left, and differ for everyone else.
9. **Two inputs may be labelled too firmly:** PD-02's source is a general guide site, and the FEGA rate counts as confirmed although APIA's own announcement wasn't checked.

## Where the docs and code disagree

- `saleForecast`, `quarterlyProjection` and `salaryByScenario` are still in `cashflow/scenarios.ts`, but no screen or registry function calls them. `docs/10-plan.md` step 8 still describes that sale card and the quarterly view as shipped.

## Notes: INS averages by county

Yield in t/ha for each county, as bad / normal / good. Calculated by `withCountyYields` from INS table AGR110A, 2011–2025.

- **Bad** is the average of the 3 worst harvests, **normal** is the median harvest, and **good** is the average of the 3 best.
- \* The county has fewer than 12 reported harvests of that crop, so it uses the national figures.
- These are county averages that mix irrigated and rain-fed land. A single farm's bad year can be much worse.
- A farmer's own yield replaces the normal figure, and the bad and good figures keep the county's ratio to it.

| County | Wheat | Maize | Sunflower |
|---|---|---|---|
| **Romania (national row)** | 3,03 / 4,00 / 4,85 | 2,77 / 4,16 / 6,70 | 1,39 / 1,93 / 2,91 |
| Alba | 3,13 / 4,29 / 4,83 | 2,99 / 4,86 / 6,71 | 1,36 / 2,45 / 2,69 |
| Arad | 3,80 / 4,48 / 5,29 | 2,70 / 4,59 / 6,88 | 1,55 / 2,17 / 3,20 |
| Argeș | 2,79 / 3,58 / 4,43 | 2,04 / 3,79 / 5,96 | 1,35 / 1,91 / 2,66 |
| Bacău | 2,68 / 3,37 / 4,44 | 3,04 / 4,45 / 6,18 | 1,47 / 1,93 / 2,80 |
| Bihor | 3,21 / 4,07 / 4,51 | 2,95 / 4,78 / 7,20 | 1,42 / 1,98 / 2,59 |
| Bistrița-Năsăud | 2,69 / 3,31 / 3,92 | 2,53 / 4,41 / 5,37 | 0,81 / 2,01 / 2,57 |
| Botoșani | 2,68 / 3,17 / 4,65 | 2,30 / 4,33 / 6,57 | 1,22 / 1,99 / 2,94 |
| Brașov | 3,31 / 3,86 / 4,81 | 3,03 / 4,82 / 5,82 | 1,39 / 1,93 / 2,91 \* |
| Brăila | 3,07 / 4,42 / 5,30 | 3,93 / 5,76 / 8,04 | 1,66 / 2,13 / 2,99 |
| București | 3,03 / 4,00 / 4,85 \* | 2,77 / 4,16 / 6,70 \* | 1,39 / 1,93 / 2,91 \* |
| Buzău | 1,54 / 3,53 / 5,19 | 0,81 / 4,09 / 7,32 | 0,97 / 1,73 / 2,99 |
| Caraș-Severin | 2,84 / 4,14 / 4,65 | 2,93 / 3,72 / 5,43 | 1,41 / 1,70 / 2,25 |
| Călărași | 2,91 / 5,05 / 5,71 | 2,84 / 5,29 / 8,20 | 1,72 / 2,43 / 3,14 |
| Cluj | 3,07 / 4,13 / 4,52 | 3,11 / 4,58 / 6,64 | 1,86 / 2,31 / 2,97 |
| Constanța | 2,31 / 4,31 / 5,54 | 1,40 / 3,27 / 6,51 | 1,15 / 1,50 / 3,44 |
| Covasna | 2,93 / 3,76 / 4,78 | 3,62 / 4,78 / 7,01 | 1,67 / 2,08 / 2,51 |
| Dâmbovița | 2,59 / 3,33 / 4,78 | 1,83 / 3,67 / 5,05 | 1,12 / 2,07 / 2,39 |
| Dolj | 2,74 / 3,81 / 4,57 | 2,03 / 4,47 / 6,99 | 1,18 / 2,01 / 2,94 |
| Galați | 1,41 / 3,15 / 4,61 | 1,13 / 3,26 / 6,20 | 0,79 / 1,67 / 2,80 |
| Giurgiu | 3,30 / 4,11 / 5,29 | 2,47 / 4,73 / 7,34 | 1,46 / 2,21 / 2,81 |
| Gorj | 2,80 / 3,38 / 4,23 | 2,50 / 3,70 / 5,90 | 0,86 / 1,50 / 2,81 |
| Harghita | 2,50 / 3,25 / 3,72 | 2,65 / 4,53 / 5,74 | 1,39 / 1,93 / 2,91 \* |
| Hunedoara | 3,16 / 3,78 / 4,14 | 2,63 / 4,16 / 5,81 | 1,39 / 1,86 / 2,37 |
| Ialomița | 2,76 / 4,59 / 5,96 | 2,84 / 5,47 / 8,67 | 1,52 / 2,33 / 2,84 |
| Iași | 2,60 / 3,45 / 4,57 | 1,61 / 3,86 / 5,97 | 1,23 / 1,86 / 2,66 |
| Ilfov | 3,33 / 4,23 / 4,83 | 1,52 / 4,31 / 6,70 | 1,26 / 1,92 / 2,43 |
| Maramureș | 2,74 / 3,57 / 4,67 | 2,62 / 3,65 / 5,68 | 0,97 / 1,94 / 3,13 |
| Mehedinți | 2,83 / 3,36 / 4,84 | 1,24 / 3,40 / 6,47 | 0,97 / 1,83 / 3,57 |
| Mureș | 3,40 / 4,52 / 5,41 | 3,65 / 5,78 / 7,09 | 1,88 / 2,44 / 3,01 |
| Neamț | 3,21 / 4,28 / 5,23 | 3,63 / 5,23 / 8,12 | 1,91 / 2,34 / 3,15 |
| Olt | 2,81 / 4,14 / 5,10 | 1,37 / 3,69 / 6,39 | 0,95 / 1,96 / 3,18 |
| Prahova | 2,51 / 3,72 / 5,04 | 1,65 / 4,37 / 5,93 | 1,33 / 2,14 / 2,47 |
| Satu Mare | 3,37 / 4,17 / 4,58 | 3,13 / 4,82 / 7,35 | 1,77 / 2,14 / 3,37 |
| Sălaj | 2,82 / 3,48 / 3,82 | 2,80 / 3,75 / 5,83 | 1,49 / 1,89 / 2,67 |
| Sibiu | 3,05 / 3,56 / 3,82 | 3,43 / 4,61 / 5,87 | 1,35 / 2,12 / 2,48 |
| Suceava | 2,61 / 3,63 / 4,47 | 2,98 / 4,96 / 6,33 | 1,53 / 2,03 / 2,90 |
| Teleorman | 2,97 / 4,31 / 5,03 | 1,47 / 4,01 / 7,09 | 1,02 / 2,09 / 3,09 |
| Timiș | 4,09 / 5,12 / 5,77 | 2,22 / 4,64 / 8,97 | 1,81 / 2,46 / 3,29 |
| Tulcea | 1,93 / 3,69 / 4,79 | 1,53 / 3,23 / 6,62 | 1,13 / 1,76 / 2,89 |
| Vaslui | 2,36 / 3,37 / 4,10 | 1,48 / 3,37 / 5,51 | 0,99 / 1,53 / 3,12 |
| Vâlcea | 2,94 / 3,39 / 4,50 | 1,69 / 4,13 / 6,42 | 0,80 / 1,60 / 2,98 |
| Vrancea | 1,35 / 3,37 / 4,55 | 0,79 / 3,54 / 5,81 | 0,87 / 1,78 / 2,51 |
