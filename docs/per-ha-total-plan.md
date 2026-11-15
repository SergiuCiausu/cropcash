# Plan: every money figure "pe hectar" or "total"

Status: **built on 2026-11-14**, with the four decisions at the end. Differences from the plan below: on Prognoză's crop tiles the fourth tile now shows the other unit ("Rămâne pe hectar" / "Rămâne în total") instead of going away; on Subvenții the whole hero card (amount, range, advance, rest) follows the switch, not only the payment sheet. Code: `packages/shared/src/money` (conversions), `web/lib/cc/basis.ts` (reading, echo, flip), `web/components/app/Basis.tsx` (switch, shared choice), `FarmView.areaAri`.

## The goal

A farmer thinks in both units: a seed invoice is a total, rent is "800 lei la hectar", a neighbour says "m-a costat 4.000 la hectar". Today each field forces one unit (costs only per ha, records only total) and the results pages show per-ha only in a few hand-picked places. After this change:

- **Inputs:** every money field where both units make sense gets a small switch, `Total | Pe hectar`. The farmer types in either; the app saves the same canonical value as today, so **no schema, DB or API change**.
- **Results:** cards that show farm economics (what comes in, what it costs, what is left) get the same switch, and every figure on the card follows it. Account balances, the salary and the pension never go per hectare.

Works fully offline: it's only arithmetic on the phone, with the hectares already saved.

## Rules that hold everywhere

1. **What is saved never changes.** Crop costs stay `costLeiPerHa` / `costs.*LeiPerHa` (whole lei per ha). Records stay `amountBani` (integer, total). The switch only changes what is typed and shown.
2. **Which hectares.** One helper decides, so every page divides by the same number:
   - a crop (crop tab, expense "Pentru: Porumb", sale of a crop, a crop's cost field) → that crop's hectares **in the harvest being looked at** (`view.selected.parcels`), not the farm profile;
   - "Toată ferma" → all hectares of that harvest.
   - 0 ha (crop not sown this year) → the switch is shown disabled with "Nu are hectare în recolta asta".
3. **Integers only.** Areas in ari (integer). `leiPerHa × ari` gives bani exactly (`lei/ha × ari/100 ha × 100 bani`), so per-ha → total never loses anything. Total → per-ha rounds to the whole leu (`Math.round(bani / ari)` lei); the field then shows what will really be saved ("Salvăm 1.913 lei/ha, adică 15.304 lei"), so a rounding difference is visible, not silent.
4. **Validation runs on the canonical value** (e.g. `MAX_COST_LEI_PER_HA`), but the error speaks the unit the farmer typed in ("Scrie costul pe tot sezonul în lei întregi, de exemplu 30.400").
5. **The other unit is always echoed under the field**, extending `AmountEcho`: `Adică 1.900 lei/ha × 16 ha = 30.400 lei`. This is the safety net against typing in the wrong unit, and it replaces the hand-written `costTotal` line in DatePlan.
6. Currency (EUR display) composes on top: the switch picks the unit, `useMoney()` still picks the currency. Fields stay in lei, as now.
7. Labels: `Total` / `Pe hectar`. Per-ha amounts read `1.900 lei/ha`. No new jargon.

## Inventory: inputs

| # | Where | Field | Saved as | Switch? | Default | Hectares used |
|---|---|---|---|---|---|---|
| I1 | `DatePlan.tsx:248` | Costuri pe tot sezonul | lei/ha | **yes** | **Pe hectar** (matches the ranges "de obicei 2.800–3.600 lei/ha" and the plan data) | crop's ha in the plan (`c.area`) |
| I2 | `Recolte.tsx:438` | Cheltuială, Suma | bani, total | **yes** | **Total**, except category `rent` → **Pe hectar** (arenda is quoted per ha) | "Pentru" crop's ha, or all ha for "Toată ferma" |
| I3 | `Recolte.tsx:438` | Vânzare, Suma | bani, total | **yes** | **Total** (the buyer pays one sum) | sold crop's ha |
| I4 | `Recolte.tsx:835-837` | OwnSheet: La semănat / Până la recoltă / La recoltat | lei/ha | **yes**, one switch for the three | **Pe hectar** | the "Hectare" field above it for a new crop (switch disabled until it's filled), the crop's ha for an existing one |
| I5 | `Papers.tsx:261` | Suma aprobată (decizia APIA) | bani, total | no: copied from the paper, which prints a total | Total | – (show the per-ha echo only) |
| I6 | `DatePlan.tsx:186`, `Onboarding.tsx:452` | Bani la început / bani de acum | bani | no: an account balance | Total | – |
| I7 | `DatePlan.tsx:221`, `Pensie.tsx:281` | Pensie pe lună | bani | no | Total | – |
| I8a | `DatePlan.tsx:238` | Tone la hectar | t/ha | **yes**, `Tone | Tone/ha` | **Tone/ha** (matches "De obicei 4–6 t/ha") | crop's ha in the plan |
| I8b | `Recolte.tsx:829-830` | OwnSheet: Tone/ha an normal, an slab | t/ha | **yes**, one switch for both | **Tone/ha** | same as I4 |
| I8c | `Recolte.tsx:553` | GatheredSheet: Câte tone ai strâns? | tonnes, total | **yes** | **Tone** (the scale gives a total) | the sheet's own "Hectare" field for that crop |
| I8d | `DatePlan.tsx:242`, `Recolte.tsx:554/832` | Preț, lei/kg | lei/kg | no: already a unit price | – | – |
| I8e | `Recolte.tsx:555` | Câte tone mai ai în hambar? | tonnes | no: grain in the barn isn't tied to a field | – | – |
| I9 | `Subventii.tsx:512-530` | Hectare simulator | – | not money | – | – |
| I10 | Assistant | free text | – | out of scope; the assistant already gets the figures in both units through the cards (O7) |

**Remembering the choice (inputs):** a field opens on its default above. Once the farmer flips I2/I3, the choice is remembered for that form via `storageKey('cropcash-basis-record')`, since the same person notes many invoices the same way. I2's `rent` default wins only while nothing was flipped. All other input fields always open on their default.

**Tonnes (I8a–c):** yields are decimals, not money, so rule 3 changes for them: tonnes → t/ha is `tonnes / ha` rounded to 2 decimals (the precision `decimalText` already shows), and the echo shows what is saved ("Salvăm 5,43 t/ha, adică 86,9 t"). The existing min/max checks ("De obicei 4–6 t/ha", "anul slab ≤ anul normal") run on the t/ha value. In DatePlan the `total` line (`t/ha × ha = t, adică … lei`) becomes the echo of this field.

## Inventory: results

One shared display choice, `cropcash-basis` via `storageKey` (like `cropcash-currency`), so flipping on one card flips all cards; the switch sits in each card header (`card-h`), not in the frame, because most of the page is not switchable.

| # | Where | What switches | Default | Never per ha |
|---|---|---|---|---|
| O1 | `CropBreakdown.tsx` | Intră / Ies per crop row (crop's ha); "pentru toată ferma" row and Total row (all ha) | **Total** | – |
| O2 | `Prognoza.tsx:188-191` crop tiles | Intră, Costă, Rămâne; the separate "Rămâne pe hectar" tile goes away (the switch replaces it) | **Total** | – |
| O3 | `Prognoza.tsx:195-198` farm tiles | Intră, Ies | **Total** | Cel mai jos, Rămân la final (balances) |
| O4 | `Prognoza.tsx:225-227` long-term tiles | Intră, Ies, Rămân înainte de salariu | **Total** | – |
| O5 | `Prognoza.tsx:296-310` crop table | Intră, Costă, and "Rămâne pe hectar" becomes "Rămâne" | **Total** | Hectare column |
| O6 | `CostPerHa.tsx` | already shows Pentru cultură / Partea din fermă / Pe hectar side by side | no switch: it is the per-ha explainer and already shows both | – |
| O7 | `Acasa.tsx:93-96` crop hero | big number follows the switch; the "Adică … pe hectar" line shows the other unit | **Total** | – |
| O8 | `Subventii.tsx:375` Suma tile | probable sum; the `între … și …` range follows too | **Total** (it's what lands in the account) | payment date |
| O9 | Subventii simulator result | the before/after amount and the delta | **Total** | the chart (x axis is already hectares) |
| O10 | Assistant cards (`SalaryCard`, `PurchaseCard`, …) | none | – | salary, purchase check, pension, months |
| — | Salariu, Bani, Pensie, Calendar, FarmChart, balances, Stripe amounts | none | – | all: these are money in the account, not money per field |

## How it's built

1. **`packages/shared/src/money`** (pure, tested):
   - `perHaToBani(leiPerHa, ari)` → integer bani;
   - `baniToPerHaLei(bani, ari)` → whole lei, `null` for `ari <= 0`;
   - `perHaBani(bani, ari)` for display (bani per ha, rounded).
   Tests: exact round-trip per-ha → total → per-ha, rounding at .5, 0 ha, Ion's 8 ha + 7 ha.
2. **`FarmView.areaAri(cropId | null)`** in `web/lib/cc/plan.ts`: the one rule from "Which hectares". Tests on Ion's farm and on a crop missing from the harvest.
3. **`web/lib/cc/basis.ts`** + `KEYS.basis`, `KEYS.basisRecord` in `storage.ts`: `loadBasis`, `saveBasis`, and a `useBasis()` hook next to `useMoney()` returning `{ basis, setBasis, show(bani, ari) }`, where `show` formats `lei(...)` or `lei(...)/ha`.
4. **`bits.tsx`**:
   - `BasisSwitch` — two `chip` buttons with `aria-pressed`, same look as the record-kind chips in Recolte; `disabled` + reason when `ari <= 0`.
   - `BasisAmountField` — label + input + switch + echo. Props: `value`, `onChange`, `basis`, `onBasis`, `ari`, `saved: 'perHa' | 'total'`. Returns the canonical value through a `read()` helper, so pages stop parsing by hand.
   - `AmountEcho` gains an optional `ari` to print both units.
   - `BasisAmountField` takes a `kind: 'lei' | 'tonnes'`, so the same field serves money and yields (units `lei` / `lei/ha` or `t` / `t/ha`).
   - Shared: `tonnesToPerHa(t, ari)` (2 decimals) and `perHaToTonnes(tPerHa, ari)`, with tests.
5. **Inputs**, one page at a time with its tests: I1 + I8a (DatePlan) → I2/I3 (Recolte record form; when the "Pentru" crop changes, the typed number stays and the echo recomputes) → I4 + I8b (OwnSheet) → I8c (GatheredSheet) → I5 echo only.
6. **Results**: O1 → O2–O5 (Prognoza) → O7 → O8/O9. Each card header gets `<BasisSwitch>`; each switchable `lei(x)` becomes `show(x, ari)`.
7. **Skeletons**: card headers in `web/components/skeleton/screens.tsx` get a chip-sized bone where the switch appears, so nothing jumps.
8. Ferma lui Ion: all of this is client-side, so the demo works unchanged; the choice is stored under the visitor's own `storageKey`.

## Tests to add

- shared: conversion round-trips and rounding (step 1).
- `costs.test.tsx`: type 30.400 in Total for 16 ha → saved `costLeiPerHa: 1900`; the echo shows both.
- `amounts.test.tsx`: expense "Pentru Porumb, 7 ha, 800 lei/ha" saves `amountBani: 560000`; "Toată ferma" uses all ha; category `rent` opens per ha; switch disabled for a 0 ha crop.
- `pages.test.tsx`: flipping on Prognoza flips CropBreakdown too; balances and the salary never change with the switch.
- OwnSheet: switch disabled until Hectare is filled.
- Tonnes: DatePlan "80 t" on 16 ha saves `yieldTPerHa: 5`; GatheredSheet "5 t/ha" on 16 ha saves `tonnes: 80`; the "De obicei" warning still fires when typed in total tonnes; OwnSheet's "anul slab ≤ anul normal" check works with the switch on Tone.
- Remembered unit: flip the record form to Pe hectar, note an expense, reopen → still Pe hectar; on Ferma lui Ion it's stored under the visitor's key.

## Decisions (2026-11-14)

1. Yield gets the same switch (`Tone | Tone/ha`): **yes**, built in this change (I8a–c).
2. The record form remembers the last unit: **yes**.
3. The results switch is **one choice for every results card at once**, like the currency.
4. `CostPerHa` (O6) gets **no** switch: it already shows both.
