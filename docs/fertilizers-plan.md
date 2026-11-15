# Fertilizer catalogue and kg N/ha

**What for:** (1) logging what a fertilizer expense was (product + quantity, next to the money), (2) working out kg N/ha per crop and comparing it with the legal limit.

## Where the data comes from

No public database lists "every fertilizer". AMAZONE's mySpreader app has a large one, but it's built from their own spreading tests, has no public API, and copying it would break their terms and the EU database right. We don't use it. If spreader settings ever become a feature, ask AMAZONE / RAUCH for a licence.

Two layers instead:

| Layer | Table | Source | Complete? |
|---|---|---|---|
| Types (urea, CAN, UAN, DAP…) | `fertilizer_types` | Reg. (EC) 2003/2003 Annex I (repealed by (EU) 2019/1009 from 2022, still the clearest list of types) | Yes |
| Products (Nitrocalcar 27, YaraBela…) | `fertilizer_products` | Producers' datasheets, Romanian market first | No: grows over time |

Seed data: `docs/data/fertilizers.json` → `npm run seed:fertilizers` (upsert, never deletes, never touches products an editor added). Limits: `docs/data/nitrogen-limits.json`. Every row carries its source; a missing figure is `null` + `DE-VERIFICAT`.

## Units

- Nutrient contents in **basis points** (4600 = 46.00 %), whole numbers like money.
- Quantity spread: whole **kg** for solids, whole **litres** for liquids. Litres become kg with the product's `density_kg_l`; without one, N is unknown.
- N is worked out in grams, then kg N/ha = grams / (10 × ari), rounded.

## Code

- `supabase/migrations/024_fertilizers.sql`: the two tables (read by everyone, written only by the service role), `fertilizer_product_id` / `fertilizer_qty` / `fertilizer_unit` on `transactions` and `plot_operations`, `record_expense` with the fertilizer.
- `packages/shared/src/fertilizers/`: schemas, `nitrogenGrams`, `nitrogenKgPerHa`, `harvestNitrogen` (per crop, per harvest year), `nitrogenVerdict`. Only a `confirmat` limit can call a crop "over"; a crop with a record whose N is unknown is never called "ok".
- API: `GET /api/fertilizers` (catalogue + `canEdit`), `POST /api/fertilizers/products` (editors only), `POST /api/expenses` takes `fertilizer: { productId, qty, unit }` on a `fertilizer` expense.

## Who adds products

For now only the **demo account**: the API compares the sign-in email with `CATALOGUE_EDITORS` (or `DEMO_EMAIL` when unset). New products are saved `DE-VERIFICAT`, `origin = 'added'`, with `added_by`. The admin panel will replace the email list with a role and add editing and verification.

## Offline

The catalogue is reference data: the web app caches the last `GET /api/fertilizers`, so the product picker and the kg N/ha figure work without a connection. A fertilizer expense queues offline like any other expense. Adding a product to the catalogue needs a connection (`NetButton`).

## Still to do

- UI: product picker + quantity on the "Îngrășăminte" expense, kg N/ha per crop on the crop screen, an "add product" form shown only when `canEdit`.
- Fertilizing operations on parcels (`plot_operations`) use the same three columns once the parcel screens save operations.
- Organic N (manure) against the 170 kg N/ha cap: needs manure N contents, not covered yet.
