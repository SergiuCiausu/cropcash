# Plan: crops that didn't make it to harvest

Status: **built** (steps 1–7, 2026-11-14/15). Open: P33 (do INS yields count lost fields?) and the optional demo row (Screens 6).

## The goal

1. The farmer can say how much of a crop they **couldn't harvest** in a harvest year, for example „3 ha din 8 de porumb s-au uscat”, and why.
2. Every harvest keeps that figure, so the farm builds a **history of losses per crop**.
3. The forecast uses that history: income is planned on the hectares that usually make it, while costs stay on everything sown.

Today a lost field is invisible. `gathered.tonnes / gathered.areaHa` mixes "low yield" with "half the field died", and the plan sells the whole sown area every year.

## What "lost" means

| Term | Definition |
|---|---|
| **Sown** (`areaHa`) | Hectares of the crop in that harvest year. Already stored. |
| **Lost** (`lost.ha`) | Hectares that weren't harvested at all, or were ploughed under. 0 ≤ lost ≤ sown. |
| **Harvested** | Sown − lost. Yield is per harvested hectare. |
| **Loss share** | Lost ÷ sown for one harvest. Over several harvests: Σ lost ÷ Σ sown (weighted by area, so a 0,5 ha trial doesn't count as much as 10 ha). |

A thin crop that was still harvested is **low yield, not loss**. It already shows in tonnes. Counting it twice would understate income.

**"Didn't say" is different from "lost nothing".** A missing `lost` is unknown, and that harvest is left out of the history. `lost.ha = 0` is a real answer and counts.

## Data model

No migration is needed. Everything lives in the `farmers.harvests` jsonb (`HarvestsInputSchema`, `packages/shared/src/farm/harvests.ts`), which already holds one row per crop per harvest year in `years[].parcels[]`. That gives us the history.

```ts
// HarvestCropSchema (years[].parcels[]): optional, so older documents stay valid
lost: z.strictObject({
  ha: z.number().min(0).max(MAX_HA),
  reason: z.enum(['drought', 'hail', 'flood', 'frost', 'pests', 'other']).optional(),
  month: MonthKeySchema.optional(),     // when it happened, for the calendar and APIA (Later)
}).optional(),

// ExpectedSchema (Datele planului): the farmer's own figure wins over history (same rule as P29)
lossPct: z.number().min(0).max(100).nullable().optional(),
```

- `lost.ha > areaHa` is refused by the schema itself (a refine on the parcel, message `lost_over_area`, path `years.N.parcels.M.lost.ha`), not by `validateHarvests`: it needs nothing from docs/data.
- The web save paths keep `lost`: `harvestsDocument`, `onboardingHarvests` (keeps the saved loss, like sowing) and `harvestsFromServer`. The last two drop a saved loss that is now larger than the crop's hectares, otherwise every later save would be refused.
- `gathered` stays one row per crop. Its tonnes now count as the harvest from **harvested** hectares. The matching year comes from `harvestYear(gathered.harvested)`, or the current harvest when no month is given.
- The UI labels for reasons are Romanian, in `web/`: Secetă, Grindină, Inundație, Îngheț, Boli sau dăunători, Altceva.

## The calculation (`packages/shared`, pure)

New file `packages/shared/src/farm/crop-loss.ts`:

```ts
/** One crop's answered harvests, newest last: { year, sownHa, lostHa, reason }. */
lossHistory(years, cropId): LossRow[]

/** Σ lost ÷ Σ sown over the last `window_years` answered harvests before `beforeYear`, or null below `min_years`.
 *  A harvest never predicts itself: its own loss is `this_year`, and it joins the history of later ones. */
expectedLossShare(years, cropId, params, beforeYear?): { share: number; from: number; to: number; harvests: number } | null

/** What the plan uses for one crop in one harvest year:
 *  the known loss of that year > the farmer's lossPct > history > 0. */
lossShareFor(harvests, cropId, harvestYear, params): { share: number; basis: 'this_year' | 'farmer' | 'history' | 'none' }
```

The settings go in `plan-params.json` → `crop_loss: { window_years, min_years }`. These are product choices, not facts, and are labelled as such, the way `yield_history` is. I propose `window_years: 5` and `min_years: 2`. With a single harvest, one bad year would decide every forecast.

### Where it enters the plan

| Place | Change |
|---|---|
| `seasons.ts` `harvestFigures` | Yield = tonnes ÷ (sown − lost). A total loss (lost = sown) adds to the loss history but not to the yield. |
| `timeline.ts` crop sale (~line 293) | `cropSaleRange(crop, areaAri × (1 − share))`, with the share from `lossShareFor` for **that sale's harvest year**. A loss already known this year uses the real hectares. Future years use the history. |
| `timeline.ts` crop costs | **Unchanged**: full sown area. The money is spent before the loss. |
| `insights.ts` `cropEconomics` | Production and income on harvested ha. Break-even per kg = cost per sown ha ÷ (yield × (1 − share)). |
| `scenarios.ts` `saleForecast` | Same as above. |
| `farmData` / `timelineInput` | They pass the harvests document through, so `lossShareFor` can read it. |

Because `buildFarmPlan`, `longForecast`, `afterBadHarvest` and the assistant all go through the timeline, salary, Prognoză, "După un an slab" and `get_forecast` change together. It's computed on the phone, so it works offline.

### Bad / normal / good year

Recommended: **the same share in all three.** The county's "an slab" is already a drought year (INS worst 3), so adding the farmer's worst loss on top would count the same drought twice. That's the same reasoning `an-slab-an-bun-plan.md` used for price and costs. The alternative is decision 2 below.

### Not counting it twice with INS

AGR110A is "producția medie la hectar". If INS divides by **cultivated** area, fields that were lost are already inside the county yields. Applying our share on top would then double-count. Until that's checked (**P33, DE-VERIFICAT**):

- The share applies only when the yield is the **farmer's own** (gathered or expected), because that one is now per harvested hectare.
- With a county yield, the history is still shown, but the plan doesn't subtract it.

Once P33 is answered, either keep that rule (per cultivated area) or apply the share everywhere (per harvested area).

## Screens (texts in Romanian, in `web/`)

1. **Recolte → „Ce ai strâns anul ăsta”** (`GatheredSheet`). Per crop, under the hectares: „Câte hectare n-ai putut strânge?” (default empty, which means unknown), with the % echoed („3 ha din 8, adică 38%”) and the reason chips. The tonnes label becomes „Câte tone ai strâns de pe hectarele recoltate?”.
2. **Recolte → „Culturile tale”, a crop still in the ground**: a quiet button „Am pierdut o parte din cultură”. It opens a small sheet (hectares, reason, month), so a spring frost shows in the plan **before** harvest.
3. **Closing a crop or year** (`closeHarvest`): if `lost` is missing for a crop, the confirmation asks „Ai pierdut ceva din {cultură}?” with „Nimic” (saves 0) and a field. This is the main way the history gets filled.
4. **Datele planului** (`DatePlan.tsx`): per crop, „Pierderi: în medie 12% din porumb (din recoltele 2024–2026)” with the per-year rows, and a field to replace it (`expected.lossPct`). Empty means history. When there's no history: „Încă nu știm. Scrie ce pierzi de obicei sau notează la recoltă.”
5. **Prognoză**: one source line per crop when a share is applied: „Am scăzut 12% pentru ce nu ajunge la recoltă, din recoltele tale.”
6. **Ferma lui Ion** (`docs/data/demo-ion.json`): optionally, a maize 2024 row with a loss so the demo shows it. It's a demo figure for an invented farm and is flagged as such.

Offline: the loss is part of the harvests document, so it saves and queues the same way the gathered sheet does today. No money moves.

## Assistant

- `get_forecast` returns, per crop, `lossShare` + `basis` + years, so it can say „am scăzut 12%, din recoltele tale”.
- Saving goes through the existing harvests save function (`registry.ts` ~477). The description says it now also holds `lost`.

## Steps

Each step ends with `npm test` and `npm run typecheck` green.

1. ✅ **Schema (~0,5 h).** `lost` on `HarvestCropSchema`, `lossPct` on `ExpectedSchema`, the lost ≤ sown check, and `crop_loss` in `plan-params.json` + its schema. Tests: old documents still parse, and lost > sown is refused.
2. ✅ **Pure functions (~1,5 h).** `crop-loss.ts`, with tests for: unknown vs 0, area weighting, window, min_years, total loss, and the priority this year > farmer > history > none.
3. ✅ **Yield per harvested ha (~0,5 h).** `harvestFigures` reads the year's `lost`. Test: 8 ha, 3 lost, 20 t gives 4 t/ha, not 2,5.
   Built: `GatheredHarvest.lostHa`; `gatheredWithLoss` in `crop-loss.ts` finds each gathered row's year (the harvest its `harvested` month falls in, otherwise the latest year with the crop) and `farmData` passes it to `plannedFigures`. A crop lost entirely gives no yield. Tests in `crop-loss.test.ts` → "yield per harvested hectare" (6).
4. ✅ **Plan (~2 h).** Timeline sale on harvested area, costs unchanged, `cropEconomics`/break-even, `saleForecast`. Tests: income drops and costs don't, a known loss this year beats history, 24-month view uses the real loss in year 1 and history in year 2, and no share is applied on a county yield (P33 rule).
   Built: `TimelineInput.lossShare(cropId, harvestYear)`; the sale uses `harvestedAri`, and its harvest is `saleHarvestYear` (the crop's last harvest on or before the sale month). `farmLossShare` in `farm-plan.ts` feeds every timeline (plan, long forecast, after a bad harvest, `computeFarmPlan`, the demo clock). `cropEconomics(crop, ari, share)` uses the crop's next harvest; break-even is `null` on a total loss (Prognoză says „Nu se strânge nimic”). `saleForecast` takes an optional share. Tests: `cashflow/crop-loss-plan.test.ts` (10).
   **Changed from the plan:** a loss already reported for a harvest (`this_year`) counts even on a county yield, because those hectares are gone, and that's what makes this year's sale drop "right away" (Done when). The P33 rule holds for the farmer's usual share and the history.
5. ✅ **Recolte (~2 h).** Gathered sheet field + chips, "Am pierdut o parte" sheet, the question at close. Component tests in the existing `*.test.tsx` style.
   Built: `web/lib/ui/loss.ts` (read + % echo, empty = unknown), `web/components/app/LossFields.tsx` (shared field + reason chips), in `Recolte.tsx` the field on `GatheredSheet` (tonnes per hectare count on harvested hectares), `LostSheet` behind „Am pierdut o parte din cultură” (shown only for a sown crop, saves the month) and `CloseSheet`, which replaces the plain confirm when a crop has no `lost` yet („Nimic” saves `{ha: 0}`, no answer stays unknown). Saves go through the same harvests save as the gathered sheet. Tests: `web/components/pages/loss.test.tsx`.
6. ✅ **Datele planului + Prognoză (~1 h).** History, override, source line. Skeleton unaffected (no new screen).
   Built: `farmLoss` in `farm-plan.ts` gives each crop its `AppliedLoss` (the `LossShare` + `applied`, false under the P33 rule); `farmLossShare` now uses it, and `buildFarmPlan` puts it on `economics[].loss`. Datele planului shows, per crop, the average over every answered harvest („Pierderi: în medie 25% din porumb (din recoltele 2025–2026)”), one row per harvest, and „Cât pierzi de obicei, în %” (`expected.lossPct`; empty = history, 0–100). On a county yield it says the loss is subtracted only from the farmer’s own. Prognoză adds one line per crop under „Culturile tale” (`lossLine` in `web/lib/ui/loss.ts`), including when the history is not subtracted. Tests: `crop-loss-plan.test.ts` (+4), `loss.test.tsx` (+5).
7. ✅ **Assistant + docs (~1 h).** `get_forecast`, `docs/07-architecture.md` §5, `docs/forecast-sources.md`, P33 in `docs/11-open-questions.md`, `glossary.md` if it lists terms.
   Built: `get_forecast` returns `cropLoss` (per crop: `subtractedShare`, `basis`, the year or from–to, `applied`), and its description tells the model what each means and that costs never drop; `save_harvests` describes `lost` and `lossPct`. Test in `registry.test.ts`. Docs: a paragraph in 07 §5, a section + weak point 9 in `forecast-sources.md`, P33 in 11. `glossary.md` only covers the subsidy monitor, so nothing went there.

About 8,5 h.

**Done when:** a farmer who lost 3 of 8 ha of maize sees this year's sale drop right away, costs unchanged. After two harvests with losses, next year's forecast subtracts the average, says where it came from, and the farmer can overwrite it.

## Decisions to confirm

1. **Field losses only, or storage too?** Recommended: **field only** in this plan. Grain that spoiled in the barn already shows as a lower `storedTonnes`. A separate "pierdut în hambar" figure can come later if farmers ask.
2. **Same share in bad/normal/good?** Recommended: **yes** (see above). The alternative: bad year uses the worst recorded loss, good year uses 0.
3. **`min_years: 2`, `window_years: 5`?** Recommended: yes. With 1, a single disaster dominates every forecast.
4. **Hectares or %?** Recommended: **hectares typed, % shown.** Farmers know which field died. A % is easier to get wrong.

## Later, not in this plan

- **APIA force majeure:** a lost crop from a natural disaster usually has to be reported to APIA within a fixed number of working days, with documents. A calendar reminder from `lost.month` would help. The deadline and rules must come from `docs/data` (DE-VERIFICAT), not from code.
- Loss per **plot** (`plots`, `plot_operations`) instead of per crop, once plots carry harvest quantities.
- A county or national loss rate, if INS or APIA publishes one, as a fallback when the farm has no history.
