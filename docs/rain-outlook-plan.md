# Plan: how much rain in the next 1–5 years

Status: **steps 1–2 done (2026-11-20).** Step 1's findings are below and have replaced the earlier **Check** items. Step 2 is `packages/shared/src/weather/rain-outlook.ts`, with its settings in `plan-params.json` → `rain_outlook`.

## What step 1 found (Teleorman, Timiș, Suceava, fetched 2026-11-20)

**History (ERA5, Historical API):** complete, no gaps, 1991–2025. Range per season, low / usual / high mm (P10 / P50 / P90):

| County | Whole year | Wheat, Mar–Jun | Maize, Apr–Aug |
|---|---|---|---|
| Teleorman | 471 / 593 / 803 | 173 / 266 / 359 | 203 / 311 / 432 |
| Timiș | 518 / 641 / 869 | 174 / 240 / 351 | 210 / 292 / 474 |
| Suceava | 533 / 687 / 842 | 208 / 287 / 376 | 278 / 351 / 534 |

The season matters more than the year. In Teleorman 2024 was an ordinary year overall (8 of 35 years were drier), but its Apr–Aug was the 4th driest since 1991. That fits the maize collapse in the INS figures. So the card leads with the crop's season, not the year.

**Climate models (Climate API):** 7 CMIP6 HighResMIP models, RCP8.5-like, bias-corrected and downscaled with ERA5-Land, 1950–2050. They disagree a lot:
- Teleorman, whole year, 2027–2031 vs 1991–2020: −21% to +20%, median +12%.
- The same models over 2026–2035: median +9%. For wheat the 5-year median is −4.5%, but the 10-year median is +5.9%.
- A 5-year window is mostly noise, so we average 10 years (`model_window_years`). The range moves only when at least 6 of 7 models agree on the direction (`models_agree_min`). With that rule, Teleorman and Timiș show history only. Suceava moves +6% for the year and +13% for wheat.
- The models' own totals are 2–14% wetter than ERA5 in Teleorman, so only each model's change against itself is used, never its mm.

**Seasonal (Seasonal API):** ECMWF, 51 members. EC46 covers the first 46 days, then SEAS5 takes over. It goes out 7 months: 217 days in the API, but the last month comes back cut short and full of nulls. SEAS5 updates on the 5th of each month. The daily members are wetter than ERA5 (for Suceava, almost every month looked "wet"), so comparing them with ERA5 is wrong. Instead we use `monthly=precipitation_mean,precipitation_anomaly`. The anomaly is against the model's own hindcast climatology, gives 6 months, and costs about 1 call.

**Rate limits and cost:** the free tier allows 600 / min, 5 000 / h and 10 000 / day, and it is **non-commercial**. A request longer than 2 weeks counts as several calls. 35 years of ERA5 went over the per-minute limit right away. The Climate API, 7 models × 46 years, costs about 840 calls per county, so about 35 000 for all 42. That is roughly 4 days on the free daily limit, so the build script must be resumable and keep what it has already fetched. Commercial use needs the **Professional** plan, which is the first one to include the Historical, Climate and Seasonal APIs. The price isn't shown on the pricing page. Data is CC BY 4.0: credit Open-Meteo and the CMIP6 programme, and show ECMWF as the source.

## The honest starting point

No one can say how many mm will fall in Teleorman in 2028. Daily weather can't be predicted past about two weeks. Seasonal models have some skill for the next few months, but for rain in Romania it's weak. Past a year, the only defensible answers are:

1. **What a year usually looks like here**: the range from the county's own past (climatology).
2. **Which way it's drifting**: the climate-model trend for the next few years, applied to that range.
3. **The next few months only**: whether the seasonal models lean drier or wetter than usual.

So the feature is not "it will rain 480 mm in 2028". It is: *"In a year like the ones here, rain in the growing season is between X and Y mm. About one year in Z is as dry as 2024. Models lean slightly drier. For this spring, models say: drier than usual."* That is also what the bad/normal/good year already does for yields (`docs/an-slab-an-bun-plan.md`), so the two fit together.

## Scope: every county

The outlook covers **all 42 counties** in `counties.json` (41 + București). Each signed-in farmer sees their own farm's county, read from the farm on the server like `/weather`. Teleorman appears in this plan only as the first hand-check (build step 1) and because Ion's example farm is there. Nothing in the code is specific to Teleorman or to the demo account.

## Three layers, one card

| Horizon | Source | What we show | Updates |
|---|---|---|---|
| 0–7 days | Existing `/v1/forecast` (`apps/api/src/weather.ts`) | Unchanged | 3 h cache |
| Next 6 months | Open-Meteo Seasonal API, monthly mean + anomaly (ECMWF EC46 → SEAS5) | Per month: drier / usual / wetter than the model's usual (±`seasonal_usual_band_pct`) | 24 h cache; SEAS5 refreshes on the 5th |
| Years 1–5 | ERA5 history (Historical API) + CMIP6 (Climate API) | Per year and per growing season: low / usual / high rain (P10 / P50 / P90), the chance of a dry season, and the trend | Built once per year by a script, saved in `docs/data/` |

### Years 1–5, in detail

Per county seat (the same `lat`/`lon` in `counties.json` that weather already uses):

1. **History:** daily `precipitation_sum` from the Historical API (ERA5), 1991 through last full year. Sum into months, growing seasons and calendar years.
2. **Seasons that matter:** wheat ~ Mar–Jun, maize and sunflower ~ Apr–Aug. The months go in `plan-params.json`, not in code.
3. **Trend:** from the Climate API (7 CMIP6 models), each model's change in season rain between 1991–2020 and the 10 years from the first outlook year. Take the **median across models**. Apply it only when `models_agree_min` of them go the same way; otherwise say the models disagree.
4. **Range:** the historical distribution, scaled by that change per month. Report P10 / P50 / P90 for each of the next 5 years. They'll be nearly identical year to year, and that's correct: the UI should say so, not hide it.
5. **Dry-season chance:** the share of years whose growing-season total fell below a threshold (for instance the 2024 value, or P20). The threshold is a param.

Why not run CMIP6 year by year as a forecast: the models don't know *which* year will be dry. Their single years are noise. Only the multi-year average shift is usable.

## Where it goes in the code

| Piece | Location | Notes |
|---|---|---|
| Pure maths | `packages/shared/src/weather/rain-outlook.ts` + tests | Parse the three responses with Zod (like `parseOpenMeteo`), monthly sums, percentiles, model-median delta, tercile probabilities. No I/O. |
| Build script | `scripts/build-rain-climatology.ts`, `npm run weather:climatology` | 42 counties × (1 history + N model calls). Writes `docs/data/rain-climatology.json` with source, date fetched, licence. Run once a year. Throttle requests. |
| Data file | `docs/data/rain-climatology.json` | Per county: monthly P10/P50/P90, season totals per past year, model delta and spread. Obeys "figures come from `docs/data`". |
| Params | `plan-params.json` → `rain_outlook` | Reference window, seasons per crop, dry threshold, years shown (5), seasonal cache hours. All `presupunere`, editable in `factors.ts` where it makes sense. |
| Seasonal service | `apps/api/src/rain-outlook.ts` | Same pattern as `createWeatherService`: per-county cache, shared in-flight request, stale copy on failure. |
| Route | `GET /api/rain-outlook` | County comes from the farm, never the client, like `/weather`. Returns climatology slice + seasonal terciles + `stale`. |
| UI | Section "Ploaia în anii următori" in Prognoză, under "Următorii ani" | One bar per year (low–usual–high), a line for the dry-season chance, then the next months as three-way chips. Text in plain Romanian. |
| Ion's farm | `/ferma-lui-ion` reads `rain-climatology.json` for Teleorman directly; the seasonal part comes from a frozen snapshot in `demo-ion.json` | It never calls the API. |

**Offline:** the 1–5 year part is static data, so it works with no network. The seasonal part keeps its last copy on the phone and shows when it was fetched, like `WeatherCard`. Nothing here moves money.

## Suggested text (UI)

- Title: „Cât plouă în anii următori”
- Under it: „Nimeni nu știe cât va ploua într-un an anume. Îți arătăm cât plouă de obicei în județul tău și încotro merge.”
- Per year: „Între martie și iunie: de obicei 180 mm. Într-un an secetos, sub 110 mm.” (numbers from the data, not these)
- Dry chance: „Cam un an din cinci e la fel de secetos ca 2024.”
- Seasonal: „Primăvara asta: mai multe șanse să fie mai uscată decât de obicei.”

## Phase 2: tie rain to the money

The real value for Ion is "how likely is an an slab". With INS yields 2011–2025 per county already in `crops-reference.json` and growing-season rain per year from step 1:

- Check per county and crop how well season rain explains yield (maize should be strong, wheat weaker).
- Where it's strong enough, show: „În anii cu ploaia asta, porumbul a dat în medie X t/ha.” and use the dry-season chance as the odds next to the bad-year chip.
- Where it isn't, say nothing. Don't invent a link.

Do this only after phase 1 is live and the numbers have been looked at by hand.

## Build order

1. ✅ Fetch Teleorman, Timiș and Suceava by hand, look at the numbers, settle the **Check** items. Findings at the top.
2. ✅ `rain-outlook.ts` in shared, with tests on small fixtures (`rain-outlook.test.ts`): parsing the three APIs, season totals (a year with a gap is left out), percentiles, model trend with the agreement rule, season range, month lean. Settings in `plan-params.json` → `rain_outlook`, all `presupunere`.
3. ✅ (code) Build script `scripts/build-rain-climatology.ts`, `npm run weather:climatology [-- TR TM] [--rebuild]` → `docs/data/rain-climatology.json`.
   - The file keeps the **season totals per year** and **each model's change**, not the ranges. Percentiles, the dry threshold and `models_agree_min` are applied live by `countyRainOutlook` (`weather/rain-climatology.ts`). Changing a season's months, the history start, the model reference or the window needs a rebuild. The file records what it was built with, and the script rebuilds every county when those change.
   - Resumable: raw responses are cached in `data-cache/rain/`, and the file is rewritten after each county. Without a key it pauses 65 s after each request, waits out the hourly limit and stops at the daily one, so you just run it again the next day. With `OPEN_METEO_API_KEY` it uses the `customer-*` servers and doesn't wait. Teleorman goes first.
   - Loaded with `loadRainClimatology()` from `@cropcash/shared/rain-climatology`. It's kept out of the package index so the data isn't bundled where it isn't used.
   - Tests: every county in `counties.json` is either built or listed in `meta.missing`, and the file's seasons match `plan-params`.
   - **Data status:** the free-tier run started on 2026-11-20 and needs a few days for all 42 counties. Check with `meta.missing`.
4. ✅ API: `apps/api/src/rain-outlook.ts` (service) + `routes/rain-outlook.ts`, `GET /api/rain-outlook`. Response shape: `RainOutlookSchema` in shared (`years`, `months`, `monthsFetchedAt`, `monthsStale`).
   - **Years** come from the built file, so they never need the network. `years: null` means the county isn't built yet.
   - **Months** use the Seasonal API (`seasonalUrl`), cached per county for `seasonal_cache_hours`. When Open-Meteo fails, the service serves the old copy marked stale and waits `weather.retry_minutes` before trying again. With no copy at all, it returns `months: null` and the years still show. It answers 503 only when there are neither years nor months.
   - The list starts with **next month**. The current month is partly over and the 7-day card covers the rest. On 20 Nov the live November value was "+151%", which would only confuse.
   - With `OPEN_METEO_API_KEY` set, it uses `customer-seasonal-api`. `OPEN_METEO_BASE_URL` (a self-hosted forecast server) isn't used for this yet.
   - Tests: `rain-outlook.test.ts` (cache, shared download, stale copy, retry wait, years without months, months without years, customer host) and the route in `app.test.ts` (session, the farm's county instead of the client's, 404s, 503).
   - Live check, Teleorman: the six months came back, and every season's range matches step 1. Note how sensitive the trend is to the window: Teleorman's whole year has 6 of 7 models agreeing for 2027–2036 (so the trend is applied, typical 635 mm), but only 5 of 7 for 2026–2035.
5. ✅ The "Cât plouă în anii următori" card in Prognoză (`web/components/app/RainOutlook.tsx`, styles in `web/styles/subsidies.css` next to the weather table, plus one card in the Prognoză skeleton).
   - The years are calculated **on the phone** with `countyRainOutlook`, from the built file and `view.data()` (admin changes included). They need no API, so they work offline and on Ion's farm. The file arrives through a dynamic `import()`, so the other pages don't load its ~230 KB. The service worker keeps it like every other build file.
   - Whole farm: one row for each set of months the sown crops need, then "Tot anul". Crops with the same months share a row. A crop tab shows that crop's season plus "Tot anul". Each row says „Între X și Y mm în 8 ani din 10, cel mai probabil Z mm” (UX principle 6), then the dry threshold and how often it happened, the 3 driest years, and whether the models moved the range. A bar shows the dry zone, the 8-in-10 band and the typical line, with a legend.
   - The months appear only for a farm on the server (like the weather card). They're saved in `localStorage` (`cropcash.rain-outlook`), and an old copy hides months already gone.
   - **Change from the plan:** Ion's farm shows **no months**, not a frozen snapshot. A seasonal forecast goes out of date within a month, and a frozen one would look current in the demo. The years are the real Teleorman data.
   - Checked in the browser at 390 px on `/ferma-lui-ion/prognoza` (whole farm and wheat tab). Not checked in the browser: the months on a signed-in farm, because the local API wasn't running. The route and service are covered by step 4's tests.
6. ✅ Phase 2: rain and the county's harvests.
   - **Hand check first** (6 counties built at the time: AB, AR, AG, BC, BH, TR). Season rain vs INS yield, 2011–2025, after removing each county's straight-line rise in yields:

     | Crop | r (detrended) | Dry seasons' yield vs other years |
     |---|---|---|
     | Maize | 0.20–0.68 (TR 0.63, BC 0.68, AB 0.50) | 41–73% everywhere. TR: 1.7 vs 4.2 t/ha |
     | Sunflower | 0.17–0.62 (TR, AR strong; AG, BH weak) | 54–89% |
     | Wheat | −0.11 to 0.47 | 82–113%. In TR and AG, dry springs gave more wheat |

     Mar–Jun rain doesn't explain wheat. It's sown in autumn, and heat or rain at the wrong time matter more than the total. With 15 years, r ≈ 0.5 is about where a link stops looking like chance.
   - **Built:** `rainYieldLink` in `weather/rain-climatology.ts`. It returns the correlation, the INS dry years, and the median yield in dry years and in the other years. It is shown only when r ≥ `yield_link_min_r` (0.5) and there are at least `yield_link_min_dry_years` (2) dry years. On the card, each crop row with a strong link gets one line, for example „În anii secetoși (2015, 2024 și 2025), recolta de porumb din județ a fost de 1,7 t/ha, față de 4,2 t/ha în ceilalți ani.” Wheat in Teleorman gets nothing. Calculated on the phone, so it works offline and on Ion's farm.
   - **Dropped:** "the dry-season chance next to the bad-year chip". A dry season is the driest 20% by definition, so its chance is 1 in 5 in every county. That's the same frequency the "an slab" chip already says (3 of 15). It would add nothing.
   - **Not done:** the link doesn't change any money figure. The bad year is still the INS worst-3 average. Making rain move the forecast would mean predicting a dry year, which no one can do past a few months.

## Open questions (to add to `docs/11-open-questions.md`)

- **Licence:** the data is CC BY 4.0, but the free API is non-commercial. Launch needs the Professional plan, or self-hosting (`open-meteo-vps-setup.md`). Still open: the price, and whether a self-hosted instance serves the Climate and Seasonal data.
- **Seasons per crop:** Mar–Jun for wheat and Apr–Aug for maize and sunflower are our guesses. Have an agronomist check them.
- **All the `rain_outlook` settings are `presupunere`.** Add them to the P-list.
- **One point per county:** the county seat may not match a farm 60 km away. Good enough for ranges; revisit with the plot coordinates from LPIS later.
- **ERA5 rain bias:** reanalysis rain is smoothed. Compare a few years with ANM station totals before trusting the absolute mm. If they differ a lot, show shares ("20% less than usual") instead of mm.
- **Where in the UI:** under Prognoză (proposed) or its own screen?
