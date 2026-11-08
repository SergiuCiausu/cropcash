# Plan: "an slab" and "an bun" from real county history

Status: **built on 2026-11-08 for every county**, with the four recommended decisions below. Still to do: new pitch figures in `docs/09-demo-pitch.md`, after `seed:demo` and `demo:rehearse`. "Today" in the tables means the rules before this change.

## Why the current years don't make sense

Today every county gets the same range, from one 2025 press article. INS table AGR110A (average yield per hectare, by county, 1990–2025) shows how far that is from a real farm's history.

**Teleorman, t/ha, last 15 harvests (2011–2025)**

| Crop | Today: bad / normal / good | INS: worst 3 avg / median / best 3 avg | Lowest year |
|---|---|---|---|
| Wheat | 4 / 5 / 6 | **2,97 / 4,31 / 5,03** | 2,42 (2012) |
| Maize | 5 / 6,5 / 8 | **1,47 / 4,01 / 7,09** | 1,18 (2024) |
| Sunflower | 2 / 2,5 / 3 | **1,02 / 2,09 / 3,09** | 0,65 (2024) |

Three things follow:

- Today's "an slab" for maize (5 t/ha) is better than a median year in Teleorman.
- Today's "an bun" for wheat (6 t/ha) has never happened there in these 15 years. The best was 5,11.
- Maize in Teleorman was 2,68 / 2,46 / 1,18 / 1,70 t/ha in the last four years. All four are below the 15-year median, so "normal" may still be generous.

Counties really do differ. Median wheat is 5,12 in Timiș and 3,63 in Suceava. Worst-3 maize is 54% of the median in the typical county, and 20% in Buzău.

## What each kind of year will mean

Per county and crop, over the last 15 harvests:

| Year | Definition | What the farmer reads |
|---|---|---|
| **An slab** | Average of the 3 worst harvests | „Ca cei mai slabi 3 ani din ultimii 15 în județul tău.” |
| **An normal** | The median harvest | „Un an obișnuit în județul tău.” |
| **An bun** | Average of the 3 best harvests | „Ca cei mai buni 3 ani din ultimii 15 în județul tău.” |

Why these choices:

- **15 harvests** include several droughts (2012, 2015, 2020, 2022, 2024) without reaching back to the 1990s, when yields were much lower.
- **Median, not average,** because one exceptional year shouldn't move "normal".
- **Three years out of 15** means a bad year has a real, checkable frequency: it describes one year in five. It's the outcome of the method, not a prediction.
- The numbers go in `plan-params.json` (`yield_history`: window, how many years, minimum years), and the ranges are calculated in code, as with the subsidy range.

**Which figure wins, highest first:**

1. The farmer's own yield becomes normal. Bad and good keep the county's ratio to normal, which `withFarmerHarvest` already does.
2. The county history, when it has at least 12 usable years.
3. The national row (`RO`), for the few counties with too little data (București; sunflower in Brașov and Harghita).
4. The article, only for a crop INS doesn't cover.

## What should change in a kind of year

Only the harvest should define it. Today's rules stack unrelated bad outcomes.

| Input | Bad today | Good today | Proposed | Reason |
|---|---|---|---|---|
| Yield | article min | article max | **INS as above** | Real history. |
| Price | mean | **max** | **mean in all three** | INS farm-gate prices (PPA102C, 2011–2025) barely move with national yield: correlation of yearly changes is −0,11 wheat, −0,31 maize, −0,27 sunflower. A bumper year doesn't bring the highest price, so the good year shouldn't assume it. |
| Costs | **max** | **min** | **mean in all three** | A drought doesn't make fertiliser dearer. The money is spent before anyone knows the harvest. |
| APIA balance | lowest | highest | unchanged | It's a separate, small risk (budget ÷ area). Noted in the page text. |

## What this does to Ion

Ion, Nov 2026 – Oct 2027, 200 lei pension. Lei, bad / normal / good.

| | Today | Proposed |
|---|---|---|
| Money in | 82.029 / 102.091 / 136.258 | 49.929 / 79.686 / 106.425 |
| Money out | 82.000 / 69.000 / 56.000 | 69.000 / 69.000 / 69.000 |
| Left at the end | 35.029 / 68.091 / 115.258 | 15.929 / 45.686 / 72.425 |
| Salary over these 12 months | 0 / 850 / 1.900 | 650 / 850 / 850 |

The most important finding: **the 12-month salary can't show a drought.** It's limited by spring 2027, before any 2027 harvest exists. Today's bad-year salary of 0 comes from the assumed higher spring costs and the lower APIA balance, not from the harvest.

The drought hits the following spring. Over 24 months with the proposed rules:

| | Bad | Normal | Good |
|---|---|---|---|
| Lowest balance | **−12.242 lei (June 2028)** | 7.799 (May 2027) | 7.799 (May 2027) |
| Salary that holds for all 24 months | **0** | 750 | 850 |

So the honest message is stronger than the current pitch line: „Un an slab nu te lovește când vine, ci în primăvara de după. Ai nevoie de 12.000 de lei în iunie 2028.”

## Steps

Each step ends with `npm test` and `npm run typecheck` green. Everything is calculated on the phone, so it works offline.

1. **Yield ranges (~1 h).** Pure function `yieldRange(history, county, cropId, params)` in `packages/shared`, with the fallback order and tests on real Teleorman figures. Add `yield_history` to `plan-params.json`.
2. **Use them (~1 h).** `withCountyYields` inside `farmData`, before the farmer's own figures, so salary, forecast, previews and the assistant all change together. Check the pages that read the base data directly: `DatePlan.tsx` and `usualTonnes` (the "media" hints), and `landing-data.ts`.
3. **Year rules (~1 h, after decision 1).** Price and costs at the mean in `cropSaleRange`, `storedGrainRange` and `cropCostRange`. Update P4, and the tests that assert the old ranges.
4. **"După un an slab" (~2 h, after decision 2).** Pure function on a 24-month timeline: lowest point, its month, salary that holds. A card on Prognoză under "An slab", and in `get_forecast` for the assistant.
5. **Say where it comes from (~1 h).** One line per kind of year on Prognoză, the INS source and years, and the sources returned to the assistant.
6. **Docs and pitch (~1 h).** `docs/07-architecture.md` §5, `docs/11-open-questions.md` (P4, P19, P20), `docs/forecast-sources.md`, and new figures in `docs/09-demo-pitch.md` after `seed:demo` and `demo:rehearse`.
7. **Shrink the data (~0,5 h).** `crops-reference.json` went from 3 KB to 153 KB and is bundled into the app. A compact shape (county → crop → 15 numbers) brings it to about 30 KB. It changes the `county_history` schema.

**Done when:** Teleorman and Timiș give different years; a farmer's own yield still wins; Ion's "An slab" page names the INS source and shows the following spring; no figure is hand-written in code.

**Later, not in this plan:** the question „Cât ai scos în cel mai prost an?” in Datele planului; INS regional prices (PPA102C) instead of the article; a cost per hectare the farmer can edit.

## Decisions taken

1. **Price and costs at the mean in all three years?** Recommended: yes. It removes the pitch line "salariul sigur ajunge la 0" for the 12-month view, and step 4 replaces it.
2. **Add the 24-month "după un an slab" view?** Recommended: yes, since the 12-month plan can't show a drought otherwise.
3. **Maize loses money for Ion at Teleorman's yields.** A median 4,01 t/ha earns 26.633 lei against 35.000 lei of costs, or −1.195 lei/ha. The article's costs probably assume a 6,5 t/ha crop, and we have no county cost data. Recommended: ship it, label costs as estimates, and let the farmer edit them next. Alternatively, Ion's demo crops could change, for example more wheat, but that shapes the demo around the answer.
4. **Which INS series?** The file holds "Total", which includes large companies. Individual farms run lower: Teleorman wheat in 2025 was 3,83 against 4,93 t/ha. They also include tiny household plots, so neither matches a 15 ha farm exactly. Recommended: stay with Total, because the farmer's own figure corrects it.

## Limits of this data

- It's a county average from a survey of about 64.000 farms. One farm's bad year can be much worse, and irrigated and rain-fed land are mixed together.
- INS last updated this table on 2026-06-29.
- The price comparison has only 14 year-to-year changes, so it supports the rule without proving it.
- The 24-month view repeats the same kind of year twice. June 2028 reflects only one bad harvest, but also two lowest APIA balances.
