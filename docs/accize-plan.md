# Accize – plan

Written 20 November 2026. **Goal:** a list of excise schemes ("accize") a farmer can **join** and that bring **money back** (revenue), stored like the rest of the data, counted in the farmer's plan, and checked every day by the monitor.

## 1. What the research found (20 nov 2026)

The honest answer is that the list is short. In Romania, only **one** excise scheme pays a farmer money today. The rest either lower a cost (no money comes in) or are only proposals.

| id | What | Kind | Money in? | Status | Source |
|---|---|---|---|---|---|
| `motorina-hg1174` | Ajutor de stat pentru reducerea accizei la motorina folosită în agricultură (vegetal, zootehnie, îmbunătățiri funciare) | `refund` (APIA pays per quarter) | **Yes**: litres × rate, 2–6 months after the quarter | `confirmat-2026`; scheme ends **31.12.2026**, no 2027 extension found | HG 1174/2014, OMADR 1727/2015 (all already in `docs/data/fuel-excise.json`) |
| `motorina-pompa-2027` | Motorină fără acciză și TVA direct la pompă, cu tichete, 78 l/ha (MADR, Florin Barbu) | `at_pump` (no refund: cheaper diesel) | No: lower cost. Replaces the refund if adopted | `propunere` – only press; blocked at MF in April 2026, "from 2027" in October 2026 reports | capital.ro, digi24.ro, informat.ro (press only) |
| `energie-regenerabila-art399` | Curent din surse regenerabile (lit. m) și din surse sub 250 kW (lit. n) fără acciză – e.g. solar panels on the farm | `exemption` | No: lower cost | `confirmat-2026` – Codul fiscal consolidated 25.10.2026. **Correction:** art. 399 has **no** exemption for electricity/gas used in agriculture; the first draft of this plan assumed one | legislatie.just.ro 171282 |
| `tuica-gospodarie` | Țuică / rachiu din fructele proprii, pentru consum propriu | `exemption` | No (own use only, nothing sold) | `confirmat-2026` – **50 l/year**, art. 342 alin. (1^6); the 150/200 l law from the press is not in the consolidated Code | legislatie.just.ro 171282 |
| `criza-carburanti-legea162` | Acciza redusă la pompă cu 5–25% (Legea 162/2026), prelungită până la 31.01 / 01.02.2027 | — (everyone, not something to join) | **Lowers** the diesel refund rate | Already modelled in `fuel-excise.json` `rates` | digi24.ro, ziare.com |

**Decision for the app:**
- Only `kind: refund` counts as revenue. It's the only one with money arriving on a date.
- `exemption` and `at_pump` are listed as **savings** ("Plătești mai puțin"), never added to income. They are kept so the farmer sees them and so the monitor tells us the day a proposal becomes law (the 2027 pump scheme would replace the refund).
- No figure is invented: everything not on an official page is `null` + `DE-VERIFICAT` + a row in `docs/11-open-questions.md`.

## 2. Data: JSON catalogue + Supabase for what the farmer joined

Same split as the rest of the app (CLAUDE.md: "Cifrele vin doar din `docs/data/*.json`"; per-farm state is in Supabase).

### 2.1 `docs/data/excise-schemes.json` (new)
```jsonc
{
  "meta": { "read_on": "2026-11-20", "status_values": ["confirmat-2026", "propunere", "DE-VERIFICAT"] },
  "schemes": [
    {
      "id": "motorina-hg1174",
      "name_ro": "Banii înapoi din acciza la motorină",
      "kind": "refund",                 // refund | exemption | at_pump
      "counts_as_revenue": true,
      "details_file": "fuel-excise.json", // rates, caps, deadlines stay there; no duplication
      "who_ro": "...", "how_to_join_ro": "...", "join_deadline": { "date": null, "status": "DE-VERIFICAT" },
      "valid_from": "2015-01-01", "valid_to": "2026-12-31",
      "payment_lag_months": { "min": 2, "max": 6, "status": "DE-VERIFICAT" },
      "status": "confirmat-2026",
      "legal_basis": [{ "act": "HG 1174/2014", "url": "https://legislatie.just.ro/Public/DetaliiDocument/164301" }],
      "watch_urls": ["..."],
      "watch_keywords": ["motorin", "acciz"]
    },
    { "id": "motorina-pompa-2027", "kind": "at_pump", "counts_as_revenue": false, "replaces": "motorina-hg1174", "status": "propunere", ... },
    { "id": "energie-gaz-agricol-art399", "kind": "exemption", "counts_as_revenue": false, "status": "DE-VERIFICAT", ... },
    { "id": "tuica-gospodarie", "kind": "exemption", "counts_as_revenue": false, "status": "DE-VERIFICAT", ... }
  ]
}
```
- `fuel-excise.json` stays as is (the diesel report and „De raportat” already read it). The new file only points to it.
- A Zod schema in `packages/shared/src/data/` (next to `FuelExciseSchema`) checks the file once; a test fails if `counts_as_revenue: true` on anything that isn't `refund`.

### 2.2 Supabase: migration `052_farm_excise_schemes.sql` (built: `farmer_id` → `farmers`, `acord_on`, a touch trigger, no delete)
```sql
create table if not exists public.farm_excise_schemes (
  farm_id    uuid not null references public.farms(id) on delete cascade,
  scheme_id  text not null,               -- id from excise-schemes.json
  year       int  not null,
  status     text not null default 'interested' check (status in ('interested','acord_filed','approved','left')),
  acord_at   date,                        -- when the acord was filed (pro-rata months if mid-year)
  updated_at timestamptz not null default now(),
  primary key (farm_id, scheme_id, year)
);
-- RLS like opportunity_follows (036/037): `for all` on the farmer's own farm, via the farm-membership helper.
```
- API (built): `GET /api/excise` and `PUT /api/excise/:schemeId/:year` `{ status, acordOn }` on the signed-in farm (`repo.getMyFarm`, like the other farm routes), in `apps/api/src/routes/excise.ts` + `db/excise.ts`. The catalogue decides first (`exciseEnrollmentRefusal`): unknown scheme 404; an acord on a proposal, an exemption with no way to join, or a year the scheme isn't in force 409; an accountant 403.
- Ion's farm (`demo-ion.json`) gets `motorina-hg1174: approved` for 2026; no API call there.
- Offline: the toggle is not money moving, so it can go in the offline queue (same rule as sales/expenses).

## 3. Counting it as revenue

Today the diesel refund is only a **report**; it never appears in the plan or the monthly salary. That changes for joined `refund` schemes.

1. `packages/shared/src/cashflow/excise.ts` (pure, tested): for each quarter of a joined scheme, refund = `min(litres, cap)` × rate for the invoice date (rates/caps from `fuel-excise.json`; `packages/shared/src/reports/fuel.ts` already does the maths – reuse it, don't copy it).
   - **Litres:** recorded diesel expenses (`fuel_liters_cl`, migration 027) for past quarters. For future quarters: the cap (`caps_l_per_ha` × ha per crop) as the top of a range, and the recorded average as the bottom. `crops-reference.json` has no diesel l/ha, so there is no invented "typical" figure: missing data → only the recorded part counts, and a line „Notează litrii de motorină ca să intre în salariu”.
   - **Date:** quarter end + `payment_lag_months` (a range, so it shows like the other estimated income).
   - **Rate `null`** (December 2026 today) → that quarter is left out, not guessed.
   - **After `valid_to`** nothing is projected, unless the JSON says it was extended.
2. New timeline kind `excise_refund` → `drivers.ts` `KIND` map as its own driver ("Banii de la motorină"), added in `timeline.ts` and the smoothing input, so it counts in salariu and in prognoză.
3. When APIA pays, the farmer records it as income with category `excise_refund`; the projected quarter is then replaced by the real amount (same pattern as `apia_advance` in `farm-plan.ts`).

## 4. UI (web, Romanian)

- On `/subventii`, a section **„Accize: bani înapoi de la stat”** (or a tab in „Ce mai poți primi”): one card per scheme, grouped by **„Îți aduce bani”** (refund) and **„Plătești mai puțin”** (exemption / at_pump), with who can join, how, the deadline, the status badge (`propunere` → „Doar propunere, nu e lege”), and a „Mă înscriu / Am depus acordul” switch writing to `farm_excise_schemes` (`NetButton` not needed: it can queue).
- „De raportat” keeps the quarterly claim; it only shows for farms that joined.
- New screen? No – it lives in existing screens, so no new `SCREENS` entry/skeleton.

## 5. The daily check (cron)

The monitor already re-checks `fuel-excise.json`'s `watch_urls` (`subventii-monitor/src/obligations.ts`, run daily at 07:00 by `scripts/daily.cmd`, later by cron on the VPS). Extend it rather than add a second job:

1. `config.ts`: `EXCISE_PATH` → `docs/data/excise-schemes.json`.
2. `obligations.ts`: `watchMap(fuel, calendar, excise)` adds each scheme's `watch_urls` with the fact `Acciză: <name_ro> (<status>)`. `RELEVANT_LINK` also matches the schemes' `watch_keywords` (`acciz`, `motorin`, `tichet`, `scutir`, `țuică`, `art. 399`).
3. Add the new official pages to `subventii-surse.md` (new §4.14 „Accize”): legislatie.just.ro for Codul fiscal Titlul VIII + norme, MF „transparență decizională”, MADR „proiecte de acte normative”, ANAF accize page, APIA „măsuri finanțate de la bugetul național”. The existing test (`tests/obligations.test.ts`) fails until every `watch_url` is in the spec.
4. Report: the existing „Obligații de re-verificat” section, now also saying „actualizează docs/data/excise-schemes.json”. Two special lines: a `propunere` whose page changes ("may have become law"), and a scheme 30 days before `valid_to` with no extension found.
5. After merging: `npm run seed -w subventii-monitor` on the machine with the monitor's `.env`, so the new sources are in `sources`.
6. As today, nothing is written automatically into the JSON: a person reads the change and updates the file (figures need a human check).

## 6. Open questions → `docs/11-open-questions.md`

- Diesel refund in **2027**: extended, replaced by the pump vouchers, or ended? (Decides whether anything is projected after 31.12.2026.)
- Art. 399 m)/n): how the exemption is claimed (notification, certificate) – in the norms, not read yet.
- ~~Țuică household limit~~ – answered: 50 l (art. 342 alin. 1^6).
- December 2026 diesel rate (already open, row 15).
- HG 1174/2014 sectors: confirm whether aquaculture is covered.

## 7. Steps (each: `npm test` green, then tick)

1. [x] `excise-schemes.json` + Zod schema (`packages/shared/src/data/excise.ts`) + test; open-questions rows 28–30 and item 55. (20 nov 2026)
2. [x] Migration 052 + `db/excise.ts` + route + tests; `tests/integration/excise.test.ts` written, runs after `npm run db:migrate`. (20 nov 2026)
3. [x] `cashflow/excise.ts` + `excise_refund` timeline kind + driver + tests. (20 nov 2026) Built narrower than §3.1: **only litres already noted** count, no range for future quarters (no l/ha consumption in docs/data, so nothing to base it on). `fuel-excise.json` is now in `AppData` (`data.fuel`). The API reads `farm_excise_schemes` with the farm (FARM_SELECT), so **migration 052 must be applied before this API is deployed**. Not yet: a way to record the refund when it arrives (`paid` is supported, nothing fills it; step 4), and the demo clock doesn't pay it.
4. [x] UI section on `/subventii`, demo data for Ion, switch wired. (20 nov 2026) `web/components/subsidies/ExciseCard.tsx`, shown only on „Toată ferma” (the refund is the whole farm's diesel). Write `set_excise_enrollment` (`functions/excise.ts`), queueable offline (it only notes the acord; `withOutbox` shows it at once); Ion's farm keeps it in `storageKey('cropcash-excise')`, starting from `excise_schemes` in `demo-ion.json` (acord approved for 2026, no litres, so the card says nothing reaches the salary yet). Tests: `web/components/pages/accize.test.tsx`. Still not built: „Am primit banii” for a paid quarter.
5. [x] Monitor: `EXCISE_PATH`, `watchMap`, keywords, report lines, spec, tests. (20 nov 2026) `subventii-monitor/src/obligations.ts`: each scheme's `watch_urls` carry the fact `Acciză: <name_ro> (<status>)`, a proposal's reads „verifică dacă a devenit lege”; `relevantLink()` adds the schemes' `watch_keywords`; `endingSoon()` lists a scheme 30 days before `valid_to` with nothing in force replacing it, in the same section, even on a quiet day (for the diesel refund: from 1 Dec 2026). Spec: only the Codul fiscal (171282) was missing, so it went into §4.13 „Legislație” instead of a new §4.14; the other `watch_urls` were already sources. **Still to do by hand:** `npm run seed -w subventii-monitor` on the machine with the monitor's `.env`, so the new source is in `sources`.
6. [x] Docs: `CLAUDE.md` table row, `docs/07-architecture.md` table list, `progress.md`. (20 nov 2026) Also the two `/api/excise` routes and a paragraph on the refund in the plan (07 §3, §7), and `set_excise_enrollment` in `docs/functions.md` §10.

## Sources
- [HG 1174/2014 consolidated](https://legislatie.just.ro/Public/DetaliiDocument/164301)
- [Reducerea accizei prelungită până la 31.01.2027 (digi24)](https://www.digi24.ro/stiri/economie/guvernul-vrea-sa-prelungeasca-reducerea-accizei-la-motorina-pana-la-31-ianuarie-2027-cat-ar-putea-creste-preturile-fara-aceasta-masura-4009257) · [ziare.com](https://ziare.com/reducere-acciza-motorina/prelungire-3-luni-guvernul-niculescu-2044784)
- [Motorină fără acciză la pompă din 2027 (informat.ro)](https://informat.ro/economie/florin-barbu-motorina-fara-acciza-2027-ministerul-agriculturii-146970) · [capital.ro, 78 l/ha, blocaj la MF](https://www.capital.ro/tensiuni-intre-ministere-din-cauza-motorinei-fara-taxe-pentru-fermieri-florin-barbu-de-o-luna-si-jumatate-nu-am-primit-niciun-raspuns.html) · [tvrinfo, proiect în dezbatere](https://tvrinfo.ro/motorina-fara-accize-si-tva-pentru-fermieri-proiectul-pus-in-dezbatere-de-ministerul-agriculturii/)
- [Art. 399 Cod fiscal](https://www.noulcodfiscal.ro/titlu-8/capitol-1/sectiune-14/articol-399.html) · [Norme: scutiri de la plata accizelor](https://lege5.ro/Gratuit/ha4tomrvge/scutiri-de-la-plata-accizelor-norma-metodologica?dp=ha3tgmzygy2tg)
- [Țuică: plafon votat (capital.ro)](https://www.capital.ro/lege-noua-pentru-romanii-care-fac-tuica-acasa-parlamentul-a-majorat-limita-pentru-cati-litri-nu-platesti-nimic-la-stat.html) · [alba24.ro](https://alba24.ro/romanii-vor-putea-produce-mai-multa-tuica-acasa-scutita-de-accize-parlamentul-voteaza-cresterea-limitei-la-200-de-litri-pe-an-1137921)
