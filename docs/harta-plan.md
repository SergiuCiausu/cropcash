# Plan: Harta parcelelor (`/harta` + mini-harta din colț)

Status: **plan, nothing built.** Decisions confirmed by the owner on 2026-11-14 (see "Decisions"). The LPIS check (step 0) was run on 2026-11-14 and its results are below.

## What the farmer gets

- A stylised, slightly cartoonish 3D globe/map (Google Earth feel, not a GIS tool) that shows **where each piece of land is**.
- Parcels come from the paper they already have: the **cerere unică de plată**. Its section **II.A „Declarație de suprafață”** lists every parcel. The existing document reader reads it, the farmer checks the rows, and each row becomes a parcel on the map, located by **SIRUTA + bloc fizic** from APIA's public LPIS service. A parcel can also be placed by coordinates or **drawn by hand, with straight and curved edges**.
- **Two ways to look at the farm:** **„Pe parcele”** (one row per piece of land, the main view) and **„Pe culturi”** (parcels grouped by crop, with totals per crop).
- **Filters:** revenue, expenses, crop, size, treatments done, treatments still to do, sowing date, expected harvest, and more (full list in step 6).
- **`/harta`** (full page): list on the left, map on the right. Clicking a list row flies to the parcel and opens its card. Clicking a parcel on the map opens the same card and highlights the row.
- **Parcel card:** crop this year and in past years, area, bloc / parcel number, sowing date, expected harvest, treatments done and still to do, expenses (treatments, seeds, fertiliser, work done by others, constructions…), revenue, and the result per parcel and per hectare.
- **Mini-harta:** a small map window in a corner of every app page. It expands to `/harta`.

## Step 0 results: APIA LPIS (checked 2026-11-14)

- Service: `https://inspire.apia.org.ro/network/rest/services/INSPIRE/LPIS_referinta_2024/MapServer/0`. ArcGIS 10.91 with capabilities `Map,Query,Data`. Queries return **GeoJSON**. Coordinates are in ETRS89 (wkid 4258, the same as WGS84 at map scale), so **no Stereo70 conversion is needed**. One request returns at most 1,000 features.
- Fields: `fbid` (bloc id), `siruta`, `judet` (`TR`), `nume_com`, `fol_pr_trn` (land use: `TA` arable, `PP` pasture…), `aria_neta` (ha), plus `fol_sec_tr` and `fol_sec_cp`.
- **`fbid = "<SIRUTA>-<nr. bloc fizic>"`**, e.g. `153277-286`. A row from the cerere maps to exactly one bloc. Tested: `where=fbid='151870-314'&f=geojson` returns the polygon.
- CORS: it sent back our Origin with `Access-Control-Allow-Origin`, so the browser can call it directly. We still go through the API so results are cached (see step 4).
- Limits: the newest layer is **2024** (no 2025/2026 layer is published), and the layer only draws below 1:100,000. A `LIKE` filter got **403** from their firewall, while equality and spatial queries work. Use only `fbid='…'` and envelope queries.
- The same server also publishes **OI_View** (APIA's own orthophotos) and supports `export` (dynamic PNG). We use `export` as a transparent overlay of every bloc while drawing.
- Still to confirm: the terms of use. The metadata says the data belongs to APIA. It's an INSPIRE view service meant for farmers, so showing a farmer their own bloc is low risk, but write to APIA before launch (open question 1).
- A bloc fizic is **not** the farmer's parcel. One bloc can hold several farmers. The bloc outline is the starting point, and the farmer narrows it down by drawing.

**Ion's demo farm, using real blocs in Măldăeni (SIRUTA 153277), Teleorman, both `TA`:**

| Ion's parcel | Bloc | Bloc net area | Declared |
|---|---|---|---|
| Grâu | `153277-286` | 8.5405 ha | 8 ha |
| Porumb | `153277-293` | 7.1858 ha | 7 ha |

`demo-ion.json` stores the fbid and the geometry fetched once by a script (the demo never calls the API), with `source: "APIA LPIS 2024"`.

## The cerere unică, section II.A (2026 form, Monitorul Oficial; sample PDF p. 4+)

Columns in order: Nr. crt. · **Județ** · **Localitate (comună/oraș)** · **Cod SIRUTA** · **Nr. bloc fizic** · Pagina hartă · **Nr. parcelă agricolă** (`1a; 1b; 1c`) · Cod parcelă fermier · **Categorie de folosință** · Suprafață parcelă · Altitudine · Scheme · **Cultură: nume + cod** · **Suprafață cultură** · Culturi secundare (cod, suprafață) · Culturi de toamnă 2026 (cod, suprafață).

- The declarație de suprafață is part of the cerere, so it needs **no separate document kind**.
- The paper has **no sowing date and no treatments**. Those come from the farmer and from invoices.
- Crop codes are APIA codes. They map to our ids through a new `docs/data/apia-crop-codes.json`, copied from the official annex („Instrucțiuni de completare”) with its source, never typed from memory.
- The same table appears in section II.D (eco-scheme PD-28) and again for vineyards. The reader takes only II.A.

## Decisions

1. **The piece of land is the main unit.** Data, list, map and card are all per parcel. „Pe culturi” is a second view built from the same parcels.
2. **One parcel with history across years:** a stable parcel plus one row per campaign year (crop, area, sowing, harvest).
3. **Drawing:** straight edges, curved edges and rounded corners, edited by hand on the map.
4. **Map base:** MapLibre GL JS v5 with a custom cartoon style on **OpenFreeMap** vector tiles (free, no key, no quota).
5. **Satellite: MapTiler free tier.** Both MapTiler and Esri (ArcGIS Location Platform) have free tiers with a key. MapTiler wins on the stated criteria: it's the main sponsor of MapLibre, its docs and examples are written for MapLibre, and it serves 512 px WebP tiles from a CDN. Only the „Satelit” toggle uses it, so the free quota covers the cartoon-first map. The key is public by design: restrict it by origin in the MapTiler dashboard and pass it through `publicConfig`. Fallback if quota or terms don't fit: Esri. A third option is APIA's own orthophotos (OI_View), the same imagery APIA checks parcels against; it's slower, so it's optional.
6. **Demo:** the real blocs above.

## What changes in the existing code

| Exists | Change |
|---|---|
| `parcels` = one row per crop, rewritten on every edit (`001`, `014`, `update_farm`) | Becomes a **derived** total per crop. Crop areas are summed from this year's `plot_seasons`, so the cashflow, subsidy and forecast engines keep their input shape. Onboarding (crop + area only) creates one unplaced parcel per crop („fără loc pe hartă”), so every farm has parcels from day one. **This changes `docs/07-architecture.md` §3** and must be updated there. |
| Reader, kind `apia_cerere` (`apps/api/src/ai/documents.ts`, `packages/shared/src/documents`) | Reads II.A rows with bloc, SIRUTA, parcel number, land use and APIA crop code. Files are still never stored. |
| Expenses and sales have `crop_id` (`transactions`, `010`) | Add a nullable `plot_id`. Rows with only a crop are shared out over that crop's parcels by area, and labelled as such. |
| `EXPENSE_CATEGORIES` (`packages/shared/src/farm/plan-inputs.ts`) | Add `constructions` and `services`. |
| `sowing_month`/`harvest_month` in `crops-reference.json` | Expected harvest when the farmer gives no date. |
| „Întreabă” button bottom-right (`.ask-fab`) | Mini-map goes bottom-left of the main column. |

## Data model — `020_plots.sql` (safe to run again)

```sql
-- A piece of land. Stable across years.
create table if not exists plots (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  name text,                                -- the farmer's own name: "La pădure"
  county text not null,                     -- counties.json id
  siruta int, bloc_fizic text, parcel_no text,   -- as printed: 153277 / 286 / 1a
  lpis_fbid text,                           -- "153277-286", when the bloc was found
  land_use text,                            -- TA, PP, CP, VI…
  geometry jsonb,                           -- GeoJSON (Multi)Polygon in WGS84, flattened, ≤ 64 KB
  shape jsonb,                              -- the editable drawing (vertices, curves, corner radii)
  centroid_lat numeric(9,6), centroid_lng numeric(9,6),
  geometry_source text not null default 'none'
    check (geometry_source in ('lpis', 'drawn', 'coords', 'approx', 'none')),
  archived_at timestamptz,                  -- given up / no longer farmed; history stays
  created_at timestamptz not null default now()
);

-- What happened on that land in one campaign year.
create table if not exists plot_seasons (
  plot_id uuid not null references plots(id) on delete cascade,
  farmer_id uuid not null references farmers(id) on delete cascade,
  campaign_year int not null check (campaign_year between 2000 and 2100),
  crop_id text, apia_crop_code text,
  area_ari int not null check (area_ari > 0),
  sown_on date, harvested_on date,          -- null → crop's usual months
  second_crop_id text,
  primary key (plot_id, campaign_year)
);

-- Work on a parcel, done or planned. Treatments are kinds here.
create table if not exists plot_operations (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references plots(id) on delete cascade,
  farmer_id uuid not null references farmers(id) on delete cascade,
  campaign_year int not null,
  kind text not null check (kind in ('soil_work','sowing','fertilizing','herbicide','fungicide',
                                     'insecticide','irrigation','harvest','other')),
  status text not null check (status in ('done','planned')),
  on_date date,                             -- done: when; planned: target date
  product text, dose text,                  -- as the farmer writes it
  transaction_id uuid references transactions(id) on delete set null,
  template_id text                          -- from crop-operations.json when suggested
);

alter table transactions add column if not exists plot_id uuid references plots(id) on delete set null;
-- RLS *_own policies + grants for all three tables, like task_completions in 010.
-- create_farm/update_farm: write plots + plot_seasons; parcels rows recomputed from them.
```

- **History:** the same `(siruta, bloc_fizic, parcel_no)` next year is the same plot with a new season. Parcel numbers can change between years, so as a fallback a new row is matched to an existing plot whose shape overlaps it by more than 60%, and the farmer confirms the match in the review sheet.
- GeoJSON in jsonb, not PostGIS: the server never queries by shape. The browser draws it and `packages/shared` measures it.

## Steps

Each step: `npm test` green → tick it here → one status line. No commits unless asked.

### 1. Data + shared logic
- `020_plots.sql`, `db:migrate`, an integration test for RLS on the three tables, and a migration of existing farms (each `parcels` row becomes one unplaced plot plus a season).
- `packages/shared/src/plots/` (pure, tested):
  - `expectedHarvest(season, crops, today)`
  - `plotMoney(plot, transactions, seasons)` → direct + area-shared expenses and revenue, result, lei/ha. Integer bani; the rounding remainder goes to the largest parcel so totals stay exact.
  - `cropGroups(plots, seasons, year)` for „Pe culturi”
  - `operationsStatus(plot, operations, templates, today)` → done / to do / overdue
  - `filterPlots(rows, filters)`, `sortPlots`
  - geometry: `flattenShape(shape)` (curves to points), `geodesicAreaAri(geometry)`, `centroid`, `bbox`, `overlapRatio`
  - `matchSeasonRows(reading, plots)` → new / same plot / ask
- `EXPENSE_CATEGORIES` gets `constructions` and `services`. Zod schemas `PlotSchema`, `SeasonSchema`, `OperationSchema`.
- New data files, each with source and `DE-VERIFICAT` where needed:
  - `apia-crop-codes.json`
  - `crop-operations.json`: a typical work plan per crop, e.g. wheat: herbicide in spring, fungicide at heading. Only from a cited source (ICDA Fundulea / extension guides); otherwise the entry stays empty and the farmer plans their own.
  - `lpis.json`: service URL, layer year `2024`, a link to the terms.

**Step 1 status (2026-11-14): built, not yet applied to Supabase.**
- [x] `supabase/migrations/020_plots.sql`:
  - tables `plots`, `plot_seasons`, `plot_operations`, plus `transactions.plot_id`
  - RLS, plus a link that forces a season, operation or transaction to point only at the same farm's parcel
  - `farm_harvest_year`, `sync_unplaced_plots`, `save_plots`
  - `create_farm` / `update_farm` keep the plots in step; `record_expense` takes `p_plot_id`
  - existing farms are moved over
- [x] Checked on PGlite (Postgres 17) with all migrations and a stand-in for Supabase auth: 20 scenarios pass (unplaced hectares, absorbing, refusals, history, expense on a parcel, another user blocked everywhere). The script is in the session scratchpad, not in the repo.
- [ ] `npm run db:migrate` on the real Supabase, then the RLS integration test in `tests/integration/rls.test.ts`. Waiting for the owner's go-ahead, because it changes the cloud database.
- [x] `packages/shared/src/plots/` with tests (27):
  - files: `model`, `geometry`, `season`, `money`, `operations`, `rows`, `filters`, `match`, `totals`
  - names as built: `plotsMoney` (all parcels at once), `buildPlotRows` + `cropGroups`, `filterPlots` / `sortPlots` / `filtersFromQuery` / `filtersToQuery`, `syncUnplaced` / `absorbPlaced` (the TS twin of the SQL)
- [x] `EXPENSE_CATEGORIES` has `constructions` and `services` (another change in progress also renamed `repairs` → `constructions` and added `machine_service`). `StoredTransaction.plot_id`.
- [x] `docs/data/plots-params.json` (thresholds) and `docs/data/lpis.json`. `PlotsParamsSchema` lives in `plots/model.ts`; adding it to `loadData` waits for step 2, because `data/schemas.ts` has other uncommitted work.
- Changed from the plan:
  - The year column is `harvest_year`, the same as the app's `harvestYear` and the APIA campaign year.
  - APIA crop codes already live in `crops-reference.json` (`apia_codes`, from the cerere onboarding work), so there's no `apia-crop-codes.json`.
  - `crop-operations.json` isn't created until a cited source exists; `operationsStatus` already accepts templates.

### 1b. Reference database: SIRUTA + blocuri fizice for Teleorman and Constanța

A local copy, so lookups don't depend on a slow government server, and so features that need spatial search can work: „pe ce bloc stau acum?”, the bloc overlay, the centre of a commune for `approx`.

**What exists (measured on 2026-11-14):**

| | Teleorman (TR) | Constanța (CT) |
|---|---|---|
| LPIS blocs (2024 layer) | **21,424** | **23,090** |
| Distinct SIRUTA codes in LPIS | 100 | 74 |
| GeoJSON size (precision 6 ≈ 0.1 m) | ~23 MB | ~25 MB |
| Same, gzipped | ~5 MB | ~5 MB |

The service supports pagination (`resultOffset` + `resultRecordCount=1000`, `orderByFields=OBJECTID`), so each county is about 22–24 requests.

**Sources:**
- **SIRUTA:** the INS nomenclature published on data.gov.ro (dataset `siruta`). Columns: `SIRUTA`, `DENLOC`, `JUD`, `SIRSUP` (parent unit), `TIP`, `MED` (urban/rural). Before importing, check that the release is current: one copy seen is from 2016, and INS is the owner. It has no coordinates.
- **Blocs:** the APIA LPIS layer from step 0.

**Schema `021_reference_geo.sql`.** PostGIS here, unlike `plots`, because these tables *are* queried by location:

```sql
create extension if not exists postgis;

create table if not exists siruta_units (
  siruta int primary key,
  name text not null,                 -- DENLOC, with diacritics as published
  name_search text not null,          -- lower-case, no diacritics, for the search box
  type int not null,                  -- TIP: county / municipality / town / commune / village…
  county text not null,               -- 'TR', 'CT'
  parent_siruta int references siruta_units(siruta),   -- SIRSUP: village → commune
  urban boolean not null,
  kind text not null check (kind in ('county','municipality','town','commune','village',
                                     'component_locality','sector')),   -- from TIP, see below
  commune_siruta int references siruta_units(siruta),  -- the UAT this code belongs to (itself for a UAT)
  location geometry(Point, 4326),     -- where the place is: village/town point (see "Places")
  boundary geometry(MultiPolygon, 4326),  -- UAT outline, only for municipality/town/commune
  centroid geometry(Point, 4326),     -- computed from the commune's blocs; null for villages
  source_version text not null        -- the INS release imported
);

-- One readable line per code: "satul Măldăeni, comuna Măldăeni, județul Teleorman".
create or replace view siruta_places as
select u.siruta, u.name, u.kind, c.siruta as commune_siruta, c.name as commune_name, c.kind as commune_kind,
       u.county, ST_Y(u.location) as lat, ST_X(u.location) as lng
from siruta_units u left join siruta_units c on c.siruta = u.commune_siruta;

create table if not exists lpis_blocs (
  fbid text primary key,              -- '153277-286'
  siruta int not null,                -- the UAT the bloc belongs to
  bloc_no text generated always as (split_part(fbid, '-', 2)) stored,
  county text not null,
  uat_name text not null,             -- nume_com as published
  land_use text,                      -- fol_pr_trn: TA, PP, CP, VI…
  land_use_2 text,                    -- fol_sec_tr
  net_area_m2 bigint not null,        -- aria_neta (ha) × 10,000, rounded: no floats kept
  uat_siruta int,                     -- the commune/town the bloc belongs to (siruta, resolved through parent_siruta)
  village_siruta int,                 -- the village/locality it lies in or nearest to (see "Places")
  village_method text check (village_method in ('only_village','inside_locality','nearest','paper')),
  village_distance_m int,             -- from the bloc to that village's point; 0 when inside it
  geom geometry(MultiPolygon, 4326) not null,
  layer_year int not null,            -- 2024
  imported_at timestamptz not null default now()
);
create index on lpis_blocs using gist (geom);
create index on lpis_blocs (siruta, bloc_no);
create index on siruta_units (county, name_search);
-- Public reference data: authenticated users may read; only the service role writes.
```

`plots.siruta` and `plots.lpis_fbid` stay plain columns, not foreign keys, so a farmer from another county still works.

**Import scripts (`scripts/import-geo/`, run by hand, idempotent):**
1. `siruta.ts`:
   - download the INS CSV and keep the rows for JUD = Teleorman and Constanța (the county codes are taken from the file, not typed)
   - normalise names, insert or update
   - write `docs/data/siruta-tr-ct.json` (siruta, name, type, parent): small, ships with the app, so the commune picker works offline and on Ion's farm
2. `lpis.ts --county TR|CT`:
   - read `returnCountOnly`, then page with `orderByFields=OBJECTID`, 1 request/s, retry with backoff
   - save raw pages to `data-cache/lpis/2024/<county>/` (gitignored), so a failed run resumes instead of starting over
   - check that the page total equals the count before writing anything
   - insert or update through `pg` in batches of 500: `ST_Multi(ST_MakeValid(ST_GeomFromGeoJSON(…)))`, area as integer m²
3. `reconcile.ts` → a report in `data-cache/geo-report.md`:
   - SIRUTA codes in LPIS that are missing or of the wrong type in INS. LPIS shows 100 TR and 74 CT codes, more than the number of communes, so some blocs probably carry village or old codes. Each one is mapped to its commune by `parent_siruta` or listed for a manual check.
   - communes with no blocs
   - invalid geometries
   - bloc counts per commune
4. Fill `siruta_units.centroid` from `ST_Centroid(ST_Union(geom))` of each commune's blocs.
5. `places.ts` → which city or village each code and each bloc points to (below).

**Places: what each SIRUTA code and each bloc points to**

*SIRUTA codes.* Every code gets its name, its kind, and the commune it belongs to:
- `kind` comes from the INS `TIP` column. The TIP-to-kind table is copied from INS's legend into `docs/data/siruta-types.json` with its source, not typed from memory. TIP separates county seats, municipalities, towns, communes, the village that is the seat of a commune, other villages, and component localities of a town.
- `commune_siruta` follows `SIRSUP` up to the first municipality/town/commune. A UAT points to itself.
- The `siruta_places` view gives one readable line per code („satul Măldăeni, comuna Măldăeni, județul Teleorman”). The same data goes into `docs/data/siruta-tr-ct.json`, so the label works offline and on Ion's farm.
- `location` (one point per city or village). SIRUTA has no coordinates, so they come from, in order:
  1. OpenStreetMap place nodes (`place=city|town|village|hamlet`) tagged `ref:siruta`, matched by code. Check the coverage for TR and CT first; Overpass was down when this plan was written.
  2. For anything still missing: an OSM place with the same normalised name inside the right UAT outline.
  3. Otherwise null, and listed in the report.

  OSM data is ODbL, so add "© OpenStreetMap" to the map attribution.
- `boundary` (UAT outlines): ANCPI's open INSPIRE administrative units for TR and CT, matched by SIRUTA. This also checks the blocs: a bloc outside its own UAT outline goes into the report.

*Blocuri fizice.* LPIS ties a bloc to a code, usually the commune's. APIA doesn't say which village it's in, so it's worked out:
1. `uat_siruta`: the bloc's code, raised to its commune through `commune_siruta` when LPIS used a village code.
2. `village_siruta`, the first rule that applies:
   - `only_village`: the commune has one locality → that one.
   - `inside_locality`: the bloc touches a village's built-up outline (OSM `place` areas / `landuse=residential` around that village's point) → that village.
   - `nearest`: otherwise, the village of the same commune nearest to the bloc's centre (`ST_Distance` on geography), with `village_distance_m` saved.
   - `paper`: a farmer's own cerere names the village („Localitate: comună și sat”), which beats the computed one for that farmer's plot. The shared table isn't changed.
3. One SQL pass after the import fills both columns for all blocs of a county, so re-running it is cheap.

How it shows in the app: „Bloc 286 · satul Măldăeni, comuna Măldăeni”. When the method is `nearest`: „lângă satul X (1,2 km)”, never stated as fact. The `/harta` list can be grouped and filtered by commune and village, and `GET /api/lpis/bloc` / `/api/lpis/at` return `{ village, commune, county }` with the method.

`plots` gets `village_siruta` too: from the paper when it names one, otherwise copied from the bloc.

The report (`reconcile.ts`) adds:
- the count of blocs per method
- villages with no location
- blocs more than 5 km from their assigned village
- blocs whose UAT outline disagrees with their code

Tests:
- the TIP mapping
- the parent chain (village → commune)
- each village rule on small fixture shapes
- integration: `153277-286` resolves to the commune Măldăeni and a named village

Add `npm run geo:import` (both counties, about 5 minutes) and record the run date and counts in `docs/data/lpis.json`.

**Map overlay tiles:** `tippecanoe` (run in Docker) turns the two counties into one `lpis-tr-ct.pmtiles`, about 5–10 MB, with the bloc number as a label from zoom 14 up. It's hosted by Caddy on the VPS, which supports range requests, so Netlify deploys stay small. MapLibre reads it through the `pmtiles` protocol. This replaces the live APIA `export` overlay for TR and CT; other counties keep the live overlay.

**Size:** about 45,000 rows, roughly 60–80 MB with the spatial index. Check this against the Supabase plan's database limit before the first import.

**Refreshing:** when APIA publishes a newer layer (`LPIS_referinta_2025`…), re-run with `--year`. Blocs whose fbid disappeared are kept, marked `layer_year` old, and never deleted, because farmers' plots may point to them.

**Tests:**
- pure parsers with fixture pages: hectares to m², fbid split, name normalisation
- an integration test on the real DB that `153277-286` is found by `(153277, '286')` and by a point inside it, and by nothing outside it

**Step 1b status (2026-11-15): built, not imported.** What runs today, and what waits:
- **Places, done and shipped.** `docs/data/siruta-types.json` (TIP → kind, from INS's `legenda-siruta.xml`) and `docs/data/siruta-tr-ct.json` (619 codes: TR 334, CT 285, from SIRUTA s1 2026, generated by `npm run geo:siruta`). Village points come from OSM by `siruta:code` (the tag OSM Romania uses, not `ref:siruta`): 446 of 450 villages have one; the 4 without are listed in the file's `meta.without_point`. The name-matching fallback (point 2 under „location”) wasn't needed.
- **In the app.** The card, the filters and the list say „satul Măldăeni, comuna Măldăeni” instead of „SIRUTA 153277" (`web/lib/cc/places.ts`), offline and on Ion's farm. A parcel's village is the cerere's (`plots.village_siruta`), else worked out from its own outline with the same rules, else its commune.
- **Shared logic** (`packages/shared/src/plots/`): `siruta.ts` (CSV, kinds, commune chain, names, labels, OSM), `village.ts` (only_village / inside_locality / nearest / paper, „lângă satul X (1,2 km)”, `blocPlace`), `lpis-import.ts` (count, pages by OBJECTID, rows with area in whole m²).
- **API.** `/api/lpis/bloc` and `/api/lpis/at` add `place: {village, commune, county, method, distanceM, text}` to each bloc. The source is `localFirst(dbLpisSource, APIA)` (`apps/api/src/lpis/db.ts`): the copy first, APIA for what it doesn't hold or while migration 034 isn't applied (logged once).
- **Written, not run:** migration `034_reference_geo.sql` (the plan said 021, which was taken), `npm run geo:lpis` / `geo:import` (`scripts/import-geo/lpis.ts`, `reconcile.ts`), and `tests/integration/reference-geo.test.ts` (skipped until the copy has rows). Village rules run in SQL (`geo_fill_places`) instead of a separate `places.ts`.
- **Waiting for the owner:**
  1. APIA's answer on the bulk copy (open question 1). Until then run `geo:import` only with `SUPABASE_DB_URL` pointing at a dev database that has PostGIS, and check the size against its plan.
  2. `inside_locality` needs villages' built-up outlines, not imported; until then the DB uses only_village and nearest. ANCPI UAT outlines (`boundary`, the „bloc outside its UAT” check) aren't imported either.
  3. The pmtiles overlay (tippecanoe in Docker, hosted by Caddy on the VPS) needs the copy first, and a deploy, so it isn't done.
  4. `--year` for a newer LPIS layer isn't there: the year and the service URL come from `docs/data/lpis.json`.
  5. `plots.village_siruta` isn't copied from the bloc on save; the app works it out when showing the parcel.

### 2. Reading the cerere (II.A)
- Extend `DocumentExtractionSchema` with `parcels[]`: `judet, localitate, siruta, bloc_fizic, parcel_no, farmer_code, land_use, crop_name, apia_crop_code, area_parcel, area_crop, second_crop_code`, all text exactly as printed. `crops[]` stays for old callers. The prompt says to read only section II.A and never copy the name, CNP or ID fermier.
- `normalizeReading`: area to whole ari, crop code to `crop_id` through `apia-crop-codes.json`, SIRUTA checked against a SIRUTA list in `docs/data/` (from INS).
- Review sheet (reuse `Papers` + `ItemSheet`): one row per parcel, each marked „parcelă nouă” / „aceeași cu anul trecut” / „verifică”, then „Le pun pe hartă”.
- Tests: fixtures built from the sample form (3 parcels, one unreadable bloc, one pasture `PP`), and a long farm with 40 rows.

**Step 2 status (2026-11-14): built.** Typecheck passes; `npm test` passes (1,355 tests).
- [x] **No second table.** The cerere rows the reader already returns are the II.A rows, one per parcel. So each `crops[]` row got optional location fields instead of a parallel `parcels[]`: `judet, localitate, siruta, bloc_fizic, parcel_no, farmer_code, land_use`. One AI pass, no double counting, and readings without them still parse. Added in `packages/shared/src/documents/index.ts`; the cerere-onboarding work owns that file, so the changes there are small and additive.
- [x] **Prompt.** One paragraph in `apps/api/src/ai/documents.ts` names each II.A column to copy, as printed, null when unreadable, never taken from another row.
- [x] **`plots/reading.ts`:**
  - `readPaperPlots`: tidies SIRUTA, bloc (`0286` → `286`), parcel number (`1 A` → `1a`), land use, county and locality; builds the LPIS id `<SIRUTA>-<bloc>`; matches the crop by APIA code (`crops-reference.json` `apia_codes`, already there from onboarding); lists every unreadable field in `issues`.
  - `paperPlotsToInputs`: hands off to save_plots with the farmer's choices.
  - `normalizeReading` returns `plots` for a cerere only. The field is optional, so readings built by hand in tests stay valid. Crop totals for onboarding are unchanged.
- [x] **`web/components/plots/PlotsReview.tsx`** + `web/styles/plots.css`, the review sheet:
  - each row is tagged „Parcelă nouă” / „Aceeași ca înainte” / „Verifică” / „Nu se salvează”
  - a Da/Nu question when a bloc outline covers an existing parcel (the `shapes` prop, filled once step 4 fetches outlines)
  - a warning when the rows don't add up to the printed total
  - each row can be left out
  - „Le pun pe hartă (N)” is a `NetButton`; a failed save keeps the sheet open with the message
- [x] **Tests:** `plots/reading.test.ts` (7), `PlotsReview.test.tsx` (6).
- [ ] **Not yet wired to a page.** `onSave` needs `PUT /api/plots` (step 3); the sheet opens from `/harta` (step 8) and, once the cerere-onboarding work lands, right after reading the cerere at onboarding.
- [ ] **SIRUTA codes are only checked for form (1–6 digits).** Checking against the INS list comes with step 1b.
- [ ] **A long-farm fixture (40 rows)** is still to add, with a real AI reading of the sample PDF (`npm run test:assistant`-style, it costs money).

### 3. API
- `apps/api/src/routes/plots.ts`: `GET /api/plots?year=` (plots + seasons + operations), `PUT /api/plots` (batch from the review sheet, idempotent with the existing replay cache), `PATCH /api/plots/:id`, `POST/PATCH/DELETE /api/plots/:id/operations`.
- `record_expense` and the sale recorder take `p_plot_id`. The offline outbox (`web/lib/live/outbox.ts`) carries `plot_id`.

**Step 3 status (2026-11-14): built.** Typecheck passes; `npm test` passes (1,370 tests). Migrations applied; the integration tests pass.
- [x] **`apps/api/src/db/plots.ts`**, `PlotStore`. Every call acts as the farmer, so RLS applies.
  - `list` reads plots, every year's seasons, and the year's operations.
  - `save` calls the `save_plots` RPC. `addOperation` takes the farm id from the parcel, so another farm's parcel is "not found", and it is idempotent on `client_id`. Also `updateOperation` and `removeOperation`.
  - Database refusals become `PlotsError` codes: `below_mapped`, `removed_but_mapped`, `no_crop_left`, `not_found`, `no_farm`, `invalid_input`, `already_saved`.
- [x] **`apps/api/src/routes/plots.ts`**, wired in `app.ts` and `server.ts`.
  - `GET /api/plots?year=` and `PUT /api/plots`. A repeat with the same `Idempotency-Key` gets the first answer from a 10-minute `ReplayCache`, keyed per user.
  - `PUT /api/plots/:id`, `POST /api/plots/operations`, `PUT` and `DELETE /api/plots/operations/:id`.
  - **Deviation:** PUT instead of PATCH, and operations at `/plots/operations/:id` rather than under the parcel. The registry's requests are POST/PUT/DELETE, CORS allows only those, and an operation id is enough on its own.
- [x] **`packages/shared/src/plots/wire.ts`:**
  - `plotToRow` sends only the keys given, so `save_plots` keeps the rest. A drawn `shape` is flattened into the polygon here, and the centroid is worked out from it.
  - `operationToRow`, and the schemas `UpdatePlotInputSchema` and `OperationPatchSchema`.
  - The `FarmPlots` type.
  - `plots/params.ts` loads `plots-params.json`.
- [x] **Registry** (`packages/shared/src/functions/plots.ts`): `save_plots`, `update_plot`, `add_operation`, `update_operation`, `remove_operation` (repeat-safe `gone`). All are `user`, so the assistant doesn't see them yet. Listed in `docs/functions.md` §7.
- [x] **Expenses:** `ExpenseInputSchema.plotId` → `repo.addExpense` → `p_plot_id`; 021 kept the parameter. An unknown parcel answers 404 `unknown_plot`. A queued expense keeps its whole input, so `plotId` survives offline.
- [x] **`web/lib/cc/plots.ts`:** `loadPlots(live, year)`, and `savePlots(live, year, plots)` with one intent key per tap, which is the review sheet's `onSave`.
- [x] **Tests:** `plots/wire.test.ts` (7) and `apps/api/src/plots.test.ts` (8). The API tests go through the registry's own request builders.
- [ ] **Sales per parcel.** `record_sale` has no `p_plot_id`; a sale is per crop for now. The money split (`plotsMoney`) divides crop sales by area.
- [ ] **`add_operation` is not in the offline queue (`QUEUEABLE`).** It only notes what happened, so it could wait offline like an expense, once the parcel card uses it.
- [ ] **No test of the expense route with `plotId`.** `app.test.ts` belongs to other in-flight work, and I didn't want to edit it.
- [x] **Migrations 020 and 021 applied to Supabase (2026-11-14).** `npm run test:integration` passes, 26 of 26. That includes a store test against the real database: reads, the same `client_id` giving the same operation, `done` without a date refused, and another farm's parcels and operations hidden or not found.

### 4. Finding parcels on the map
- `GET /api/lpis/bloc?siruta=&bloc=` → looks in `lpis_blocs` first (TR, CT). If the bloc isn't there, it asks APIA live with `where=fbid='<siruta>-<bloc>'&f=geojson&geometryPrecision=6`, caches the answer on disk for 30 days, and returns the bloc. A miss returns 404 and the client falls back. A village-level SIRUTA from the paper is mapped to its commune through `parent_siruta` before the lookup.
- `GET /api/lpis/at?lat=&lng=` → the bloc under a point (`ST_Contains`), for „Sunt aici acum” and for tapping the overlay. Only for TR and CT.
- `GET /api/siruta?county=&q=` → the commune/village search. Offline and on Ion's farm, it uses `docs/data/siruta-tr-ct.json`.
- Order for each parcel: `lpis` → farmer `coords` (paste / „Sunt aici acum”) → `approx` (centre of the SIRUTA locality, drawn dashed with „Locul e aproximativ”). A parcel is never shown with confidence somewhere it isn't.
- After a reading is saved, blocs are fetched in the background with progress per row. A failure never blocks saving.

**Step 4 status (2026-11-14): built, on APIA's live service.** The step 1b tables (`lpis_blocs`, `siruta_units`) don't exist yet, so everything asks APIA through a disk cache. Those tables will plug in behind the same `LpisSource`. Typecheck passes. Every parcel and map test passes; `npm test` has 3 failures, all in `web/lib/cc/crop-breakdown.test.ts`, from other in-flight work on `packages/shared/src/cashflow/`.
- [x] **Checked live today.** These all work:
  - `where=fbid='…'`
  - a point query (`esriGeometryPoint` + `esriSpatialRelIntersects`)
  - one county's UATs (`returnDistinctValues`): TR gives 97 and CT gives 70, matching the real numbers of communes and towns
  - a UAT's box (`returnExtentOnly`)
  - Answers: `aria_neta` is in ha, and a UAT with no blocs answers the string `"NaN"`. A cold question takes about 4 s (25 s for six); from the cache, 1 ms. The User-Agent `CropCash/1.0` is accepted.
- [x] **`packages/shared/src/plots/lpis.ts`:**
  - `lpisQueries`: every value put in a `where` is pattern-checked first.
  - `parseBlocs`, `parseCommunes`, `parseExtentCentre`: they leave out what they can't read and never guess. An answer missing its `extent` is unreadable, not "no blocs".
  - `searchCommunes` (finds names without minding diacritics), `placeParcel`, `LPIS_SERVICE_URL`.
  - Fixtures are APIA's real answers, in `plots/__fixtures__/`.
- [x] **Rule for a bloc vs. a parcel (`placeParcel`):**
  - `lpis` + `whole`: the bloc's net area is within `area_warning_pct` of the parcel's.
  - `approx` + `in_bloc`: the bloc is bigger, so it's shown as "somewhere in here", to narrow down in step 5.
  - `approx` + `in_commune`: the middle of the UAT's blocs, saved as a centroid with no outline.
  - `none` otherwise.
  - Ion's blocs: 286 is 8.54 ha for 8 ha, and 293 is 7.19 ha for 7 ha. Both are `whole`.
  - `PlotInput.centre` is new, for the rough place.
- [x] **`apps/api/src/lpis/client.ts`**, `LpisSource` over APIA:
  - A disk cache (`LPIS_CACHE_DIR`, else the system temp dir) keeps a found bloc 30 days and "no such bloc" 1 day.
  - When APIA is down, an old answer is used; with none, it answers `LpisUnavailable`, which is never cached.
  - Two identical questions at once share one request.
- [x] **`apps/api/src/routes/lpis.ts`** (signed in only), mounted in `app.ts` and `server.ts`. APIA being down gives `503 lpis_unavailable`.
  - `GET /api/lpis/bloc?siruta=&bloc=` takes the bloc as printed (`0286`).
  - `GET /api/lpis/at?lng=&lat=` answers only inside Romania.
  - `GET /api/siruta?county=&q=` and `GET /api/siruta/:siruta/centre`.
- [x] **`web/lib/cc/lpis.ts`:**
  - `locatePaperPlots` looks rows up 3 at a time, reports each row (looking, found or failed, and whether offline), and asks once per bloc or UAT.
  - Also `findBloc`, `blocsAt`, `searchUats`, `communeCentre`.
  - `web/components/plots/useLocatedRows.ts` runs the lookup while the sheet is open, and again when the internet comes back.
- [x] **Review sheet:**
  - Each row says where it was found: „Pe hartă: blocul fizic 293, cât parcela ta.” / „undeva în blocul fizic 286, care are 8,54 ha…” / „O punem aproximativ, în Măldăeni…” / „Harta APIA nu răspunde acum…”.
  - The place is saved with the parcel. A parcel already on the map keeps its own place (`placed`), since the farmer may have drawn it.
  - A bloc outline also feeds the „Verifică” match.
  - **Deviation:** the lookup runs while the sheet is open, not after saving. The farmer sees where each row lands before saving, the outlines help matching, and one save is simpler than saving and then updating each parcel. Rows still being looked up are saved without a place and can be placed later.
- [x] **Tests:**
  - `plots/lpis.test.ts` (8), `reading.test.ts` (+1), `apps/api/src/lpis.test.ts` (9: cache, stale fallback, shared requests, routes), `web/lib/cc/lpis.test.ts` (4), `PlotsReview.test.tsx` (+2).
  - The live check against APIA ran once and isn't in the suite, which stays offline.
- [ ] **Village-level SIRUTA.** If the paper has a village's code, the bloc search misses, because LPIS keys blocs by the UAT. This needs `siruta_units.commune_siruta` (step 1b). Until then, the row falls back to `in_commune`, or to `none` when that code has no blocs.
- [ ] **UAT names have no diacritics** (`Maldaeni`, as APIA writes them) until step 1b's INS list.
- [ ] **`/api/lpis/at` isn't used by any screen yet.** „Sunt aici acum” comes with step 5 or 8.
- [ ] **APIA's terms are still `DE-VERIFICAT` (question 1).** The live use is one bloc at a time, on a farmer's request, behind a cache. No bulk copying.

### 5. Drawing editor (straight + curved)
- `web/components/map/ShapeEditor.tsx`, custom on top of MapLibre. A drawing library like terra-draw has no Bézier edges.
- **Model** (`plots.shape`): a list of vertices. Each edge is `line` or `curve`, a curve having one control point (quadratic Bézier) or two (cubic). Each vertex has an optional **corner radius** for a rounded corner. `flattenShape` samples curves and corners into points for `geometry` and the area.
- **Start from:** the LPIS bloc outline („Pornește de la bloc”, the usual case: shrink it to your part), an empty map (tap to add points), or a pasted list of coordinates.
- **Tools:**
  - drag a vertex
  - tap the middle of an edge → a new vertex
  - long-press / right-click an edge → „Fă-o curbă” (control handle appears) / „Fă-o dreaptă”
  - corner → „Rotunjește colțul” with a radius slider
  - delete a vertex
  - undo / redo
  - snap to the bloc outline within 3 m
- The **live area** shows next to the declared area, with a warning above 10% difference. The LPIS overlay (`export` PNG, transparent) shows the neighbouring blocs as a guide.
- Touch: 44 px handles, two-finger pan never moves a vertex, a big „Gata” button. Keyboard: arrows nudge the selected vertex, Delete removes it.

**Step 5 status (2026-11-14): built, not yet on a screen.** Nothing opens the editor yet; `/harta` (step 8) and the parcel card (step 10) will. The editor only hands the drawing back through `onDone({ shape, geometry, areaAri })`; saving it with `update_plot` is the caller's job.
- `packages/shared/src/plots/edit.ts`: pure editing on a `Shape`:
  - start from a bloc (simplified to at most 60 corners), from points, or from pasted coordinates (`parseCoordinates`, which names the line it can't read and refuses points outside Romania; Stereo 70 isn't read yet);
  - move, nudge, insert (a curved edge is split along its curve) and delete a vertex, with at least 3 left;
  - make an edge curved or straight, and move a curve handle;
  - round a corner, capped by `maxCornerM` so it never eats a whole edge;
  - snap within 3 m, corners before edges;
  - `checkShape` gives the area, whether the edges cross, and the area warning;
  - undo/redo history.
- `web/components/map/editor-state.ts`: a reducer. A drag only previews and becomes one undo step when the finger lifts. Moving the rounding slider on one corner is a single step.
- `web/components/map/ShapeEditor.tsx`:
  - MapLibre 5.24.1 on OpenFreeMap „liberty”, loaded only in the browser, with the APIA bloc outlines as a transparent overlay (`lpisOverlayTiles`) and the bloc as a dashed guide;
  - handles are 44 px buttons with Romanian labels. An edge's „+” is hidden while the edge is under 64 px on screen and comes back when you zoom in;
  - „Gata” stays disabled while the edges cross;
  - the layout is side by side once the editor itself is at least 760 px wide (a container query, so a narrow sheet on a wide screen stays stacked).
- **Offline:** the map tiles need the internet; without it the editor says so and you can still draw on a blank background.
- **Checked in a browser** (headless Chromium, 390×844 and 1280×800) on bloc 153277-286: it starts from the bloc and shows „Desenat: 8,61 ha · Pe cerere: 8 ha”, with no console errors.
- **Not checked:** dragging on a real phone, including two-finger pan while a handle is under a finger.
- **Tests:** `edit.test.ts` (10), `editor-state.test.tsx` (5), and `ShapeEditor.test.tsx` (9) with MapLibre replaced by a fake.

### 6. Filters
- `PlotFilters` lives in the URL (`/harta?cultura=grau&recolta=2027-07..2027-08`), so a filtered view can be shared or opened from the assistant.
- **Filters:**
  - crop (multi)
  - campaign year
  - size (ha range)
  - revenue range, expenses range, result range, each switchable between total lei and lei/ha
  - treatments done (any / by kind / none yet)
  - treatments still to do (any / overdue / next 30 days)
  - sowing date range
  - expected harvest range
  - locality / bloc
  - location (pe hartă / aproximativ / fără loc)
  - land use (TA / PP…)
  - crop changed from last year (yes/no; rotation check)
- UI: a row of chips for the active filters plus a „Filtre” sheet with range sliders and date pickers, and a „7 din 12 parcele” count with „Șterge filtrele”.
- On the map, parcels outside the filter are **dimmed**, not hidden, so the farmer keeps their bearings.
- Sort by: name, size, result/ha, expenses, harvest date, next treatment.
- „Pe culturi” applies the same filters, then groups.

**Step 6 status (2026-11-14): built, not yet on a screen.** `/harta` (step 8) puts it over the list and dims the parcels it leaves out on the map (step 7).
- `packages/shared/src/plots/filters.ts` (filtering, sorting and the filter URL were already there from step 1) now also has:
  - `filterOptions(rows)`: only the choices the farm's own rows can match. Crops are ordered by area; a section with one choice is left out.
  - `PlotView` with `viewFromQuery` / `viewToQuery`: `an`, `vedere=culturi`, `ordine=suprafata-desc`. Only what differs from the default goes in the URL.
  - `withoutFilter`, `activeFilters`, and `PLOT_QUERY_KEYS`, the URL keys the page owns.
- `web/components/plots/usePlotQuery.ts`: the filters and view in the address.
  - It uses `history.replaceState`, so Back leaves the page instead of undoing a filter, and other keys in the address are kept.
  - It writes only when no sheet owns the history entry, because `useSheetHistory`'s step back would drop it; it writes again on `popstate`.
- `web/components/plots/PlotFilters.tsx`:
  - the bar: „7 din 12 parcele”, „Șterge filtrele”, „Filtre (n)”, „Pe parcele / Pe culturi”, the order, and the campaign (shown when there are two or more), plus one chip per filter with ×;
  - the „Filtre” sheet: it shows the number of parcels that match as you choose, and „Arată” is disabled when that number is 0;
  - amounts are typed the Romanian way: „1.500”, „2,5”, and „−1.500” for a loss. An unreadable amount is pointed out, never guessed; a range typed backwards is turned around.
  - Texts are in `filter-text.ts`, the form logic in `filter-form.ts`.
- **Deviations from the plan above:**
  - ranges are two boxes, „de la” and „până la”, instead of sliders: easier to hit on a phone and exact for money;
  - dates are month pickers listing only the months the farm has, instead of date pickers;
  - each order has one direction, the one a farmer means (biggest first, soonest first); a link may still ask for the other.
- **Offline:** everything is worked out on the phone from rows already loaded.
- **Checked in a browser** (headless Chromium, 390×844): chips, the sheet, and the address after each change, including after the sheet closes.
- **Tests:** 3 more in `rows.test.ts`, `filter-logic.test.tsx` (9) and `PlotFilters.test.tsx` (7).

### 7. Map component `web/components/map/`
- `FarmMap.tsx` (client-only, loaded with `next/dynamic({ ssr: false })`). Props: `plots`, `selectedIds`, `dimmedIds`, `colorBy: 'crop' | 'result' | 'nextTreatment'`, `onSelect`, `mode: 'full' | 'mini'`, `intro`.
- **Cartoon style** (`style.ts`):
  - the globe on open, then a ~2.5 s flight to Romania and on to the farm, once per session
  - warm pastel land from `color-palette-idea.jpg`, soft hillshade, terrain ×1.5, sky/fog haze
  - parcels as low extrusions coloured and patterned by crop (wheat stripes, maize dots, sunflower ring), with thick rounded outlines
  - a floating crop icon per parcel
  - clouds drifting as a CSS layer
  - the selected parcel breathes; icons bob 2 px
  - everything still under `prefers-reduced-motion` (camera moves become instant), and paused when the tab is hidden
- Toggles: „Satelit” (MapTiler), „Blocuri APIA” (LPIS overlay), colour by crop / result / next treatment.
- `flyToPlot(id)` / `fitPlots(ids)`: `fitBounds` with padding for the side list, pitch 55, 1.6 s.
- More than 50 parcels: icons switch from HTML markers to a symbol layer.

**Step 7 status (2026-11-14): built, not yet on a screen.** `/harta` (step 8) and the mini-map (step 9) will use `FarmMapLazy`.
- `web/components/map/FarmMap.tsx`:
  - props: `rows` (PlotRow), `crops`, `selectedIds`, `dimmedIds`, `colorBy`, `onSelect`, `mode`, `intro`, `names`, `today`, `soonDays`, `satelliteKey`, `padding`;
  - `ref` gives `flyToPlot(id)` and `fitPlots(ids)`: `fitBounds` with padding, pitch 55, 1.6 s, max zoom 15.5;
  - `FarmMapLazy.tsx` loads it with `next/dynamic({ ssr: false })`.
- **What a parcel looks like:**
  - a known outline is a low block (3 m, 6 m when selected) in its crop's colour and pattern, with a thick rounded outline;
  - a place known only roughly is flat with a dashed edge; a parcel placed only in its commune is a soft circle at the commune's middle, with no crop icon, since that would claim a spot we don't know;
  - dimmed parcels stay on the map, faint.
- **Crop looks** (`palette.ts`): chosen by APIA's botanical genus: wheat stripes, maize dots, sunflower ring, an emoji icon per group. A genus not listed gets a stable pastel from its id.
- **Colour by:**
  - crop;
  - result per hectare: pink for a loss, green for a gain, scaled to the farm's own biggest result, so no threshold is invented;
  - next work: overdue, within `todo_soon_days`, later, nothing.
  - The legend lists only what is on the map.
- **Style** (`style.ts`): OpenFreeMap „liberty” recoloured in the pastels of color-palette-idea.jpg, plus a farmland layer, a soft lavender hillshade, the globe and a pastel sky haze. Place names are in Romanian where the tiles have them, else in Latin letters.
- **Motion:**
  - the globe-to-farm flight takes about 2.5 s, once per session (`storageKey` in sessionStorage), and only in „full” mode;
  - clouds drift as a CSS layer, icons bob 2 px, and the selected outline breathes;
  - all of it is still under `prefers-reduced-motion` (camera moves become instant) and while the tab is hidden.
- **Icons:** up to 50, one HTML button each (44 px, labelled with the parcel's name); above that, one symbol layer drawn from canvas images.
- **Toggles:** „Blocuri APIA” (the LPIS outlines from step 5), and „Satelit” (MapTiler), shown only when `VITE_MAPTILER_KEY` is set. The key is public by design: restrict it by origin in the MapTiler dashboard. It's in `.env.example` and `publicConfig().maptilerKey`.
- **Offline:** the parcels are local data and always show. Without the base style the map gets a plain background and says „Harta are nevoie de internet”.
- **Deviations from the plan above:**
  - **No 3D terrain.** With MapLibre 5.24, terrain made `fitBounds` at a pitch land wrongly (checked in the browser), and the Teleorman plain is flat. The hillshade stays.
  - **Elevation tiles:** Mapzen Terrain Tiles on AWS Open Data, free and without a key, used only for the hillshade.
- **Checked in a browser** (headless Chromium, 1280×800 and 390×400) on Ion's real blocs 286 and 293 in Măldăeni: the globe intro, flying to a parcel, colour by result, dimmed parcels, and the mini mode.
- **Tests:** `map-logic.test.tsx` (11) and `FarmMap.test.tsx` (10), with MapLibre replaced by a fake.

### 8. Page `/harta`
- Wiring:
  - `web/app/harta/page.tsx`
  - `web/screens/harta.tsx` in `SCREENS`
  - a skeleton in `web/components/skeleton/screens.tsx`
  - `/harta` in `DEMO_PAGES` (`web/lib/paths.ts`)
  - „Harta” in `web/lib/ui/nav.ts`
  - `markReady()` once the list is drawn, not when the map loads
- Layout: desktop has the list (360 px) on the left and the map on the right; the card slides over the map's left edge. Phone: map on top, the list as a bottom sheet that drags up.
- Tabs **„Pe parcele” | „Pe culturi”**, a year picker, the filters bar.
  - **Pe parcele** row: crop icon, name or „Bloc 286 · 1a”, ha, „recoltă în ~8 luni”, next treatment, result/ha.
  - **Pe culturi** row: crop, number of parcels, total ha, expenses, revenue, result, result/ha. Clicking it highlights all its parcels and fits them on the map, then expands to the parcel list.
- **Card** (`PlotCard.tsx`):
  - header: name, crop, area, bloc
  - Sezonul: sown, expected harvest, with a small timeline
  - Lucrări: done ✓ / to do (with „Marchează făcut”, „Adaugă lucrare”)
  - Bani: expenses by category, revenue, result, lei/ha; shared amounts labelled „împărțit pe suprafață din cheltuielile pe grâu”
  - Istoric: crop per year
  - actions: „Adaugă cheltuială aici”, „Desenează / mută pe hartă”, „Arhivează”
- Selection and filters live in the URL. Back closes the card. Links go through `appHref`; saved UI state goes through `storageKey`.

**Step 8 status (2026-11-14): built.** Checked in headless Chromium at 1280×800 and 390×844 on Ion's farm (`/ferma-lui-ion/harta`).
- **Wiring:**
  - `app/harta/page.tsx` and `screens/harta.tsx` in `SCREENS`;
  - a skeleton in `skeleton/screens.tsx`;
  - `/harta` in `DEMO_PAGES`, `REACT_PAGES` and `WHOLE_FARM_PAGES`;
  - „Harta” in `TABS` (`map` icon): on the rail, and under „Mai mult” on a phone.
  - `markReady()` comes from `ReactScreen` once the farm is ready. Parcels that are still loading show their own skeleton rows inside the list.
- **Where the parcels come from** (`web/lib/cc/farm-plots.ts`, `components/plots/usePlots.ts`):
  - A farm on the server reads `GET /api/plots` and keeps the answer at `storageKey('cropcash-plots')`. Without internet the copy shows, with „Arătăm parcelele așa cum erau pe …”. A malformed answer counts as a failure and is never saved.
  - Ion's farm: his crops on his real blocs, wheat on 286 and maize on 293, with the hectares from `demo-ion.json`. Bloc 293's outline is now a fixture next to 286's (`__fixtures__/lpis-bloc-153277-293.json`, fetched once from LPIS). No work is invented; step 11 adds the demo operations and seeds them.
  - A farm only on the phone gets one unplaced parcel per crop.
  - Money comes from `me.transactions` (now with `plot_id`), or from the phone's harvest records with their harvest year.
- **Page** (`components/pages/Harta.tsx`, `styles/harta.css`):
  - the filters bar from step 6 (count, „Pe parcele | Pe culturi”, order, year);
  - **computer:** the list in a 360 px column and the map beside it, sticky. The card replaces the list and sits over the map's left edge. The map's padding leaves room for it, so a flight lands beside the card, and the legend moves out from under it.
  - **phone:** the map on top and the list or card under it. A grip button („Arată mai mult din listă”) shrinks the map.
  - Filters dim, not hide, on the map; a new filter fits the map to what's left.
  - „Pe culturi” picks a crop's parcels on the map and opens to them.
  - The open card is `?parcela=<id>` in the address. Opening it adds a history step, so Back closes it, and a link opens on that card. The map then opens on that parcel instead of the whole farm.
- **Rows** (`PlotList.tsx`, `plot-text.ts`):
  - **parcel:** crop icon, name or „Bloc 286 · parcela 1a”, crop · ha · „recoltă în ~8 luni”, the next or late work, result per hectare;
  - **crop:** parcels, ha, expenses and revenue, result and result per hectare.
- **Card** (`PlotCard.tsx`):
  - header: name, crop, area, bloc, place, land use;
  - **Sezonul:** sowing (whose month it is), the expected harvest, and a bar of how far the season has gone;
  - **Lucrări:** what's late, what's to do („Marchează făcut”), what's done ✓, and „Adaugă lucrare”, which opens the calendar's form already on this parcel (`EventSheet` gained `plotId` and `onSaved`);
  - **Bani:** each category, expenses, revenue, result and lei/ha, with shared sums said plainly („… lei sunt împărțiți pe suprafață din cheltuielile pe grâu”);
  - **Istoric:** the crop of each other year;
  - **actions:** „Adaugă cheltuială aici” (`PlotExpenseSheet`: `add_expense` with `plotId`; it may wait in the queue offline, and the queue now keeps the parcel), and „Desenează / mută pe hartă” (the step 5 editor in a sheet, saved with `update_plot` as `drawn`);
  - the unplaced hectares a crop has from onboarding offer „Pune parcelele din cererea APIA”;
  - on Ion's farm the card is read-only and says so.
- **The cerere review sheet (step 2) is now on a page:** „Adaugă parcele din cererea APIA” → `usePapers().pick` → `PlotsReview` with the LPIS lookup (`useLocatedRows`) → `save_plots`.
- **Deviations from the plan above:**
  - **No „Arhivează” yet.** `save_plots` can't archive, and the crop totals in `parcels` are rebuilt from every parcel's season, archived or not. Archiving needs an SQL change (an RPC that archives and rebuilds the totals) and a migration, so it waits for an OK.
  - **No drag gesture on the phone's list.** A button gives the list more room instead.
  - **The crop picked in „Pe culturi” isn't in the address**, only the open card is.
  - **Places show as „SIRUTA 153277”** until the SIRUTA names ship (step 1b).
  - **„Marchează făcut” and „Adaugă lucrare” need internet** (`NetButton`), because `add_operation` and `update_operation` aren't in the offline queue yet (step 11).
- **Server:** `/api/me` now selects `transactions.plot_id`, so money on a parcel counts there in full.
- **Tests:**
  - `components/pages/Harta.test.tsx` (8): the list, card, address and Back; a map click; „Pe culturi”; filters dimming; the server answer with late work, shared money and „Marchează făcut”; the offline copy; unplaced hectares;
  - `components/plots/plot-text.test.tsx` (10);
  - `pages.test.tsx` now covers `/harta` in all three modes;
  - nav and skeleton counts updated.

### 9. Mini-harta on every page
- `MiniMap.tsx` in `Frame.tsx`. Hidden on `/harta`, `/login`, `/onboarding` and the landing page. With 0 placed parcels it shows a small „Pune parcelele pe hartă” chip instead.
- Collapsed: a 56 px round button bottom-left of the main column. Open: 320×220, remembered with `storageKey('cropcash-minimap')`. MapLibre loads only on the first open.
- Shows all parcels fitted, with no intro and no clouds. A parcel click goes to `/harta?parcela=id`; the expand icon goes to `/harta`.
- On a phone it's only the button, which opens `/harta`. It must stay clear of `.ask-fab` and the bottom tabs.

**Step 9 status (2026-11-14): built.** Checked in headless Chromium at 1280×800 and 390×844 on Ion's farm.
- **`web/components/map/MiniMap.tsx`**, mounted once in `Frame.tsx`, so every framed page has it. It's left out on `/harta` (`NO_MINIMAP`). Login, onboarding and the landing page have no frame, so it isn't there either.
- **Closed:** a 56 px round button at the bottom left of the page column (`left` follows the rail: 240 px, or 208 px under 1180 px). It sits at the height of „Întreabă” (`--ask-bottom`), so on a phone both stay above the bottom tabs, one on each side. It hides while „Mai mult” is open, as „Întreabă” does.
- **Open (computer):** a 320×220 window with all parcels fitted, flat and still (`FarmMap mode="mini"`). It has „Deschide harta mare” (a link to `/harta`) and „Ascunde harta”. Open or closed is remembered at `storageKey('cropcash-minimap')`.
  - A tap on a parcel loads `/harta?parcela=<id>`: a full page load, because nothing outside a page navigates in code yet (no router in the page tests).
  - MapLibre loads only when the window first opens (`FarmMapLazy`).
- **Requests:** `usePlots(year, { fetch: false })` reads only the copy on the phone, so a page load costs no request. The parcels are fetched only when the window is open. Ion's farm and a farm only on the phone need no request.
- **No parcel on the map** (known from the copy, Ion's blocs or the phone farm): a „Pune parcelele pe hartă” chip linking to `/harta` replaces the button. With no copy yet, the button shows, and opening it fetches.
- **Phone:** only the button, a link to `/harta`.
- **Fixed on the way:** `.farm-map .fm-canvas` now has two classes. With `map.css` loaded before MapLibre's CSS (the frame imports it now), `.maplibregl-map { position: relative }` collapsed the canvas to 0 px. The credits stay, smaller in the small window (OpenStreetMap's licence).
- **Tests:** `components/map/MiniMap.test.tsx` (6):
  - Ion's farm: opens, is remembered, a parcel goes to its card, closes;
  - reopens by itself;
  - a phone gets only the link;
  - not on `/harta`;
  - fetches only once opened;
  - the chip when nothing is placed.

### 10. Expenses, sales and treatments on a parcel
- Expense / sale forms get an optional „Pe ce parcelă?” picker (none = whole crop). A treatment expense also offers „Notează și lucrarea” to create the done operation.
- Invoice reader: if the invoice is for plant protection products, propose a treatment operation on the parcel the farmer picks.
- Planned operations show in the existing calendar and notifications („Fungicid pe Bloc 286 – peste 5 zile”).

**Step 10 status (2026-11-15): built.** Checked with tests only: every part needs a farm on the server, and Ion's farm has no parcel work or parcel money yet (step 11).
- **„Pe ce parcelă?” on Recolte's record form.** It shows only for a farm on the server that has parcels. It lists the parcels in use with a season that harvest year growing the sale's crop, or the expense's crop. With no crop on an expense, it lists every sown parcel. The first option is „Toată cultura” or „Toată ferma”, which is today's behaviour. Picking comes from `plotsForCrop` (`packages/shared/src/plots/picks.ts`).
  - **Sales** now take `plotId`. It's in `SaleInputSchema`, `repo.addSale` writes `transactions.plot_id`, and the offline queue keeps it. No migration was needed, because 020 already has the column. The `(plot_id, farmer_id)` key refuses another farm's parcel, which the route answers with 404 `unknown_plot`.
  - **Expenses** already took `plotId` (step 8). Given a parcel and no crop, `record_expense` takes the crop growing there.
- **A treatment notes its work.** On „Tratamente” with a parcel picked, a box appears: „Notează și lucrarea pe parcelă”, ticked, with Erbicid / Fungicid / Insecticid and an optional product (`components/plots/TreatmentWork.tsx`). Recolte's form and „Adaugă cheltuială aici” on the card both use it.
  - Saving writes `add_expense`, then `add_operation` as done that day, with `transactionId` set to the expense's id. Each write has its own retry id.
  - If the work fails after the money is saved, the money stays saved and the form says so.
  - Without internet only the money is noted, since `add_operation` isn't queued yet (step 11), and the box says so.
- **Invoice reader.** A plant protection invoice (category `treatments`) fills the form as before. The note adds „Alege parcela pe care ai dat tratamentul și îl notăm și pe ea.”
  - The reader doesn't read product names, so the product stays for the farmer to type. Reading it would mean changing the extraction prompt and schema.
- **Reminders.** „Din calendarul tău” on Acasă lists planned parcel work that is due within `todo_soon_days` or already late (`upcomingWork`), with the late work first.
  - A row reads, for example, „Fungicid (Falcon) pe Bloc 286 · parcela 1a”, then „În 5 zile”, or „Întârziat, de acum 3 zile” in red.
  - A row opens the parcel's card on `/harta`.
  - Without internet it reads the parcels copy saved on the phone.
  - Acasă now makes one `GET /api/plots` request.
  - The calendar already showed planned work (step 4). There's no bell notification yet, because the bell has no source for it.
- **Tests:**
  - `plots/picks.test.ts` (4);
  - `components/plots/parcel-money.test.tsx` (6): a sale on a parcel, a treatment with its work linked, unticked, offline, no picker on Ion's farm, the card's sheet, and the reminders;
  - an API test for a sale on a parcel and a foreign parcel.
  - `MiniMap.test` now checks request counts on Salariu, because Acasă reads parcels now.

### 11. Demo, offline, polish
- Ion: the two Măldăeni blocs, seasons from `demo-ion.json`, and a few done/planned operations, all marked as demo assumptions (P9). `seed:demo` inserts them.
- **Offline:** plots, seasons, operations and money are in the local store, so the list, both views, the filters and the cards all work without internet. Marking a treatment done or adding a planned one can go in the outbox, because it only records work. The map draws the parcels on a plain background with „Harta are nevoie de internet” when tiles fail. The service worker keeps the last ~300 tiles viewed (cache-first, capped), so the farmer's own area usually still shows. Bloc lookup, the satellite layer and the document reader use `NetButton` with a `reason`. Drawing works offline on the cached tiles and saves through the outbox.
- Tests:
  - shared functions
  - `/harta` with the harness: list click selects and flies, URL sync, both views, filters
  - mini-map hidden on the right pages
  - RLS
  - `break-ui` worst cases: 0 / 1 / 150 parcels, no shape, self-intersecting drawing, very long names, the same bloc split into 5 parcels
- Docs: §3 and §8 in `07-architecture.md`, `app-inventory-web.md`, new entries in `11-open-questions.md`.

**Step 11 status (2026-11-15): built.** Checked with tests, typecheck and both builds, and in headless Chromium on Ion's farm at 390×844 and 1280×800 (his card, Acasă's reminder). `seed:demo` wasn't run here: it deletes and recreates the demo account and its Stripe objects, so it waits for the owner.
- **Ion's demo work** (`demo-ion.json` → `plot_work`, status `exemplu-demo`, P-H1): on wheat (bloc 286) ploughing, sowing on 10 Oct. 2026 and a herbicide done, an insecticide planned for 20 Nov. and nitrogen for 5 Mar. 2027; on maize (293) ploughing done and sowing planned for 15 Apr. 2027. No products and no sums. The wheat season's `sown_on` is the sowing day.
  - `ionPlots` adds them in the harvest year under way on `demo_start` (2027) only. So Ion's card, the map's „Lucrări de făcut”, and Acasă's „Insecticid pe Bloc 286 · În 5 zile” all show them.
  - `seed:demo` now puts his crops on the two real blocs (`PUT /api/plots` with the LPIS fixtures, which takes the hectares off the unplaced parcels), then each piece of work (`POST /api/plots/operations`). It goes through the same API routes as the phone, after the Test Clock is set.
- **Offline work.** `add_operation`, `update_operation` and `update_plot` are in `QUEUEABLE`; `add_operation` gets a `clientId` like a sale.
  - `withPendingPlotWrites` (`packages/shared/src/plots/pending.ts`) lays the queue over the parcels copy in `usePlots`. Work noted offline shows on the card at once, with „· se trimite când ai internet”. When the queue sends one, the parcels are fetched again.
  - Marking done work that is still in the queue changes the queued item (`patchQueued`). If another tab sent it meanwhile, it goes to the server's id.
  - Unblocked: „Marchează făcut”, „Adaugă lucrare”, „Desenează pe hartă”, the calendar's „Parcelă” (now reading parcels through `usePlots`, so the phone's copy works), and „Notează și lucrarea” on a treatment expense. Offline, that treatment isn't linked to its expense, because the expense has no id yet (P-H3).
- **Map without internet.** The service worker keeps the last 300 base-map pieces (OpenFreeMap tiles, letters and icons, plus the Mapzen relief): cache-first, oldest out first. The number comes from `plots-params.json` → `map_tile_cache_max` (P-H2).
  - The style comes from the network first and falls back to the copy.
  - The MapTiler satellite is never kept, because of its quota.
  - Without pieces, the step 7 fallback still draws the parcels on a plain background with „Harta are nevoie de internet”. The editor already did the same.
  - „Satelit” and „Blocuri APIA” are `NetButton`s now. The bloc lookup already said it needs internet, and the cerere reader and saving parcels from it already used `NetButton`.
- **Tests:**
  - `plots/pending.test.ts` (6);
  - outbox tests for parcel work (3);
  - service worker tile tests (5: kept, cap, unseen tile offline, style, satellite);
  - `Harta.test`: „Marchează făcut” offline;
  - `parcel-money.test`: the offline treatment is queued;
  - `plot-text.test`: Ion's work;
  - `components/plots/worst-cases.test.tsx` (6): 0, 1 and 150 parcels (with „Pe culturi”), no shape, an 80-character name, one bloc split into 5.
  - Crossed edges were already refused in `ShapeEditor.test`.
  - `tests/integration/rls.test.ts` gained „a sale or expense can't be filed on another farm's parcel”. It wasn't run here, because it needs the real Supabase.
- **Docs:** `07-architecture.md` §3 and §8 (point 6 and three rows in the offline table), `app-inventory-web.md` (DS-10–11, OP-23–24, RD-8–9, DEP-11–13, FL-15), `11-open-questions.md` P-H1–P-H3.
- **Not done:** „Arhivează” (step 8, waiting for an OK on the SQL change). `remove_operation` stays online-only.

## Open questions
1. APIA's terms for showing LPIS blocs in a third-party app, and **especially for keeping a bulk copy** (step 1b): copying two whole counties is more than looking up one farmer's bloc. The data is marked as APIA's property, so ask APIA before the import runs against production. Until then, the import goes only into a dev database.
5. ~~Is the SIRUTA release on data.gov.ro current?~~ **Answered 2026-11-15:** yes, data.gov.ro has SIRUTA s1 2026 from INS (URL in `docs/data/siruta-tr-ct.json` meta).
6. ~~How many TR/CT villages in OSM carry `ref:siruta`?~~ **Answered 2026-11-15:** none carry `ref:siruta`; OSM Romania uses `siruta:code`, and 446 of 450 villages have it. No name matching needed.
2. MapTiler free tier: confirm the monthly quota and that commercial use is allowed on the free plan. If not, use Esri ArcGIS Location Platform (free tier, key).
3. `crop-operations.json` needs a cited source per crop. Until then, „lucrări de făcut” are only what the farmer plans.
4. LPIS is published only for 2024. Blocs rarely change, but a bloc created in 2025–2026 won't be found and falls back to drawing.
