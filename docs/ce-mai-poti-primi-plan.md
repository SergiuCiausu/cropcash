# „Ce mai poți primi” – plan

Written 17 November 2026. A new card on `/subventii` that answers one question: **what else could this farm get, besides what it already gets and what it already applied for?**

Decisions taken:
- Two sources in one card: **APIA levers** (schemes the farm could get by changing something) and **funding calls** (AFIR / MIPE / EC calls that fit the farm).
- "Applied" becomes real data: a new `applied` state on a followed call, not a reuse of "follow".

## What "already gets" and "applied" mean

| Group | Where it comes from today | In the new card |
|---|---|---|
| Already gets | `plan.subsidies.schemes` (eligible APIA schemes, in the total) and `estimated` (eligible, priced at last year's amount) | Left out |
| Applied | **New:** `opportunity_follows.status = 'applied'` | Left out. One line at the bottom: „Ai depus la 2 apeluri” → Oportunități, view „În calendar” |
| Following, not applied | `opportunity_follows.status = 'following'` | Shown, with an „În calendar” tag |
| Ruled out | `notEligible` with a rule the farmer can't change (age, `total_ha` too big), calls at level `no` | Left out. „Ce nu primești și de ce” already covers APIA |

## Part 1 – APIA levers (pure, offline)

New file `packages/shared/src/subsidies/levers.ts`, with tests in `levers.test.ts`.

```ts
export interface Lever {
  code: string;                 // scheme code, e.g. 'PD-28'
  change: LeverChange;          // what the farmer would do
  gainBani: Range;              // extra subsidy (from computeSubsidies on the changed farm)
  estimate: boolean;            // true when the scheme's amount is last year's (PD-28 today)
  costBani: number | null;      // crop income given up, null when not knowable
  unverified: boolean;          // a DE-VERIFICAT rule or amount is involved
}
export type LeverChange =
  | { kind: 'fallow'; ari: number }        // leave N ari uncultivated
  | { kind: 'second_crop'; ari: number };  // put N ari under a second crop
export function subsidyLevers(farm: FarmInput, data: AppData, params?: SubsidyParams): Lever[];
// Built: also returns gained (all schemes the change brings), nameRo and farm (the changed farm, for the simulator preset).
// Takes params, not the page's SubsidyResult, so a payment decision on the page never skews the gain.
```

How it works. Thresholds are never hardcoded: each lever reads the rule from `data.subsidies.schemes[].eligibility.rules`.
1. Start from `base.notEligible`. Keep only schemes whose failed conditions are all on **fields the farmer can move**: `unproductive_pct`, `unproductive_ha`, `distinct_crops`. Skip `age`, `total_ha`, `arable_ha`, `dairy_cows` and `beef_cattle`. Shrinking or growing the farm is the simulator's job, not a suggestion.
2. Build the smallest change that passes the rule:
   - `unproductive_pct >= X` → fallow ari = `ceil(arable_ari × X / 100) − current unproductive ari`. Taken from the largest parcel.
   - `distinct_crops >= N` → move the smallest area that still makes a parcel count (respect `parcel_min_ha`) to a second crop. Pick the one in `crops-reference.json` with the best margin per ha.
3. Run `computeSubsidies` on the changed farm. Gain = new total minus old total, **plus** any scheme that shows up in `estimated` (that is how PD-28 comes back, since its 2026 amount is `null`). Mark those `estimate: true`.
4. Check the change doesn't knock out a scheme the farm already gets (`whatIfSubsidy` gives `lost`). If it does, drop the lever.
5. Cost: income given up on the moved area, from the same `cropEconomics` the farm plan uses (`packages/shared/src/cashflow/farm-plan.ts`). `null` when the crop has no margin in data.
6. Only levers with net gain > 0 (or `costBani === null`), sorted by net gain.

What this gives on the current data:
- **Ion (15 ha, wheat + maize):** PD-28. 2% of 15 ha = 0.30 ha left uncultivated, estimated amount, marked „Estimare”. PD-04 is already paid, so it isn't offered.
- **12 ha of wheat only:** PD-04 through a second crop, and PD-28.
- **8 ha:** PD-05 is already paid. PD-04 needs arable land above 10.01 ha, which is a `arable_ha` rule, so no lever.

Tests: one case per row above, plus: no lever when the change loses a scheme; no lever from age or size; thresholds come from the data (change a rule in a fixture and the lever follows).

## Part 2 – Funding calls that fit

Reuse `pageFits` / `matchOpportunityRows` (`web/lib/live/monitor.ts`, `packages/shared/src/opportunities/index.ts`). No new matching logic.

- Take calls at level `near`, open, deadline not passed. Leave out `applied` ones.
- At most 3, soonest deadline first. Under them: „Vezi toate apelurile pentru ferma ta” → `/oportunitati` (view `fit`), through `appHref`.
- Each row: name (`callName`), deadline (`Deadline` from Oportunități, moved to `bits.tsx` so both pages share it), budget if known, and the first `good` reason.
- Data: the same `useMonitor()` copy Oportunități uses. Offline it is the saved copy, with its date („Verificat la 14 nov.”). Signed out (Ion's farm) it is the dated snapshot.

## Part 3 – The "applied" state

**DB:** `supabase/migrations/037_opportunity_applied.sql`
```sql
alter table opportunity_follows
  add column if not exists status text not null default 'following'
    check (status in ('following', 'applied')),
  add column if not exists applied_at timestamptz;
grant update on table public.opportunity_follows to authenticated;
```
RLS already limits rows to the farmer's own. Add the `update` case to `tests/integration/rls.test.ts`.

**API:** `POST /api/opportunities/applied` `{ key, applied: boolean }` in `apps/api/src/routes/opportunities.ts`. It upserts the row (status `applied`, `applied_at = now()`), or sets it back to `following`. Unlike follow, it **doesn't need a deadline**, because a farmer can apply to a call that has none published. New `repo.setOpportunityApplied`.

**Shared:** `markApplied` in `packages/shared/src/functions/registry.ts`, next to `followOpportunity`. `opportunity_follows` rows gain `status` in the stored farm type.

**Web:**
- `store.setApplied(key, on)` next to `setFollow` in `web/lib/cc/store.ts`. Signed in: a server write through `NetButton reason="Pornește internetul ca să salvezi că ai depus."`. Never queued, same as follow. Signed out: a local list under `storageKey` (`farmKeys(mode).applied`).
- Oportunități: the call's sheet gets „Am depus dosarul” / „N-am depus încă”. The „În calendar” view shows a „Depus” tag.
- The assistant (`apps/api/src/ai/assistant.ts`) doesn't get a tool for it in v1.

**Applied calls stop their closing-soon alerts** (decided 17 Nov). `followedCalls` (`web/lib/cc/monitor.ts`) returns each call's `applied` flag, signed in from the row's `status`, signed out from the local list. Then:
- `Notifications.tsx:188`: no closing reminder for applied calls.
- `Calendar.tsx:128`: the call stays in the calendar, labelled „Ai depus dosarul”, with `follow` set but not marked urgent. In `ItemSheet.tsx:121`, `urgent` skips applied calls.
- `Acasa.tsx:275`: applied calls drop out of the "calls closing soon / open now" list.
- `list_closing_soon` (`registry.ts:843`) has no farm context and stays as it is: it lists calls, not reminders.
Tests: a followed call raises a notification, and the same call marked applied doesn't. The calendar item for an applied call isn't urgent.

## Part 4 – The card on `/subventii`

`web/components/pages/Subventii.tsx`: a new `<section className="card s7">` between „Ce primești” and „Ce nu primești și de ce”. Whole farm only (`!crop`), like its neighbours. It goes in its own component, `MaiPotiPrimi`, so `Subventii` doesn't grow.

Sketch only: the amounts are placeholders, not computed.
```
Ce mai poți primi
  De la APIA, dacă schimbi ceva
    Eco-schemă pentru zone neproductive   [Estimare]     cam +2.300 lei
    Lași 0,30 ha necultivate (2% din arabil). Pierzi cam 600 lei din recoltă.
    → Încearcă în simulare                (scrolls to Simulator with the change pre-set)
  Apeluri pentru ferma ta
    DR-14: …                              mai sunt 12 zile
    E pentru ferme mici
    → Vezi toate apelurile
  Ai depus la 2 apeluri →
```

- Lei through `useMoney().t(...)` and `about()`. Per-ha mode: the lever line shows the gain per ha of the farm, the same as the hero card.
- `Verify` on levers marked `unverified`, and „Estimare” on `estimate`. Estimated money **is not added** to any total and never reaches the salary (same rule as `base.estimated`). PD-28 is shown now with last year's amount (decided 17 Nov). Once `subsidies-2026.json` gets its 2026 amount, the tag disappears on its own, because the scheme moves from `estimated` to `schemes`.
- „Încearcă în simulare” (decided 17 Nov: yes, with a preset). It scrolls to the Simulator and sets the change there:
  - **The Simulator gets an uncultivated-land input.** Under „Ce culturi ai pune”: „Cât lași necultivat”, a number in ha with a chip for the threshold from the rule („0,30 ha, cât cere eco-schema”). `farmFor` passes it as `unproductiveHa`, which `buildProfile` already reads, so the engine needs no change. Whole farm only. In crop view it is hidden, as the crop chips are. The curve cache key (`pickedKey`) includes the fallow value. „Pierzi / Câștigi” already lists PD-28 through `whatIfSubsidy`. Estimated schemes aren't in `totals`, so the result also shows the estimated line separately: „+ cam X lei din eco-schema pentru zone neproductive (estimare)”.
  - **A preset from outside.** `Subventii` holds `preset: { ari?: number; pick?: string[]; fallowAri?: number } | null`. The lever sets it and scrolls to the Simulator (`id="simulare"`, `scrollIntoView`, focus on the heading). The Simulator's existing `key` gets a preset counter added, so a new preset remounts it with those starting values. „Asta e ferma ta de azi” compares against the real farm, not the preset, so the delta shows the lever's effect.
  - Second-crop lever: preset `pick` = today's crops + the suggested one, hectares unchanged. Because the Simulator splits hectares evenly, the result text says „împărțit în mod egal”. A per-crop split is out of v1.
- Empty states: no levers and no calls → „Primești tot ce poți primi acum. Îți spunem când apare ceva nou.” Calls failed to load and no saved copy → only the APIA part, with `OfflineNote`.
- Skeleton: add the card to the Subvenții skeleton in `web/components/skeleton/screens.tsx`.
- Texts: plain Romanian, no „eligibil”. Say „primești” / „ai putea primi”.

## Offline

| Part | Without internet |
|---|---|
| APIA levers | Works fully: pure function on the phone |
| Calls | The last saved copy, with its date. Never saved: the APIA part only, plus a note |
| „Am depus dosarul” | Signed in: off, `NetButton` says why. Signed out: works (local) |

## Order of work

1. ✓ `levers.ts` + tests (`npm test`). Done 17 Nov: `packages/shared/src/subsidies/levers.ts`, 13 tests.
2. ✓ Migration, repo, route, registry write, RLS test. Done 17 Nov: migration is `037_opportunity_applied.sql` (035/036 were taken), write is `mark_opportunity_applied`.
3. ✓ `store.setApplied`, button on Oportunități, „Depus” tag. Done 17 Nov: „În calendar” is split into „Ai depus” and „Urmărești”; Ion's farm keeps it under `cropcash-demo-applied`; unfollowing also clears applied. Tests: `web/components/pages/applied.test.tsx` (the harness now takes the monitor snapshot).
4. ✓ Applied calls stop alerts. Done 17 Nov: the shared plan drops applied calls from its deadline tasks (`farm-plan.ts`), which also clears them from `list_tasks`, Acasă „ce urmează” and the weekly message. Calendar keeps them as „Ai depus dosarul”, without the red marker and outside „termene în 30 de zile”.
5. ✓ Simulator: uncultivated-land input, estimated line, preset props. Done 17 Nov. Changed from the plan: the land is a `teren-necultivat` parcel cut from the crops, not `unproductiveHa`, so it counts as a crop the way the suggestions do and both give the same amount. The „Teren necultivat” crop chip is gone (the field replaces it). Today's crops keep their shares; only a changed set of crops is split evenly, and the result says so. `presetFromLever` + `showSimulator` in `web/lib/ui/levers.ts`; `Subventii` holds the preset, called in step 6.
6. ✓ `MaiPotiPrimi` card with „Încearcă în simulare”, skeleton, empty and offline states. Done 17 Nov: `web/components/app/MaiPotiPrimi.tsx`, full width after „Ce nu primești și de ce” (between the 7+5 pair it would break the row). `Deadline` moved to `bits.tsx`, the reason texts to `web/lib/ui/calls.ts`. „Ai depus la N apeluri” links to Oportunități, not to its „În calendar” tab (no link for a tab yet).
7. ✓ Check on Ion's farm (`/ferma-lui-ion/subventii`) and on a signed-in farm at 8, 12 and 15 ha. Done 17 Nov. Ion in the browser at 375 and 1280 px; the signed-in farms through the page harness (migration 037 isn't on Supabase yet, so they can't load in a browser). Fixed on the way: the simulator heading scrolled under the sticky crop tabs (`#simulare` scroll margin); with no close call but some to check, the card links to them instead of saying nothing fits; a crop loss that rounds to 0 reads „Pierzi foarte puțin”; when a fallow change brings PD-04 too, only the PD-28 part is called last year's amount (`Lever.estimateBani`).

## Decided (17 Nov)

- A lever opens the Simulator with the change set, and the Simulator gets an uncultivated-land input.
- An applied call stops its closing-soon alerts but stays in the calendar.
- PD-28 is shown now with last year's amount, marked „Estimare”, outside every total.
