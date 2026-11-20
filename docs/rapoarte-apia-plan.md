# Plan: "Pentru instituții" becomes "what this farm files with APIA", filled in

Status: **phases 1, 2 and 3 built (2026-11-20).** Written 2026-11-20. Decisions marked **Q?** are in §8.

**What phase 3 shipped, and where it differs from the plan below:**
- Animals (autofill A6): not the four columns A6 proposed, but **`farmers.livestock jsonb`** (migration **053**, not applied
  yet): heads per category of the cerere's field 47 (`docs/data/livestock.json`, with the UVM coefficient and the diesel
  group of each), the ANSVSA code, the dairy cows and the hay of a campaign. `dairy_cows` / `beef_cattle` (001) are left
  alone, so the subsidy figures don't move; they aren't synced from it. Ear tags and grazing days aren't kept: their rows
  print blank. Written by `PUT /api/farmers/me/livestock` (`set_livestock`, internet only); on Ion's farm on the phone.
- The card „Animalele fermei” shows on „Pentru APIA” once the farmer says „Da” to „Ai animale în fermă?” or has animals
  noted. Heads > 0 make the animals fact true; a saved empty herd makes it false.
- Reports in `web/lib/reports/animals.ts`: `apia-livestock` (field 47, heads and UVM), `apia-hay` (Anexa 26: grassland,
  UVM/ha against `hay_below_uvm_per_ha` 0,3, the hay noted), `apia-animal-decont` (**one** report for PD-07 Anexa 16¹ and
  PD-27 Anexa 19¹, since they're one paper in `apia-papers.json`; the plan had `apia-pd07` and `apia-pd27`),
  `apia-active-farmer` (from 2027: arable parcels with their sowing, and the seed, fertilizer and treatment invoices).
  `apia-fuel-prior` gets **Anexa 3** (UVM × `caps_l_per_uvm`, bees per family) when animals are noted.
- New paper `fermier-activ` (deadline 31 Aug 2027, `DE-VERIFICAT`). `cerere-zootehnie`, `pajisti-fan` and `animale-decont`
  now have their reports.
- Hay is one number per campaign, typed on the animals card (shown only for farms with permanent grassland), not per parcel.
- Open questions #35 (UVM coefficients), #36 (who files the active-farmer proof), #37 (Anexa 16¹ / 19¹ columns).

**What phase 2 shipped, and where it differs from the plan below:**
- Migration **051** (`051_apia_facts_treatments.sql`, not 050, which was taken): `farmers.apia_facts jsonb` and
  `plot_operations.target` / `operator`. **Not applied yet** (`npm run db:migrate`). Until it is, saving answers or a
  treatment's target/operator on a real account fails at the database.
- The answers are farm-level (`farmers.apia_facts`: animals, fuel, organic, `coupledCrops`), not season columns. Season
  columns would have meant rewriting the `save_plots` RPC. Written by `PUT /api/farmers/me/apia-facts` (`set_apia_facts`),
  needing internet (not queued). On Ion's farm they stay on the phone (`cropcash-demo-apia-facts`). The „maybe” cards ask
  „Ai animale în fermă?” and the like (Da / Nu; for coupled support „Da, pentru soia”). „Întreabă-mă din nou” clears them.
  Diesel noted on the farm still wins over a „Nu”.
- The treatment form (Recolte, „Adaugă cheltuială aici”) asks „Împotriva a ce” and „Cine l-a dat”. The phyto register
  prints them and lists only the treatments that lack them.
- New reports in `web/lib/reports/apia-more.ts`: `apia-coupled` (from `docs/data/apia-coupled.json`: PD-09 soia, PD-10
  lucernă, PD-16 sfeclă, PD-26 porumb siloz, PD-17 legume; harvested and sold per ha against the minimum, sales and seed
  invoices), `apia-eco-pd04` (diversification from `subsidies-2026.json` PD-04 rules, parcels with sowing, soil work,
  harvest), `fertilizer-register` (N limits from `nitrogen-limits.json` + the fertilizing work done on the map),
  `apia-notice` (a text box on the card, „Ce s-a întâmplat”, never saved), `apia-checklist` (the „next” and „maybe” papers
  with their documents, to tick on paper). Linked from `apia-papers.json` and, for the two registers, from `calendar-2026.json`.
- **`apia-change` is not built.** The filed cerere rows aren't on the phone, so a change form would only repeat the surface
  sheet. The notice covers force majeure. Q: load the cerere rows to the client first.
- Fertilizer quantities on expenses (`fertilizer_product_id` / `fertilizer_qty`) don't reach the web client, so the register
  reads the map's fertilizing work (product, dose) only, not the kg of N.
- „Vândut sau folosit” for coupled support is harvested minus stored, from Recolte's `gathered` (the farm's latest harvest,
  not per year). APIA judges the invoices, and the PDF says so.
- `/de-raportat` already had „Descarcă PDF” (`ReportSheet`, from the parallel work). The diesel events still open `fuel-excise`.
- Open questions #33 (coupled minimums and deadlines) and #34 (PD-04 over 30 ha). Phase 1's rows were renumbered to #31 and #32.

**What phase 1 shipped, and where it differs from the plan below:**
- `docs/data/apia-papers.json` (16 papers, out side only) + `ApiaPapersFileSchema`, `apiaFacts`, `apiaFilings` in
  `packages/shared/src/reports/apia.ts`. A paper takes its deadline from calendar events (`deadline_events`) or, for papers
  only some farms file (coupled proofs, hay, organic, PD-07/27), its own `deadline`, so they don't land on everyone's calendar.
- Sections are `next`, `keep`, `when` (the „within N days” rules), `maybe` (unknown facts), `past`, `not_applicable`.
  There's no `next_campaign` section: the next cerere is simply `next`, with an estimated date. Unknown facts aren't asked
  on the card yet (that needs `farmers.apia_facts`, phase 2). The card says „Doar dacă ai animale…” instead.
- Reports `apia-surface`, `apia-fuel-claim` (Anexa 9), `apia-fuel-prior` (Anexa 2) in `web/lib/reports/apia.ts`. The
  phyto register got blank „Motivul” and „Cine a aplicat” columns. `ReportModel.missing` + `signature`. `pdf.tsx` prints
  „De completat de mână” and the signature lines. The card (`ReportCard … gaps`) lists the same gaps, with links.
- APIA crop codes come from the season's `apia_crop_code`, else from the crop's catalogue line, so farms with no cerere
  read still get codes.
- The tab is called **„Pentru APIA”** (Q3). „Pentru APIA și primărie” pushed „Pentru mine” off the chip row at 390 px.
- Calendar: added `geofoto-primavara` (obligation, fallow) and `apia-retragere` (30 Sep, **not** an obligation, so
  „De raportat” doesn't grow). The diesel events still point at `fuel-excise` in „De raportat”.
- Q4: the PDFs keep „Nu este un document oficial”. Q5: the Anexa 2 card stays, since the acord deadline (21 Dec 2026) is
  still ahead, and it notes that the scheme ends on 31.12.2026.
- **Ion's demo data was not extended** (§5). Adding diesel invoices to his harvest would change his ledger, salary plan and
  „De raportat” figures. So on his farm the diesel papers show under „Poate ți se aplică”, with an empty Anexa 9.
Builds on `docs/rapoarte-pdf-plan.md` (report engine, phases 1–3 done), `docs/apia-documents-autofill-plan.md`
(the papers coming **in**: §1 is the legal research, §4b the `apia-papers.json` catalogue) and `docs/04-farmer-reports.md`.
This plan covers the papers going **out**: for each filing APIA asks of *this* farmer, a PDF the app fills from the farm.

---

## 0. Where we are

**The tab today** (`web/components/pages/Rapoarte.tsx`, `REPORTS` in `web/lib/reports/build.ts`): the "Pentru instituții"
tab shows two generic reports, the same for every farm:

| Report | Data | What's missing for APIA |
|---|---|---|
| `phyto-register` Registrul tratamentelor | `plot_operations` (herbicide/fungicide/insecticide) | the columns the official SMR 8 register asks for (pest, operator, waiting time). The PDF itself says "verifică ce alte rubrici cere modelul oficial" |
| `land-summary` Terenul și culturile | `plots` + `plot_seasons`, else harvest parcels | it is not the cerere layout: no SIRUTA, no APIA crop code, no schemes, no land-use category per row |

The tab doesn't know what the farm has to file. It shows no deadlines and doesn't say which data is missing. The fuel report
(`fuel-excise`) is the closest to an APIA filing, but it sits under farmer/accountant and is a summary, not Anexa 9.

**What the data files hold** (`docs/data/`):

| File | Useful for APIA filings | Gaps |
|---|---|---|
| `calendar-2026.json` (20 events) | cerere window 16 Mar–5 Jun, diesel acord + Q1–Q4 claims (`report: 'fuel-excise'` already links an event to a report), GeoFoto autumn, registrul agricol, DR-06/PD-07/08 decont, forță majoră, transfer, schimbi cultura | `documents_ro` is empty on every APIA event. Missing: changes/withdrawals until **30 Sep**, hay proof **15 Oct** (Anexa 26), coupled-support proofs **31 Mar 2027**, organic certificate **15 Oct**, PD-28 GeoFoto spring window (by 5 Jun) |
| `fuel-excise.json` | rates by invoice date, quarters and deadlines, `claim_documents_ro`, `caps_l_per_ha[20]`, `caps_l_per_uvm[5]`, `scheme_end` 31.12.2026 | — (enough for Anexa 2, 3 and 9) |
| `apia-crop-codes.json` (365 rows: code, genus, name, section, heading) | crop code + name for each declaration row | no link from a code to the coupled scheme (PD-09…PD-20, PD-26) or to its minimum (1.500 kg/ha soy, 33 t/ha beet…) |
| `subsidies-2026.json` (8 schemes) | BISS, CRISS, young farmer, 3 eco-schemes, 2 coupled livestock | no coupled crop schemes, so the app can't tell which proofs a crop triggers |
| `nitrogen-limits.json`, `fertilizers.json` | N caps per crop, products | enough for a fertilisation plan + register |
| `siruta-tr-ct.json`, `lpis.json` | SIRUTA (TR, CT only), LPIS blocks | SIRUTA only for 2 counties |
| `demo-ion.json` | parcels, plot work, contracts | no animals, no fuel invoices with numbers |

**What the database holds** (read-only check on 2026-11-20, service key from `.env`):

| Table | Rows | Note |
|---|---|---|
| `farmers` | 5 | `legal_form` null on all 5; 2 have `harvests` |
| `plots` / `plot_seasons` | 12 / 12 | **0 seasons with `apia_crop_code`** |
| `parcels` (old) | 10 | |
| `transactions` | 4 | 3 × `expense/fuel` (columns `doc_no`, `counterparty`, `fuel_liters_cl` exist, from migration 027) |
| `plot_operations`, `fuel_logs`, `farm_documents`, `cerere_fields`, `cerere_rows`, `document_proposals`, `subsidy_decisions`, `lease_contracts`, `contracts`, `employees`, `invoices` | **0** | |
| `fertilizer_products` | 68 | reference data |

The schema is ready for most of this (`cerere_rows` mirrors II.A; `plot_seasons` has `apia_crop_code`, `second_crop_id`, `quantity_kg`;
transactions carry invoice number, supplier and litres). Real farms barely use it yet, so **every filing must say what's missing
and where to add it**, and Ion's farm must show the full version.

**Not in the schema at all:** animals (the `livestock` proposal target exists, its table was postponed, autofill plan A6),
irrigation, organic status, young-farmer status, seed lot / certified seed, hay, GeoFoto photos, nitrate-zone flag.

---

## 1. What APIA asks of a farmer in 2026

Merged from the background research (2026-11-20, Ord. MADR 67/2026, Ord. 44/2026, HG 1174/2014 as amended by HG 61/2025, APIA's
2026 training deck) and `apia-documents-autofill-plan.md` §1 (2026-11-18, which also read Anexa 1–2 and the Ghid PD/ANT).
**Fill** says what the app can produce: **F** = the whole content filled from the farm, the farmer checks and signs.
**P** = partly filled, the farmer completes a few blanks. **C** = checklist only (a paper the farmer gets elsewhere).

| # | Filing | Who | 2026 deadline | Channel | Fill | Data it needs |
|---|---|---|---|---|---|---|
| A1 | **Cererea unică de plată 2026, II.A Declarația de suprafață** (Ord. 67/2026 Anexa 1) | everyone with direct payments, eco-schemes, ANT, coupled support, DR-01/02/04/05/09 | 16 Mar–5 Jun, no late filing, signed by 5 Jun | AGI-Online (we can't file) | **F** as a **preparation sheet**: the rows in the form's order, ready to copy in AGI-Online | per parcel: județ, localitate + SIRUTA, bloc fizic, nr. parcelă, categorie folosință, cod + nume cultură, ha, schemes, secondary crop; totals for fields 44/45 |
| A2 | **III. Declarația privind sectorul zootehnic** + field 47 | farms with animals (PD-21…25, ANTZ 7–9, PD-07/08/27, DR-03) | same window, **at the APIA centre first**, before digitising | APIA centre | **P** (needs animals) | ANSVSA code, heads per category, ear tags |
| A3 | **M1–M4**: change / complete / withdraw the declaration | anyone whose land changed after filing | changes without adding area and withdrawals: **until 30 Sep** | AGI-Online / centre | **F**: the diff between the filed cerere and the seasons on the map | `cerere_rows` (filed) vs. `plot_seasons` (today) |
| A4 | **Notificare forță majoră / circumstanțe excepționale** | anyone hit by an event | 15 working days (unverified) | centre | **P**: farm + affected parcels and crops filled, the farmer writes what happened | parcels, crops, ha, date of event |
| A5 | **Notificare modificări** (data changed) | anyone | 15 calendar days | centre | **P** | as A4 |
| A6 | **Diesel, Cerere de acord prealabil** Anexa 1a/1b + **Anexa 2** areas and normed litres + Anexa 3 UVM + Anexa 4 irrigation | diesel users | by 20 Dec for next year. **Scheme ends 31.12.2026, no 2027 window announced** | county centre, paper | **F** (Anexa 2 from seasons × `caps_l_per_ha`), Anexa 3 needs animals | ha per crop group, UVM |
| A7 | **Diesel, Anexa 7 Cerere de plată + Anexa 9 Situația centralizatoare** + invoices + SPV extracts | holders of the acord | end of the month after each quarter: Q3 → 31 Oct, **Q4 → 31 Jan 2027** | county centre | **F**: one row per invoice | supplier, invoice no., date, litres invoiced, litres used (fuel expenses: `counterparty`, `doc_no`, `fuel_liters_cl`) |
| A8 | **Dovada producției / valorificării, coupled crops** (PD-09 soy ≥1.500 kg/ha, PD-10 alfalfa, PD-16 beet ≥33 t/ha + factory contract by 1 Oct, PD-17/18 vegetables, PD-26 silage maize ≥18 t/ha) + certified-seed proof | farms that declared those crops under coupled support | **31 Mar 2027** for campaign 2026 (verified for beet and seedlings, rest unverified) | centre | **P**: kg/ha vs. the minimum, list of sale invoices and seed invoices, what's still short | crop, ha, harvested kg (`plot_seasons.quantity_kg`), sales with kg, seed invoices + lot |
| A9 | **Anexa 26: hay stored / sold** | permanent-grassland users below 0.3 UVM/ha | **15 Oct** (mowing 15 Jun–1 Oct) | centre | **P** | PP ha, hay t, sale/storage papers |
| A10 | **Caiet / evidența PD-04** (eco-scheme arable: diversification, green cover 1–15 Oct, tillage) | PD-04/05/06/28 | kept all year, shown at controls | on the farm | **F** from seasons + operations | crops per parcel, sowing/harvest dates, soil work, cover crop |
| A11 | **Registrul tratamentelor fitosanitare** (SMR 8) | everyone who sprays | kept 3 years, shown at controls | on the farm | **F** (exists, needs the official columns) | operations: product, dose, pest, operator, date, area |
| A12 | **Plan de fertilizare + registrul fertilizării** (SMR 2, nitrates) | farms in nitrate-vulnerable zones (unverified whether that's all of Romania) | kept, shown at controls | on the farm | **F** from `nitrogen-limits.json` + fertilizing operations | crop, ha, product, N kg/ha, date |
| A13 | **Decont PD-07** + Anexa 16¹ (cows by ear tag), **PD-27** caiet de pășunat Anexa 19 + 19¹ | PD-07 / PD-27 applicants | January 2027 | centre | **P** (needs animals) | herd by ear tag, grazing days |
| A14 | **GeoFoto** photos (PD-28 by 5 Jun and 1 Sep–30 Nov, PD-05 by 30 Nov) | uncultivated land / PD-05 | as listed | GeoFoto app | **C** + the list of parcels that need a photo | parcels declared fallow / PD-28 |
| A15 | **Papers that go with the cerere**: adeverința registrului agricol, contracts with UAT/ADS, IBAN, ID, ANAF certificate for the active farmer (> €5.000 direct payments the year before, farms > 50 ha), water rights (ANAR / OUAI) for irrigation, organic certificate by 15 Oct, breed-registry certificate, vet certificate, milk sales (PD-21) | as listed | with the cerere | centre | **C**, status from `farm_documents` (once the autofill catalogue lands) | — |
| A16 | Ad-hoc state aid (drought, beekeeping by 31 Jul, DR-06, Tomata) | per programme | per programme | centre | out of scope (feed from `opportunities`) | — |

**Also new in 2026** (from the research): no late filing; signing by 5 Jun (2025 allowed until 30 Sep); animals declared at the
centre before the parcels; uncleared weeds make a parcel ineligible at a check. **Announced for 2027:** arable farms prove they're
active with input invoices and sowing papers by 31 Aug 2027 (Ord. 44/2026 art. 25¹). That's a filing the app can almost entirely
fill from expenses + operations, so it goes in phase 3.

**Contradictions to settle before writing texts** (both into `11-open-questions.md`):
- Leases. The research says private lease contracts must stay valid **until 1 Dec 2026** and can be e-mailed to the centre. The
  autofill plan read Anexa 2 and found that only UAT/ADS contracts are attached, private leases reach APIA through the registrul agricol,
  and the 1 Dec rule isn't in the 2026 texts. **Q1.**
- Force majeure deadline: 15 working days (autofill plan, calendar) vs. "unverified" (research). **Q2.**

---

## 2. What the farmer sees

The tab **"Pentru instituții"** becomes **"Pentru APIA și primărie"** (Q3), and its content is computed for the farm and the campaign:

```
Pentru APIA și primărie                     Campania 2026 ▾

Urmează
┌ Motorina, trimestrul IV ─────────── până pe 31 ian. 2027 · în 72 de zile ┐
│ Cererea de plată și situația centralizatoare (Anexa 9).                  │
│ 14 facturi · 2.140 l · ≈ 5.771 lei de primit                             │
│ [Descarcă PDF]                                                            │
└──────────────────────────────────────────────────────────────────────────┘
┌ Dovada pentru soia (sprijin cuplat) ────────────── până pe 31 mar. 2027 ┐
│ Ai vândut 1.320 kg/ha. Îți trebuie cel puțin 1.500 kg/ha.               │
│ Lipsește: facturile pentru 2,1 t. [Adaugă o vânzare]                     │
│ [Descarcă PDF]                                                            │
└──────────────────────────────────────────────────────────────────────────┘

Ține la fermă (le cere APIA la control)
  Registrul tratamentelor · Planul și registrul de fertilizare · Caietul eco-schemei

Pentru cererea din 2027 (se deschide în martie)
  Fișa pentru declarația de suprafață · Hârtiile de adus la APIA (checklist)

Trecute în 2026 (3)          Nu ți se aplică (5) ▸
```

- **Sections**: *Urmează* (deadline ahead, sorted by date), *Ține la fermă* (no deadline, control papers), *Pentru cererea din…*
  (the next campaign's window), *Trecute* (collapsed, still downloadable), *Nu ți se aplică* (collapsed, with "Ba da, mi se aplică").
- **Every card says what's missing**, in the farmer's words, with a link to the screen that fixes it ("3 parcele fără bloc fizic →
  Harta", "2 facturi de motorină fără litri → Recolte"). The PDF can still be made. Missing cells print as an empty box to fill in by hand,
  and the first page lists them.
- **Watermark** on drafts of forms filed elsewhere (A1, A3, A6): "CIORNĂ: copiază în AGI-Online, nu depune foaia asta" (Q4).
  Registers (A10–A12) and Anexa 9 carry no watermark: the farmer can sign and file or keep them.
- `/de-raportat` and this tab read **the same list** (§3.2), so a deadline card there gets "Descarcă PDF" and a card here gets the deadline.
- On Ion's farm everything applies and is full (§5), so the demo shows the finished state. A tester can flip one fact (no animals) to see
  "Nu ți se aplică".
- The **"Pentru mine"** and **"Pentru contabil"** tabs stay as they are. `fuel-excise` stays there as the farmer's summary, and the
  official Anexa 9 is a new report in this tab.

---

## 3. How it works

### 3.1 One catalogue, two directions

`docs/data/apia-papers.json` (autofill plan §4b.2) is the single list of APIA papers. This plan adds the **out** side to the same entries
instead of making a second file:

```jsonc
{
  "id": "fuel_claim",
  "kinds": ["fuel_quarter_request"],        // in: what an uploaded paper counts as (autofill plan)
  "fills": "apia-fuel-claim",                // out: the ReportId that produces it, or null for checklist-only (A14, A15)
  "audience": "apia",                        // apia | primarie | control (kept on the farm)
  "deadline_event": "acciza-cerere-t{q}",    // calendar-2026.json id; {q} for repeating ones
  "repeat": "quarter",                       // null | quarter | year
  "applies_if": ["fuel_scheme"],             // facts from §3.2, ANDed. Empty = everyone
  "documents_ro": ["Facturile pe numele fermei, cu CIF", "Extrasul din SPV"],  // "what to bring" line on the card
  "status": "confirmat-2026", "source": "HG 1174/2014 art. 8; OMADR 1727/2015 Anexa 7, 9"
}
```

- Zod schema in `packages/shared/src/data/schemas.ts`. Tests: every `fills` is a `ReportId`, every `deadline_event` exists in the calendar.
- If the autofill plan hasn't shipped step 6b yet, this plan creates the file with only the fields above, and 6b adds the `in` fields later.

### 3.2 Which filings apply: `farmFacts` + `apiaFilings`

New `packages/shared/src/reports/apia/` (pure, tested):

- `farmFacts(state, plots, year)` → `{ arable, grassland, permanentCrops, animals: Head[] | null, coupledCrops: string[], fuelScheme,
  ecoArable, fallowOrPd28, irrigates, organic, youngFarmer, legalForm, areaHa, nitrateZone }`.
  Each fact is `true | false | null` (`null` = unknown). **Unknown is shown, not hidden** (same rule as autofill §4b.3), with a
  one-tap question on the card ("Ai animale?") that saves the fact.
  - `coupledCrops`: from the seasons' `apia_crop_code`/`crop_id` × the new crop→scheme map (§4, data).
  - `fuelScheme`: a fuel expense with litres in the year, a diesel paper uploaded, or the farmer said so.
  - `ecoArable`: arable ≥ 10 ha (PD-04 entry rule, DE-VERIFICAT) or the cerere ticked PD-04.
- `apiaFilings(catalogue, facts, calendar, campaign, today)` → `Filing[]` with `{ paperId, reportId, period?, deadline, daysLeft,
  section: 'next' | 'keep' | 'next_campaign' | 'past' | 'not_applicable', unknownFacts }`. It expands `repeat` into one item per
  quarter, reusing `farmObligations` (`packages/shared/src/obligations`) for the dates, so `/de-raportat` and this tab can't disagree.

### 3.3 Each filing: input → readiness → model

Each filing gets three pure functions in `web/lib/reports/apia/<id>.ts`, next to the existing builders (`build.ts` is 577 lines,
so new reports go in their own files and `REPORTS` imports them):

```ts
input(state, view, plots, period): XInput          // like inputs.ts makeReport does today
missing(input): Missing[]                          // { what: '3 parcele fără bloc fizic', fix: { screen: 'harta', … } }
build(ctx, input, period): ReportModel              // like the existing builders
```

- `ReportDef` gets `audiences: [..., 'institution']` unchanged, plus `paperId` (link to the catalogue). The tab lists
  `apiaFilings(...)` instead of `REPORTS.filter(audience)`.
- `ReportModel` gets two small additions: `missing: string[]` (printed first, as "De completat de mână") and a `signature` block
  (name, date, "Semnătura") for papers that get signed. `Section` gets an optional `blank: true` cell flag, so `pdf.tsx` draws a box.
- `NEEDS_PLOTS` becomes a field on `ReportDef` (`needsPlots: true`), since most new reports read the map.

### 3.4 The reports, one by one

| ReportId | Filing | Built from | Checks (`missing`) | Phase |
|---|---|---|---|---|
| `apia-surface-sheet` | A1 fișa pentru declarația de suprafață | `plot_seasons` × `plots` for the campaign; when a cerere was uploaded for the **previous** year, its rows as the base, plus what changed | rows without bloc fizic / SIRUTA / crop code / land use; parcels < 0,1 ha (may be left out if ≤ 1 ha in total); total ≠ field 44; crop changed vs. last year (GAEC 7 rotation hint) | 1 |
| `apia-fuel-claim` | A7 Anexa 7 + Anexa 9, per quarter | fuel expenses in the quarter by **invoice date**: `counterparty`, `doc_no`, date, `fuel_liters_cl`; rate by date from `fuel-excise.json` | invoice without number / supplier / litres; litres over the acord's yearly total (when D6 is known); invoice not on e-Factura (unknown → a reminder to bring the SPV extract) | 1 |
| `apia-fuel-prior` | A6 Anexa 2 (+ Anexa 3 once animals exist) | next year's seasons, else this year's, × `caps_l_per_ha` group | crops without a norm group. **Hidden while `scheme_end` has passed and no new window is known** (Q5) | 1 |
| `phyto-register` (upgraded) | A11 | as today, plus columns: pest/reason, operator, waiting time, area treated | the existing operations have no pest/operator, so those cells print blank until §4 adds them | 1 |
| `apia-change` | A3 M1/M3 | filed `cerere_rows` vs. current `plot_seasons`: rows changed, added (needs M2, only until 5 Jun), removed (M3) | no filed cerere uploaded → card says "Pune cererea depusă ca să vedem ce s-a schimbat" | 2 |
| `apia-coupled-proof` | A8, one card per coupled crop | seasons of that crop, `quantity_kg`, sales with kg (invoice lines `quantity_milli`, transactions), seed expenses | kg/ha under the minimum; no seed invoice; beet without factory contract by 1 Oct | 2 |
| `apia-eco-pd04` | A10 | seasons + operations: diversification (crops and shares), cover 1–15 Oct (second crop / no harvest yet), tillage operations | arable ≥ 10 ha with < 2 crops; no autumn cover noted | 2 |
| `fertilizer-register` | A12 | `nitrogen-limits.json` × seasons for the plan, `fertilizing` operations × `fertilizer_products` for the register | N over the cap; product not in the catalogue (no N content) | 2 |
| `apia-notice` | A4 / A5 | farm, selected parcels and crops, date. The farmer types the event in the card (one text field, not stored) | — | 2 |
| `apia-papers-checklist` | A14 + A15 | catalogue entries with `fills: null` that apply, status from `farm_documents` | — (it *is* the list of what's missing) | 2 |
| `apia-hay` | A9 | PP ha, hay quantity (new field), UVM | below 0.3 UVM/ha with no hay noted | 3 |
| `apia-livestock` | A2 field 47 + III | animals table | — | 3 (needs animals) |
| `apia-pd07`, `apia-pd27` | A13 | animals + events | — | 3 |
| `apia-active-farmer-2027` | art. 25¹ (from campaign 2027) | input expenses + sowing operations per parcel | parcel with no sowing paper | 3 |

`land-summary` stays, moved to the **primărie** group (it's the registrul agricol summary, not an APIA filing).

---

## 4. Data to add

**Data files (`docs/data/`):**
- `apia-papers.json`: new, §3.1. One entry per row of §1 (16 + the active-farmer one), each with source and status.
- `apia-coupled.json`: new. Scheme (PD-09…PD-20, PD-26) → crop codes, minimum (kg/ha or t/ha), proof deadline, what counts as proof,
  `status`. Fills the gap in `subsidies-2026.json`, which has no coupled crop schemes (Q6: or extend `subsidies-2026.json` instead).
- `calendar-2026.json`: add the events from §0 (30 Sep changes, 15 Oct hay, 15 Oct organic, 31 Mar 2027 coupled proofs, PD-28 spring
  photos), and fill `documents_ro` on the APIA events. Each new event with `obligation: true` and `report: <ReportId>`.
- `fuel-excise.json`: no change. Anexa 9 column names go in the builder, as the official labels (from OMADR 1727/2015).

**Database (one migration, `050_apia_filings.sql`):**
- `plot_operations`: `target text` (pest/weed/disease), `operator text`, `area_ari int` (treated area, if not the whole parcel),
  `waiting_days int`. Feeds A11, A12.
- `plot_seasons`: `irrigated boolean`, `organic text check in ('conversion','certified')`, `certified_seed boolean`, `seed_lot text`.
  Feeds A1, A6 Anexa 4, A8, A15.
- `farmers`: `apia_facts jsonb`, the answers to the "Ai animale? / Ești în schema de motorină? / Irigi?" questions, so a `null` fact is
  asked once. Shape checked like `apia_decision`.
- `transactions`: nothing new for diesel. Sales kg come from `invoice_lines.quantity_milli` (e-Factura) or a new optional
  `quantity_kg` on `kind = 'sale'` (Q7).
- **Animals**: not in this migration. Phase 3 waits for the livestock table decided in the autofill plan (A6). Until then A2/A13 show as
  checklist cards with "Încă nu ținem evidența animalelor".

**Offline:** the new fields travel in the farm copy on the phone like the existing ones (`readFarmState`), so every report still works
offline and on Ion's farm (`rapoarte-pdf-plan.md` §3).

---

## 5. Ion's farm

`demo-ion.json` gets, all marked as demo: APIA codes on his seasons, bloc fizic/SIRUTA (TR), 12 diesel invoices over Q1–Q4 2026 with
supplier, number and litres, sprays with pest and operator, fertilising with products, a filed 2026 cerere (so `apia-change` has a diff:
one parcel switched from maize to sunflower in May), soy on 3 ha with 1.320 kg/ha sold (the "under the minimum" card), and 4 cows
(phase 3). With that, every card in §2 shows on the demo, in each state.

---

## 6. Phases

| Phase | What | Where | Done when |
|---|---|---|---|
| **1** | `apia-papers.json` (out side) + schema; `farmFacts`, `apiaFilings`; the new tab layout; `apia-surface-sheet`, `apia-fuel-claim`, `apia-fuel-prior`, upgraded `phyto-register`; `missing` + blank cells + signature in `pdf.tsx`; calendar events; Ion's demo data for these | `docs/data`, `packages/shared/src/reports/apia`, `web/lib/reports/apia`, `web/components/pages/Rapoarte.tsx`, `ReportCards.tsx` | a real farm with 2 plots and 3 fuel expenses sees only the filings that apply, each with its missing list; Ion sees all, filled |
| **2** | migration 050; the "Ai animale?" style questions; `apia-change`, `apia-coupled-proof` + `apia-coupled.json`, `apia-eco-pd04`, `fertilizer-register`, `apia-notice`, `apia-papers-checklist`; `/de-raportat` cards get "Descarcă PDF" | + `supabase/migrations`, `apps/api` writers for the new columns | every row of §1 marked F/P except animals has a report |
| **3** | animals (after autofill A6): `apia-livestock`, `apia-pd07`, `apia-pd27`, Anexa 3 in `apia-fuel-prior`; `apia-hay`; `apia-active-farmer-2027` | | |

**Tests** (vitest, like `web/lib/reports/phase2.test.ts`):
- `apiaFilings`: a matrix of facts (no animals, no fuel, fuel scheme ended, unknown facts) → the expected sections; quarter expansion;
  the same dates as `farmObligations`.
- each builder: Ion's fixture → snapshot of the model; an empty farm → every `missing` line; Anexa 9 totals = sum of rows; rates picked
  by invoice date (7 Apr–30 Jun at 2,397 lei/l).
- data: every `fills` and `deadline_event` resolves; every coupled crop code exists in `apia-crop-codes.json`.
- e2e (`/qa`): the tab on Ion's farm, a PDF downloads for each card, offline.

---

## 7. What it won't do

- **File anything.** AGI-Online has no API, and the cerere is signed there. The surface sheet is a copy-from sheet, not the form.
- **Claim the official layout** where we haven't seen the printed form (Anexa 7/9 layout is consolidated only to 2019; II.A column order
  is from Anexa 2 of Ord. 67/2026). Every PDF keeps "Generat de CropCash… Nu este un document oficial" unless the official model is
  matched and checked (Q4).
- **Decide eligibility.** Cards say "APIA cere cel puțin 1.500 kg/ha", never "nu primești sprijinul".

---

## 8. Open questions

| # | Question | Blocks |
|---|---|---|
| Q1 | Private leases: attached to the cerere and valid until 1 Dec 2026, or only through the registrul agricol? Read Anexa 2 of Ord. 67/2026 again on this point | A15 checklist text |
| Q2 | Force-majeure deadline: 15 working days? | A4 card |
| Q3 | Tab name: "Pentru APIA și primărie", or keep "Pentru instituții" and add a sub-heading? | §2 |
| Q4 | Do we try to match the official Anexa 9 layout exactly (so the farmer files our PDF), or always print "nu e document oficial"? Matching needs the current form | A7 |
| Q5 | Diesel scheme after 31.12.2026: hide `apia-fuel-prior` until an HG extends it (Q4 2026 claim stays until 31 Jan 2027)? | A6 |
| Q6 | Coupled crop schemes: new `apia-coupled.json`, or extend `subsidies-2026.json` so the subsidy engine estimates them too? | A8 |
| Q7 | Sale quantities: add `quantity_kg` to sale transactions, or rely on invoices (e-Factura) only? | A8 |
| Q8 | Nitrate-vulnerable zones: whole country since 2013 (action programme) or a SIRUTA list? Decides whether A12 applies to everyone | A12 |
