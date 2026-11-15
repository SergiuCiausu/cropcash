# Crop catalogue: every crop a farmer can declare

## Status (14 Nov 2026): built

What shipped, and where it differs from the plan below:

- **`docs/data/apia-crop-codes.json`:** all 365 codes from Tabel 1 (p. 186–223), with code, genus, name as printed, section and heading. I checked the codes against the PDF: every code is there once, and the text on each code's own line matches the name.
- **Crops with figures stay in `crops-reference.json`.** The loader turns each of their APIA codes into its own crop (`expandCropFamilies`, `packages/shared/src/data/catalogue.ts`):
  - The first code keeps the id: `grau` is 101 GRÂU COMUN de toamnă, `porumb` is 108 PORUMB, `floarea-soarelui` is 201 FLOAREA SOARELUI.
  - The other codes become `apia-<code>`, with `family` pointing at the first. They share its figures, its INS county history and its nitrogen limit. That's 15 crops with figures in all.
  - Stored farms didn't need a migration.
- **No nullable figures.** This replaces the plan's "flat + nullable". The engine still only ever sees crops with figures. A catalogue line without figures (`priced: false`) goes through the existing own-crop form. That form now starts from the APIA line and keeps `apiaCode`, so the crop gets APIA's name and genus.
- **Qualifiers:** worked out from the APIA name (`apiaQualifier`), from a closed list. There is no „de vară”. Names are APIA's words in sentence case (`apiaDisplayName`).
- **Diversification (PD-04, GAEC 7):** counted by genus, as the APIA form does (II.B.b). Several APIA lines of wheat stay one crop. See `11-open-questions.md` #19.
- **Teren necultivat:** its code is 970 (confirmed, p. 204).
- **UI:**
  - Onboarding shows the 4 main crops with their APIA code. A search covers the whole APIA list (`CropSearch`).
  - Picking a line without figures says to add it in Recolte.
  - Recolte's „Culturile din …” has the same search: a line without figures opens the own-crop form, already named.
  - The Subvenții simulator shows chips only for the main crops and the farm's own.
- **Not done:**
  - Figures for more crops. What the search found isn't a full set from one source and has no months; it's listed in `11-open-questions.md` #20.
  - Extending INS AGR110A to more crops.
  - Asking an existing farm once for the hybrid group of its plain „Porumb”.

**What for:** today the app knows 4 crops (`grau`, `porumb`, `floarea-soarelui`, `teren-necultivat`). A farmer with rapiță, orz, orzoaică, soia or spring wheat has to type it in as an "own crop" (`own-*`), and the APIA reader drops every other code to „Nu am recunoscut”. Goal: the app knows every crop on the APIA cerere de plată, with real figures where we have a source and an honest "add your numbers" where we don't.

## Where things stand

- The catalogue is **`docs/data/crops-reference.json`**, validated by `CropSchema` / `CropsFileSchema` (`packages/shared/src/data/schemas.ts:323`). It is bundled into the app, so it works offline.
- In Supabase, `crop_id` is plain `text` on `parcels`, `transactions`, plot seasons etc. No enum, no FK → **no migration is needed** for new ids. The API checks ids against `data.crops.crops` (`apps/api/src/routes/records.ts:25`, `farmers.ts:179`), so new ids are accepted as soon as they're in the JSON.
- Every crop must have `cost_lei_per_ha`, `yield_t_per_ha`, `price_lei_per_kg` (min/mean/max), expense months, sowing/harvest/sale month. The only source today (capital.ro) covers 3 crops.
- `nitrogen-limits.json` already has `rapita`, `orz`, `soia` entries waiting for ids.
- `county_history` (INS AGR110A) has yields for the 3 crops only.
- UI assumes few crops: Onboarding shows one hectare field per crop (`web/components/pages/Onboarding.tsx:134`), the Subvenții simulator shows a chip per crop (`Subventii.tsx:466`).

## The catch: "no invented figures"

CLAUDE.md: figures only from `docs/data`, a missing figure is `null` + `DE-VERIFICAT`. We can source the **list** of crops completely (APIA table), but not cost/yield/price for 200+ crops. So the catalogue gets two tiers:

| Tier | What it has | Crops | Used by |
|---|---|---|---|
| **Known** (catalogue) | id, names, group, season, APIA codes, sowing/harvest months, nitrogen column | every code in MO 193 bis/2026, Anexa 1, Tabel 1 | APIA paper reading, subsidies (arable area, distinct crops), nitrogen limits, pickers, assistant |
| **Priced** (economics) | + cost, yield, price, expense months, sources | crops we have a source for (start: ~12 field crops) | plan, salary, forecast, scenarios |

A known-but-unpriced crop behaves like today's own crop: when the farmer picks it, the app asks for their normal year (sowing / care / harvest lei/ha, t/ha, lei/kg) with the form from `own-crops.ts`, and stores it as figures on the farm (`status: 'de-la-fermier'`). Nothing is invented.

## Schema changes (`packages/shared/src/data/schemas.ts`)

```ts
CropSchema = z.object({
  id, kind: z.enum(['crop', 'fallow', 'perennial', 'pasture']).optional(),
  name_apia: z.string(),            // exactly as printed in Tabel 1: "GRÂU COMUN de toamnă", "PORUMB-HIBRID/SOI TIMPURIU"
  name_ro, name_ro_art,             // same words as name_apia, only in sentence case: "Grâu comun de toamnă"
  apia_section: z.string(),         // the Tabel 1 heading it sits under, as printed: "CEREALE PENTRU BOABE", "PLANTE PROTEICE (LEGUMINOASE PENTRU BOABE)"…
  apia_qualifier: ApiaQualifier.nullable(),  // see "Autumn, spring and the rest" below
  family: z.string(),               // crops that share figures and INS history: "grau" for all four common/durum wheats
  aliases: z.array(z.string()).default([]),               // "orzoaica", "rapita", "grau" — search + assistant
  nitrogen_column: z.string().nullable(),                  // key into nitrogen-limits.json
  common: z.boolean().default(false),                       // shown first in pickers
  apia_codes,
  sowing_month, harvest_month,                              // known from the agricultural calendar
  // economics: all-or-nothing, null when unpriced
  economics: z.object({ cost_lei_per_ha, yield_t_per_ha, price_lei_per_kg, expense_months, sale_month_default, status, sources }).nullable(),
});
```

- `superRefine` keeps: one fallow crop, one owner per APIA code; adds: ids unique, aliases unique after diacritic folding, `name_ro` equals `name_apia` ignoring case, `apia_qualifier` appears word for word in `name_apia`, `de toamnă` ⇒ sowing month in Aug–Nov.
- Moving the figures under `economics` touches every reader of `cost_lei_per_ha` etc. (timeline, scenarios, seasons, county-yields, crop-costs, farm-plan, CostPerHa, Assistant, DatePlan, Recolte). Alternative with less churn: keep the fields flat and make them `.nullable()`, plus a helper `isPriced(crop)`. **Recommended: flat + nullable + `isPriced`**, and every engine entry point goes through one function `pricedCrop(data, farm, id)` that returns the docs figures or the farmer's own figures or `null`.

## Autumn, spring and the rest: APIA's own words

Every crop shows its season or type **exactly as APIA prints it** in MO 193 bis/12.III.2026, Anexa 1, Tabel 1 (p. 186–223, checked against the PDF on 2026-11-14). APIA has **no "summer crop" (de vară) category**. It uses these qualifiers, inside the crop name:

| `apia_qualifier` | As printed | On which crops (examples from Tabel 1) |
|---|---|---|
| `de toamnă` | „de toamnă” / „DE TOAMNĂ” | GRÂU COMUN, GRÂU DUR, TRITICALE, SECARĂ, ORZ, ORZ de bere, ORZOAICĂ, ORZOAICĂ de bere, OVĂZ, RAPIŢĂ, MĂZĂRICHE DE TOAMNĂ, MAZĂRE FURAJERĂ DE TOAMNĂ |
| `de primăvară` | „de primăvară” | the same cereals, RAPIŢĂ de primăvară |
| `timpuriu` / `semi-timpuriu` / `semi-tardiv` / `tardiv` | „HIBRID/SOI TIMPURIU”, „SEMI-TIMPURIU”, „SEMI-TARDIV”, „TARDIV” | PORUMB, SORG, FLOAREA SOARELUI, SOIA |
| `timpurii` / `târzii` | „CARTOFI TIMPURII (include cartoful semitimpuriu şi de vară)”, „CARTOFI TÂRZII” | potatoes |
| `anuale` / `perene` | „(anuale)”, „(perene)”, „PROASPETE anuale” | aromatice, legume proaspete, furajere, lot semincer |
| `secundare` | heading „LISTA AMESTECURILOR DE SPECII DE CULTURI SECUNDARE” (codes 460–483) | MUŞTAR + OVĂZ, RAPIŢĂ + TRITICALE… |
| `null` | no qualifier | PORUMB (plain), PORUMB ZAHARAT, OREZ, MEI, HRIŞCĂ, MAZĂRE BOABE, FASOLE BOABE… |

`ApiaQualifier` is that closed list; a test fails if Tabel 1 has a qualifier not in it. The UI shows `name_ro` („Grâu comun de toamnă”, „Porumb – hibrid/soi timpuriu”) and, under it, „Pe cererea APIA: GRÂU COMUN de toamnă, cod 101”. We never write our own season label: no „de vară”, no „cultură de primăvară” on maize.

**One catalogue row per APIA crop name** (in Tabel 1 each name has its own code), so the farmer picks exactly the line on their cerere. Rows that the farmer and the plan treat the same share a `family` (figures, INS history, nitrogen column):

- `grau` family: GRÂU COMUN de toamnă (101), GRÂU COMUN de primăvară (1010), GRÂU DUR de toamnă (102), GRÂU DUR de primăvară (1020). GRÂU SPELTA (alac) is its own row.
- `porumb` family: PORUMB (108) and the four PORUMB-HIBRID/SOI rows (115–118). PORUMB ZAHARAT, PORUMB SILOZ, PORUMB FURAJER are separate rows.
- `floarea-soarelui` family: the four FLOAREA SOARELUI-HIBRID/SOI rows; same for `soia`, `sorg`, `orz` (ORZ / ORZ de bere), `orzoaica`, `rapita`.

Codes above are the ones already confirmed in `crops-reference.json`; every other code→name pair is read off the PDF pages, not the text extraction (the columns come out misaligned in `pdftotext`).

**Existing data:** keep the id `grau` for **GRÂU COMUN de toamnă** (what Ion and every stored farm means); the other three wheats get new ids (`grau-comun-primavara`, `grau-dur-toamna`, `grau-dur-primavara`). Same for `porumb` → plain PORUMB (108) and `floarea-soarelui` → the timpuriu row, or a family-level row: see open decision 4. No data migration; `demo-ion.json`, `county_history` and `nitrogen-limits.json` key on `family`, so they keep working.

INS AGR110A has one series per family (one for wheat, not per season or maturity): all rows of a family share it (`yield_basis` notes that).
- Diversification (PD-04 `distinct_crops`): whether autumn and spring wheat count as two crops is `DE-VERIFICAT` → entry in `11-open-questions.md`; add `diversification_key` to the crop if the answer is "same crop".

## Steps

1. **Extract the list.** Transcribe MO 193 bis/12.III.2026, Anexa 1, Tabel 1 (p. 186–223, about 220 rows) into `docs/data/apia-crop-codes.json` (code, genul botanic, name exactly as printed, section heading, qualifier, page). Read the code column off the page images, not the text extraction. This is the source of truth for "all crops". Test: every code is owned by exactly one catalogue crop or listed in an explicit `excluded` array with a reason (e.g. non-agricultural codes).
2. **Schema + helpers** as above, with tests. Existing 4 crops migrated in the JSON; all current tests green.
3. **Catalogue rows.** One row per APIA crop name, with `name_apia`, `apia_qualifier` and `family` (see above). Sowing/harvest months from the agricultural calendar with `months_status: DE-VERIFICAT` like today. Aliases written by hand (with and without diacritics, regional names: orzoaică, rapiță, sfeclă, lucernă…).
4. **Economics for the first priced set**, each with a source URL: grâu de toamnă, grâu de primăvară, porumb, floarea-soarelui, rapiță de toamnă, orz de toamnă, orzoaică (toamnă/primăvară), soia, ovăz, triticale, secară, orez, mazăre. Sources to try: ICDA Fundulea / ASAS fișe tehnologice (cost), INS AGR110A (yield, add the new crops to `county_history`), INS prețuri medii de vânzare / MADR rapoarte de piață (price). Anything not found → stays unpriced, entry in `11-open-questions.md`.
5. **Engine.** Route all figure reads through `pricedCrop`; unpriced crops on a farm with no own figures produce a plan warning ("Scrie cât te costă orzul ca să-l punem în plan"), never a 0 lei crop. Perennials/pastures: count for subsidies and area, no yearly sowing; excluded from the plan until priced.
6. **Nitrogen.** Map each crop to its column in art. 9 alin. (2) (`Grâu și rapiță` / `Porumb` / `Alte culturi`…); drop the "id doesn't exist yet" notes in `nitrogen-limits.json`.
7. **APIA reading.** `documents/index.ts` and `plots/reading.ts` already map codes via `apia_codes` → they pick up all crops for free. Remove the "we left these codes out" note in `meta.apia_codes_note`. The Claude document prompt (`apps/api/src/ai/documents.ts:12`) lists ids: keep it to codes + common crops so the prompt doesn't balloon.
8. **UI** (Romanian, with diacritics):
   - Onboarding: replace one-field-per-crop with "Ce culturi ai?" → `common` crops as chips + a search box (diacritic-insensitive, matches aliases and APIA codes) grouped by `apia_section`; a hectare field appears for each picked crop. Typing „grâu” shows all four wheats with their APIA qualifier, never one guessed for the farmer. Unpriced pick → the own-numbers form inline.
   - Every crop name in the app (Recolte, plan, calendar, assistant cards) is `name_ro`, so the qualifier always shows: „Grâu comun de toamnă”, not „Grâu”.
   - Subvenții simulator: chips only for the farm's crops + "Adaugă o cultură" (same search).
   - Recolte / Prognoză / DatePlan: show unpriced crops with the "scrie cifrele tale" prompt instead of hiding them.
   - Skeletons unchanged (no new screen).
9. ✅ **Assistant.** `withCropId` (`apps/api/src/ai/assistant.ts:187`) matches names + aliases; "grâu" alone on a farm with both wheats → ask which one, not guess.
   Built (2026-11-15): an id or full name wins. An alias stands for its family (`family ?? id`): on a farm with one crop of that family it becomes that crop (e.g. a farm with only spring wheat), with two or more the tool result lists them as `id = name` and tells the model to ask, so no card is made. Without the farm, or with none of the family on it, the usual crop as before. The route passes `farmCropIds` (parcels + harvest years, `routes/assistant.ts`). Tests in `apps/api/src/assistant.test.ts` (5).
10. ✅ **Opportunities.** Check `sector.crops` regexes in `opportunities/index.ts:181` against the new ids (legume, pomi, vită de vie, orez…).
   Built (2026-11-15): the ids no longer carry words (`apia-961`), so the old regexes on `crop_id` matched nothing. Now each crop gets a sector from its APIA line (`apiaSector`: the heading — legume/cartofi, pomi/nuci/arbuști/kiwi, vii — and, inside mixed headings, the name: medicinal and aromatic plants, flowers and ornamentals, fruit/vine nurseries, land being prepared for orchards or vines). The line comes from the crop (`apia_codes`), an `apia-<code>` id, or an own crop’s `apiaCode` (`MatchFarm.ownCrops`, or `harvests.ownCrops` on a stored farm; Acasă and Oportunități pass them). An own crop without a line still matches by name. Grain, oilseeds and „leguminoase pentru boabe” are in no sector. Tests: `opportunities.test.ts` (+5).
11. ✅ **Own crops.** An `own-*` crop whose name now matches a catalogue crop: offer once to switch it (keeps the farmer's figures). No automatic rewrite of stored data.
   Built (2026-11-15): „switch” = link, not a new id: the own crop keeps its id, figures and history, and takes the line’s `apiaCode` and APIA name (`linkOwnCrop`), the way the own-crop form saves a crop started from the list. `ownCropMatches` (`farm/own-match.ts`) offers the lines named exactly that, else the ones it starts („Ovăz” → de toamnă, de primăvară), else the ones with every word („Grâu de primăvară”); at most 4, mixtures and energy crops dropped first, lines already on the farm left out. Recolte (Toată ferma, open harvest) shows one crop at a time; „Nu”/„Niciuna” is remembered on the phone (`cropcash-own-match-seen`), so a second phone may ask again. Saving goes through the harvests save. Tests: `farm/own-match.test.ts` (6), `web/components/pages/own-match.test.tsx` (3).
12. ✅ **Mobile (`mobile/`)**: check it reads the same `docs/data` bundle; same picker change.
   Checked (2026-11-15): nothing to change. `mobile/` is a WebView on the live site (`docs/14-mobile-expo.md`, option A), with no data or screens of its own, so it gets the catalogue, the search and every picker from `web/`. The APIA list is bundled into one JS chunk (`data/files.ts` imports `apia-crop-codes.json`), and `sw.js` lists that chunk, so the picker works offline in the app as on the phone’s browser (checked on today’s build: chunk `3_9cxy4m8hhdq.js`, in `web/out/sw.js`). The app shows it once the catalogue work is deployed to Netlify. A fresh `npm run build:web` ran out of memory while generating pages (23 workers) on this machine on 2026-11-15; it compiled, and the morning’s build had succeeded.

## Offline

All catalogue data is in the bundled JSON, so picking, searching and the plan work without net. Nothing here moves money.

## Out of scope (for now)

- Sprijin cuplat per crop (soia, orez, cartof, sfeclă, legume…): separate subsidies change once the catalogue exists.
- Varieties/hybrids, seed catalogues.
- A Supabase `crops` table. Only worth it if editors should add crops without a deploy (like `fertilizer_products`); then seed it from the JSON and keep the JSON as the offline copy.

## Open decisions

1. **Scope of the first release:** all APIA codes (incl. legume, pomi, vie, pajiști) or only arable field crops first? Recommended: list **all** codes in the catalogue (step 1–3 are cheap), price only field crops.
2. **Unpriced crops:** ask the farmer for figures (recommended) vs. hide them from the plan.
3. **`grau` id:** keep as GRÂU COMUN de toamnă (recommended) vs. rename ids and migrate stored rows.
4. **Plain „Porumb” and „Floarea-soarelui” on existing farms:** map `porumb` to APIA's plain PORUMB (108) and ask the farmer once for the hybrid group (recommended), or leave them as they are until the farmer edits the farm.
