# Plan: the cerere kept in the app, parcels across farms, drawing, and Google's 3D map

Status: **plan, nothing built.** Written 2026-11-17. Decisions marked **G?** need an answer before the step that uses them (§8).
Builds on `docs/cerere-onboarding-plan.md` (reader), `docs/harta-plan.md` (plots, LPIS, editor, `/harta`) and
`docs/workspaces-plan.md` (several farms). Read those first; this plan only covers what they don't.

Four asks:
1. Upload the **Cerere unică de plată** as a document that is **kept** in the app, with its fields extracted, shown and **editable**.
2. From that data, **highlight the parcels** of one farm and **across all of the user's farms**.
3. **Draw a parcel directly on the map** (a new one, not only reshape an existing one).
4. **Replace the MapLibre map with Google's 3D map** ("Google Earth").

---

## 0. What exists today (checked 2026-11-17)

| Piece | Where | Today | Gap for this plan |
|---|---|---|---|
| Cerere reader | `apps/api/src/ai/documents.ts`, `routes/documents.ts`, `packages/shared/src/documents/index.ts` | `POST /api/documents/read`, Claude + Zod. Reads applicant (name, age from CNP, county), total area, II.A rows with SIRUTA/bloc/parcel/land use/APIA code. **"One request, nothing stored"**: the file and the reading are thrown away | Nothing is kept. No place to see or fix the reading later |
| Upload UI | `web/components/app/Papers.tsx` (`pick({accepts, pages})`, consent `cropcash-paper-ok-2`, 12 photo pages) | Used by onboarding and `/harta` | Reused as is |
| Parcels | `plots`, `plot_seasons`, `plot_operations` (020/021), `save_plots`, `GET/PUT /api/plots` | Per farm (`farmer_id`) | No link from a season back to the paper it came from |
| Review sheet | `web/components/plots/PlotsReview.tsx` + `useLocatedRows` (LPIS lookup) | Opened from `/harta` → „Adaugă parcele din cererea APIA” | Becomes the "apply to map" step of a stored cerere |
| Editor | `packages/shared/src/plots/edit.ts` (pure: vertices, line/curve edges, rounded corners, snap, undo) + `web/components/map/ShapeEditor.tsx` (MapLibre) | Opened only from a parcel's card (reshape / place an **existing** plot) | No "new parcel" entry; renderer is MapLibre |
| Map | `web/components/map/FarmMap.tsx` (+`style.ts`, `palette.ts`, `patterns.ts`, `features.ts`), `MiniMap.tsx`, `FarmMapLazy.tsx` | MapLibre 5.24 on OpenFreeMap, MapTiler satellite, LPIS overlay, service worker caches 300 tiles | Whole renderer to replace |
| Several farms | 035/036/039, `pickFarm()` + `X-Farm-Id`, `GET /api/farms`, `/ferme`, `lib/live/farms.ts` | Workspaces steps 1–4 done. **The phone holds one farm's data** (step 5 not built) | Nothing reads parcels across farms |
| Storage | — | Supabase Storage unused (only 004 for the monitor) | New bucket |

So: (1) is new storage + a new screen on top of the existing reader, (2) is one new API read + map/list changes, (3) is a new entry into the existing editor, (4) is a renderer swap behind the existing `FarmMap`/`ShapeEditor` props.

---

## 1. Keeping the cerere: storage and privacy

### 1.1 What changes in the privacy contract

Today the rule is "files are never stored; CNP never leaves the API". Keeping the paper means **the stored file contains the CNP, IBAN, address and phone**. That is the real cost of this feature, so the contract becomes:

1. **The original file is stored only if the farmer ticks it** (G1, recommended default: ticked, with plain text). Not ticked → today's behaviour: read, show, keep only the edited fields.
2. **Extracted fields never include CNP, IBAN, phone, e-mail or home address** (unchanged). They stay only inside the stored file. Age keeps coming from the CNP and is stored as `birth_year` (G2), never the CNP.
3. **Private bucket, no public URLs.** The file is downloaded only through the API, which checks the role and returns a signed URL valid **60 s**.
4. **Who sees the file:** owner only (G3). Managers see the extracted fields; workers, accountants and viewers see neither (the file has the IBAN and CNP). Same rule in the API and in storage RLS.
5. **Delete works for real:** „Șterge documentul” removes the storage objects and the row; „Șterge doar fișierul” keeps the fields. Deleting a farm deletes its documents (cascade + a storage cleanup job, §3.4).
6. Logs still carry only status codes. The reader's replay cache keeps only the normalised reading, as today.
7. Consent text in `Papers.tsx` gets a second line when storing: „Păstrăm poza/PDF-ul cererii doar pentru tine, ca s-o ai la îndemână. O poți șterge oricând.” Consent key → `cropcash-paper-ok-3`, so everyone is asked again.
8. Update `docs/07-architecture.md` (documents section) and add a GDPR line to `docs/11-open-questions.md`: retention period and whether this needs a DPIA before real farmers (G4).

### 1.2 Where files live

- Supabase Storage, private bucket **`farm-documents`**, max object size = `plan-params.json → documents.max_mb`, MIME types = the reader's `DOCUMENT_TYPES` (PDF, JPEG, PNG, WebP/HEIC if already accepted).
- Path: `{farmer_id}/{document_id}/{n}.{ext}`, one object per page/photo, original order kept.
- Storage RLS on `storage.objects` for this bucket: `select`/`insert`/`delete` only when `split_part(name,'/',1)::uuid` is a farm where `require_farm_role(farm, ['owner'])` holds. The API still does the upload with the user's token (not the service key), so RLS is the real gate.
- The phone resizes photos before upload exactly as for the reader (`Papers.tsx` already does). Upload and reading happen in **one** request so the farmer waits once (§3.1).

---

## 2. Data model — migration `0NN_farm_documents.sql` (next free number at build time; safe to run again)

```sql
-- A paper the farm keeps. Today only kind 'apia_cerere'; the kinds are the reader's DOCUMENT_KINDS so
-- decisions and invoices can be kept later without a new table.
create table if not exists farm_documents (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  kind text not null check (kind in ('apia_cerere','apia_decizie','invoice','sale_paper','other')),
  campaign_year int check (campaign_year between 2000 and 2100),
  title text,                                   -- „Cererea de plată 2026”, editable
  files jsonb not null default '[]',            -- [{path, mediaType, bytes, sha256}], empty when the file wasn't kept
  file_kept boolean not null default false,
  reading jsonb not null,                       -- what the reader returned, normalised, never edited (for "înapoi la ce s-a citit")
  reader_version text not null,                 -- prompt/schema version, so old readings can be told apart
  status text not null default 'to_check'
    check (status in ('to_check','checked','applied')),   -- applied = rows pushed to plots (§5)
  client_id uuid,                               -- one upload tap = one row (idempotent)
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farmer_id, client_id)
);
-- At most one *current* cerere per farm and year; an older one stays as history (status kept, superseded_by set).
alter table farm_documents add column if not exists superseded_by uuid references farm_documents(id);
create unique index if not exists farm_documents_one_cerere
  on farm_documents (farmer_id, campaign_year) where kind = 'apia_cerere' and superseded_by is null;

-- The cerere's header fields, as the farmer has them now (edited or not).
create table if not exists cerere_fields (
  document_id uuid primary key references farm_documents(id) on delete cascade,
  farmer_id uuid not null references farmers(id) on delete cascade,
  applicant_type text check (applicant_type in ('pf','pfa','ii','if','pj')),
  last_name text, first_name text,              -- 01/02 (or 09/10 for an administrator)
  company_name text,                            -- PFA/II/IF/PJ name, when printed
  birth_year int,                               -- from the CNP; the CNP is never stored here
  county text,                                  -- counties.json id (26, else 15)
  farm_locality_siruta int,                     -- sediul exploatației, when printed
  apia_centre text,                             -- the APIA centre the paper was filed at (G5)
  total_area_ari int,                           -- field 44
  schemes text[] not null default '{}',         -- requested scheme codes as printed (DR-xx, PD-xx), G5
  edited jsonb not null default '{}'            -- {field: true} for each field the farmer changed ("din cerere" tag goes away)
);

-- One row per II.A line, as the farmer has it now.
create table if not exists cerere_rows (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references farm_documents(id) on delete cascade,
  farmer_id uuid not null references farmers(id) on delete cascade,
  row_no int not null,                          -- Nr. crt. as printed, else reading order
  judet text, localitate text, siruta int, bloc_fizic text, parcel_no text, farmer_code text,
  land_use text,                                -- TA, PP, CP, VI…
  apia_crop_code text, crop_name text, crop_id text,   -- crop_id from crops-reference.json apia_codes
  area_ari int check (area_ari is null or area_ari > 0),
  second_crop_code text, second_area_ari int,
  plot_id uuid references plots(id) on delete set null,  -- set when applied to the map (§5)
  excluded boolean not null default false,      -- "Nu se salvează" in the review
  edited jsonb not null default '{}',
  issues text[] not null default '{}',          -- unreadable fields from readPaperPlots
  unique (document_id, row_no)
);

-- Where a season came from, so the card can say „din cererea 2026, rândul 3” and the cerere can show its parcel.
alter table plot_seasons add column if not exists source_row_id uuid references cerere_rows(id) on delete set null;

-- RLS: *_own via my_farm_ids() + require_farm_role: select for owner/manager, write for owner/manager,
-- farm_documents.files readable only through the API (owner). Grants column by column like 012/028.
-- Integrity: cerere_rows.plot_id must be a plot of the same farm (composite FK on (plot_id, farmer_id), like 020).
```

Why tables and not one jsonb blob: rows link to plots, the list is filtered/sorted, edits are per field, and RLS/constraints protect each value. `reading` keeps the untouched AI output so the farmer can always see "what the paper said" next to "what you changed".

Pure code in `packages/shared/src/documents/cerere.ts` (tested):
- `cerereFromReading(reading, data) → { fields, rows }` (reuses `normalizeReading`, `readPaperPlots`, `ageFromCnp` → birth year).
- `cerereProblems(fields, rows)`: sum of rows vs field 44, rows without bloc/SIRUTA/crop, duplicate (siruta, bloc, parcel), crop code not in `apia_codes`, land use vs crop (e.g. a cereal on `PP`). Each problem has a plain Romanian message and the row it points at.
- `CerereFieldsSchema`, `CerereRowSchema`, `CerereRowPatchSchema` (Zod; area typed the Romanian way „7,20” → 720 ari with the existing `parseAreaText`).
- `diffRowsToSeasons(rows, plots, year)` → what applying would add / change / leave (§5), same shape as `mergePaperHa`'s note.

---

## 3. API (`apps/api`)

### 3.1 Routes (`routes/farm-documents.ts`, behind `requireAuth` + `pickFarm`)

| Route | Who | What |
|---|---|---|
| `POST /api/farm-documents` | owner, manager (file kept: owner only) | Body: `{ clientId, kind: 'apia_cerere', keepFile, files[] }`. Reads with the existing `DocumentReader` (same limits, rate limit and replay cache as `/documents/read`), uploads the files if `keepFile`, inserts `farm_documents` + `cerere_fields` + `cerere_rows` in one RPC (`save_cerere_document`). Same `clientId` → same document back. If the farm already has a current cerere for that year: answer `409 cerere_exists` with its id; the client asks „Înlocuiești cererea 2026?” and resends with `replaces: id` (old one gets `superseded_by`) |
| `GET /api/farm-documents?kind=&year=` | owner, manager | List: id, kind, year, title, status, file_kept, row count, problems count |
| `GET /api/farm-documents/:id` | owner, manager | Fields + rows + `reading` + problems (computed with `cerereProblems`) |
| `GET /api/farm-documents/:id/file/:n` | owner | `{ url }`, a 60 s signed URL |
| `PUT /api/farm-documents/:id/fields` | owner, manager | Patch header fields; marks `edited` |
| `PUT /api/farm-documents/:id/rows` | owner, manager | Batch of row patches / new rows / removed rows (the farmer can add a row the reader missed). Idempotency-Key like `PUT /api/plots` |
| `POST /api/farm-documents/:id/apply` | owner, manager | Pushes the rows to plots (§5) through `save_plots`, sets `plot_id`, `source_row_id`, status `applied` |
| `DELETE /api/farm-documents/:id` (`?only=file`) | owner | Removes storage objects, then the row (or only `files`, `file_kept=false`) |

- `/api/documents/read` stays for onboarding before a farm exists. After onboarding saves the farm, the phone offers „Păstrează cererea în aplicație” and posts the same files once (no second AI read: the replay cache answers within 10 min; after that it's a re-read, G6).
- Registry entries in `packages/shared/src/functions/` (`save_cerere`, `update_cerere_fields`, `update_cerere_rows`, `apply_cerere`, `delete_document`), all `user` scope, listed in `docs/functions.md`. Field and row edits are **queueable** (they only note what the paper says); upload, apply and delete are not.

### 3.2 Reader changes (`ai/documents.ts`, `documents/index.ts`)

Small and additive:
- Add `applicant_type`, `company_name`, `apia_centre`, `schemes[]` (codes as printed) to the `apia_cerere` block, if G5 = yes. Still **never** IBAN, phone, e-mail, address, ID fermier.
- Bump `reader_version`. Fixtures + tests that the response and the stored rows contain no 13-digit CNP and no IBAN pattern (`RO\d{2}[A-Z]{4}…`).

### 3.3 Several farms in the API

- Every route takes the farm from `X-Farm-Id` (workspaces step 3). A document can't be moved between farms.
- `GET /api/plots/all?year=` (new, §6): plots + this year's seasons for **every farm I'm on with a role that sees plots** (owner, manager, worker per the workspaces role table), each tagged `{ farmId, farmName, role }`. Money (`plotsMoney`) only for farms where the role sees money. One query per farm through the existing `PlotStore.list`, in parallel, capped (G7: max farms on the overview, recommended 20).

### 3.4 Clean-up

A storage object without a row (upload succeeded, insert failed) is removed by the same request on failure, and by a daily sweep (`scripts/` or the existing VPS pm2 cron) that deletes objects under `farm-documents/` with no matching `files` entry older than 24 h. Farm deletion: the sweep also removes folders whose `farmer_id` no longer exists.

---

## 4. Web: the stored cerere and its editable fields

### 4.1 Where it lives

- New screen **`/documente`** („Hârtiile fermei”), in `SCREENS` + skeleton + nav under „Mai mult” (phone) and the rail (computer). `/documente?doc=<id>` opens one. Ion's farm gets a read-only demo cerere built from `demo-ion.json` (fake names, his two real blocs), never a real person's paper.
- Entry points: `/documente` → „Încarcă cererea de plată”; `/harta` → „Adaugă parcele din cererea APIA” now creates a stored document first, then opens the review; onboarding → after save, „Păstrează cererea” (§3.1); a parcel card → „Din cererea 2026, rândul 3” links to the row.

### 4.2 The cerere screen (`components/pages/Documente.tsx`, `components/documents/CerereView.tsx`)

Top to bottom, phone first:
1. **Header:** „Cererea de plată 2026 · verificată / de verificat / pusă pe hartă”, the file thumbnails (owner only; tap opens a signed URL in a viewer sheet with zoom; a PDF opens in the browser's viewer).
2. **Problems first** (from `cerereProblems`): „Rândurile fac 12,40 ha, pe hârtie scrie 15,20 ha. Poate lipsește o pagină.” Each problem scrolls to its row.
3. **Despre tine** (header fields): each field is an inline editable value with a small „din cerere” tag that disappears when edited, and „Vezi ce scria pe hârtie” showing `reading`'s value. Name, type of applicant, county, locality of the farm, birth year, total area, schemes.
4. **Parcelele declarate (II.A):** one card per row on a phone, a table on a computer (bloc · parcelă · cultură · cod · ha · folosință · loc pe hartă). Tap a row → `ItemSheet` with every column editable, crop picked from the APIA code list (`crops-reference.json` names, shown as at APIA), area typed the Romanian way. „Adaugă un rând” and „Scoate rândul” (soft: `excluded`). Rows with `issues` are tinted and say which field couldn't be read.
5. **Footer actions:** „Am verificat” (status `checked`), „Pune pe hartă” (§5), „Citește din nou” (re-run the reader on the kept file, shows a diff, never overwrites edited fields without asking), „Șterge”.

Editing rules:
- Save per field on blur/„Gata”, through the registry (queueable). Offline: edits queue with „· se trimite când ai internet”; upload, file view, apply and delete use `NetButton` with a `reason`.
- The draft of the screen lives under `storageKey('cropcash-cerere-<id>')`; the server copy is cached like `cropcash-plots`.
- Money/area rules: areas stored as integer ari, never floats; nothing hardcoded (thresholds in `plan-params.json`).

### 4.3 Tests

- shared: `cerere.test.ts` (from reading, problems, row patch parsing, diff), CNP/IBAN never in output.
- API: `farm-documents.test.ts` (roles: owner/manager/worker/stranger, idempotent upload, `cerere_exists`, signed URL only for owner, delete removes objects — storage faked).
- integration: RLS on the three tables and on `storage.objects` for the bucket (another farm's path refused).
- web: `Documente.test.tsx` (edit a field → tag goes, offline edit queued, problem scroll, re-read diff), `pages.test.tsx` in all three modes.

---

## 5. From the cerere to the parcels

„Pune pe hartă” reuses what's built, with the stored rows as input instead of a throw-away reading:

1. Build `PaperPlot[]` from `cerere_rows` (not excluded) → open the existing **`PlotsReview`** sheet with `useLocatedRows` (LPIS lookup, „Parcelă nouă / Aceeași ca înainte / Verifică”).
2. Save → `POST /api/farm-documents/:id/apply` → `save_plots`, then `cerere_rows.plot_id` and `plot_seasons.source_row_id` set in the same RPC.
3. **After applying, an edit to a row is not silently pushed to the map.** The row shows „Diferă de parcelă: pe hartă 7 ha, în cerere 7,20 ha” with „Actualizează parcela” (one `update_plot` / season change) — same "nothing changes without the farmer seeing it" rule as `mergePaperHa`. (G8: recommended. The alternative, auto-sync, surprises a farmer who drew a smaller shape on purpose.)
4. A parcel card shows its source row; a parcel drawn by hand with no row says „Nu e pe cererea 2026”, and the cerere screen lists „Parcele de pe hartă care nu sunt în cerere” — the cross-check APIA itself will do, so it's worth surfacing before the farmer files the next one.

---

## 6. Highlighting parcels per farm and across all farms

### 6.1 Per farm (the open farm)

Already mostly there on `/harta`: one farm's parcels, filters dim the rest, „Pe culturi” selects a crop's parcels. Add:
- Filter **„Din cerere”**: in the cerere / drawn by hand / in the cerere but not placed (from `source_row_id`).
- From the cerere screen, „Arată pe hartă” on a row or on the whole cerere → `/harta?parcela=` / `?cerere=<id>` selects those parcels and fits them.

### 6.2 Across all farms

- `/harta` gets a scope switch at the top, shown only with 2+ farms: **„Ferma asta” | „Toate fermele”** (`?ferme=toate` in the URL).
- „Toate fermele” reads `GET /api/plots/all`. Each farm gets a **stable colour** (from its id, like `palette.ts` does for unknown crops) used for the outline; the crop colour stays as the fill, so both readings survive.
- The list groups by farm: farm header (name, parcels, ha, role) → its parcels. Farm chips above the list: tapping a chip **highlights that farm's parcels and dims the others** (same dim mechanism as filters) and fits the map to them. Multi-select allowed.
- The filters bar keeps working across farms (crop, year, size, work…); a new **„Ferma”** filter section appears with 2+ farms.
- A parcel of another farm opens its card **read-only** with „Deschide ferma X” (switches the open farm through `lib/live/farms.ts`, which already handles the outbox wait).
- Totals per farm and overall in „Pe culturi”: „Grâu: 23 ha în 3 ferme”.
- Mini-map: still only the open farm (keeps it cheap and unambiguous about where a tap writes).

### 6.3 Offline and storage

The phone holds one farm until workspaces step 5. The overview is therefore **read-only and online-first**: the last answer of `/api/plots/all` is kept under a **user-level** key (not a farm key: `storageKey('cropcash-all-plots')` scoped by user id), shown offline with „Arătăm fermele așa cum erau pe …”. Nothing is ever written from the overview, so the "wrong farm" risk from the workspaces plan doesn't apply.

### 6.4 Tests

`plots/all.test.ts` (grouping, farm colours stable, roles strip money), API roles test for `/plots/all` (a viewer-only farm left out, a worker's farm without money), `Harta.test.tsx` (scope switch, chip highlight dims others, other farm's card read-only, offline copy).

---

## 7. Drawing a parcel directly on the map

### 7.1 New entry point

`/harta` gets **„Desenează o parcelă”** (map toolbar and the empty state). Flow:
1. **Where to start** (one sheet, three choices):
   - „Atinge blocul pe hartă”: tap the map → `GET /api/lpis/at` → start from that bloc's outline (the usual case; already supported by `edit.ts` `fromBloc`).
   - „Sunt aici acum”: GPS → same as above (permission asked only on tap).
   - „Desenez de la zero”: tap points; or „Lipesc coordonate” (`parseCoordinates`, exists).
2. **Draw** in the editor (all existing tools: drag, insert, curve, rounded corner, snap 3 m, undo/redo, live area, crossed edges block „Gata”).
3. **Details sheet:** crop (APIA list), campaign year, name (optional), area prefilled from the drawing (editable; warning above `area_warning_pct`), land use. „Salvează parcela”.
4. Save through `save_plots` with `geometry_source: 'drawn'`. If the crop has unplaced hectares from onboarding, `absorbPlaced` takes them, and the sheet says so: „Am luat 3 ha din porumbul fără loc pe hartă.”
5. Optional: „Leagă de un rând din cerere” when a stored cerere has an unplaced row with the same bloc/crop.

Also: **„Împarte parcela”** on a card (one bloc farmed as two crops): draw a cut line → two shapes → two plots with the area split (pure `splitShape(shape, line)` in `edit.ts`, tested). Lower priority (G9).

Offline: drawing works on a blank background (existing fallback) and `update_plot`/new plot saves go through the outbox (`save_plots` for a single new plot needs to become queueable with a `clientId`; it only notes land the farmer already has).

### 7.2 Tests

`edit.test.ts` (+split), `Harta.test.tsx` (new parcel flow, absorbing unplaced ha, offline queued), `worst-cases.test.tsx` (a drawn parcel of 0,01 ha, a 200-vertex shape).

---

## 8. Replacing the map with Google's 3D map

### 8.1 What "Google Earth" can mean in a web app

There's no embeddable Google Earth (the old Earth API was shut down in 2015). The official route is **Google Maps Platform**:
- **Maps JavaScript API — 3D Maps** (`importLibrary('maps3d')`: `Map3DElement` / `<gmp-map-3d>`, `Polygon3DElement`, `Polygon3DInteractiveElement`, `Marker3DInteractiveElement`, `flyCameraTo`, `flyCameraAround`). Globe, photorealistic 3D where Google has it, satellite on terrain elsewhere (rural Teleorman/Constanța will mostly be satellite on terrain, which is exactly what a farmer recognises).
- **Maps JavaScript API — 2D** (`google.maps.Map` with `mapTypeId: 'satellite' | 'hybrid'`, `Polygon`, `AdvancedMarkerElement` with `gmpDraggable`).

Two hard facts shape the design:
1. The 3D API draws polygons and handles clicks, but has **no vertex editing / dragging** of shapes.
2. The 2D **Drawing Library is deprecated** (Aug 2025) and slated for removal around May 2026, so it must not be used. Our editor never used a drawing library anyway: `edit.ts` is our own model, so only its renderer changes.

### 8.2 Recommended design (G10)

| Mode | Renderer | Why |
|---|---|---|
| **View** (`/harta`, intro flight, highlight, per farm / all farms) | `Map3DElement`, parcels as `Polygon3DInteractiveElement` clamped to ground (`altitudeMode: 'CLAMP_TO_GROUND'`), selected parcel extruded a few metres; crop icons as `Marker3DInteractiveElement` | The "Google Earth" feel: globe → Romania → the farm, tilt and orbit around a parcel |
| **Draw / edit** (`ShapeEditor`) | 2D `google.maps.Map`, `mapTypeId: 'hybrid'`, tilt 0, heading 0 | Exact, top-down, drag works; handles are `AdvancedMarkerElement`s with `gmpDraggable`, the preview is a `google.maps.Polygon`, all state still in `editor-state.ts` + `edit.ts` |
| **Mini-map** | 2D `google.maps.Map`, satellite, no controls | 3D in a 320×220 corner is heavy and adds nothing |

Implementation plan:
- `web/components/map/google/loader.ts`: one `@googlemaps/js-api-loader` (`setOptions({ key, v: 'weekly', language: 'ro', region: 'RO' })`), `importLibrary('maps' | 'maps3d' | 'marker')`, loaded only in the browser and only when a map opens (as MapLibre is now).
- **Keep the public props** of `FarmMap` (`rows`, `selectedIds`, `dimmedIds`, `colorBy`, `onSelect`, `mode`, `intro`, `ref.flyToPlot/fitPlots`) and of `ShapeEditor` (`onDone({shape, geometry, areaAri})`). `Harta.tsx`, `MiniMap.tsx`, `PlotCard`, the tests' fakes barely change.
  - `FarmMap3D.tsx` (view) and `FarmMap2D.tsx` (mini), chosen by `mode`.
  - `ShapeEditorGoogle.tsx` reusing `editor-state.ts` untouched.
  - `palette.ts` / `features.ts` stay (crop colours, colour by result/next work). Patterns (wheat stripes, maize dots) don't exist on 3D polygons: crop is shown by **fill colour + icon**; the pattern stays in the list/legend (G11).
- **Camera:** `fitPlots` = bbox → centre + range computed from the bbox diagonal (`flyCameraTo({ endCamera: { center, range, tilt: 55 } , durationMillis: 1600 })`); the globe intro = start at range ~8,000 km then `flyCameraTo` the farm, once per session, skipped under `prefers-reduced-motion`.
- **LPIS overlay („Blocuri APIA”):** 2D: `ImageMapType` over the APIA `export` PNG (as today). 3D: blocs near the farm fetched as GeoJSON (`/api/lpis/at`-style envelope query, max 1,000) and drawn as thin outline polylines, only from close range.
- **Dimming:** lower fill/stroke opacity on dimmed parcels; selected = brighter outline + extrusion.
- **Key and billing:** `NEXT_PUBLIC_GOOGLE_MAPS_KEY` in `.env.example` and `publicConfig().googleMapsKey`; restricted by **HTTP referrer** (Netlify domain, `localhost:5173`) and to Maps JavaScript API only; a **Map ID** (needed for Advanced Markers and 3D) in `publicConfig().googleMapId`. Pricing/free quota per SKU (Dynamic Maps, 3D Maps) goes into `docs/data/plan-params.json → maps` with source and `DE-VERIFICAT` until checked on the official pricing page; set a **budget alert and a daily quota cap** in the Cloud console before any public demo (G12). No key → the map shows the plain-background fallback that exists today, and the list keeps working.
- **Ion's farm / demo:** loads the same Google map (it's public data on a public page). If the key's quota is a worry for the pitch, `intro` only on demand.

### 8.3 Things that must go or change

| Today | With Google |
|---|---|
| Service worker caches 300 OpenFreeMap/Mapzen tiles (`map_tile_cache_max`) | **Remove for Google tiles**: the Google Maps Platform terms don't allow caching its tiles. Offline = parcels on a plain background with „Harta are nevoie de internet” (already built). Update the SW tests and `07-architecture.md` §8 |
| MapTiler key, „Satelit” toggle, `satelliteTiles` | Gone: Google is satellite by default. Optional „Hartă / Satelit” toggle in 2D (`roadmap` vs `hybrid`) |
| OpenFreeMap cartoon style (`style.ts`), clouds, hillshade | Gone in the main map (Google's imagery can't be restyled). Keep the cartoon look only for the landing page if wanted (G11) |
| `maplibre-gl` dependency | Removed once everything is ported (step G4 below), so it's not shipped twice |
| `© OpenStreetMap` attribution | Google's attribution is drawn by the API and must stay visible; keep OSM only if SIRUTA/OSM-derived labels are shown on the map |

### 8.4 Risks

| Risk | What we do |
|---|---|
| 3D is heavy on Ion's cheap phone | Feature-detect WebGL2 + `navigator.deviceMemory`; under the threshold (in `plan-params.json`) `/harta` uses the 2D map. A „Vedere 3D” toggle either way |
| Costs grow with every page load (mini-map on every page) | Mini-map loads Google only when opened (already lazy); budget alert + quota cap; params in `plan-params.json` |
| Dragging handles fights map panning on touch | Keep today's rules: 44 px handles, `gestureHandling: 'greedy'` off while a handle is held; test on a real phone (still unchecked today) |
| Google terms: overlaying non-Google data | Our own parcels and APIA blocs on top of a Google map are allowed; don't mix Google tiles into a non-Google renderer (so no "Google tiles inside MapLibre" shortcut through the Maps JS key) |
| Photorealistic 3D missing in rural Romania | Expected; satellite on terrain still gives the Earth view. Nothing depends on the mesh |

---

## 9. Steps, in order

Each step: `npm test` green → tick it here → one status line. `npm run test:integration` for steps with SQL. No commits unless asked. Migrations to Supabase cloud only after the owner's OK.

| # | Step | Touches | Done when |
|---|---|---|---|
| 0 | Answer G1–G12 | this doc | decisions written in §10 |
| 1 | **Shared**: `documents/cerere.ts` (from reading, problems, row patches, diff to seasons), schemas, tests. *Built 2026-11-17. `cerereFromExtraction` (runs in the API, where the CNP is; returns reading + fields + rows), `withIssues`, `applyFieldsPatch` / `applyRowChanges` (all-or-nothing; a new APIA code brings its crop and name; an unknown row number adds a row, which needs an area), `rowChangeFromForm` (Romanian typing), `cerereProblems` (codes only; the texts go in `web/` with step 4), `rowsToPaperPlots`, `cerereVsPlots` (same / differs / plot_gone / not_applied + `notInCerere`), `tidySchemes`, Zod `CerereFieldsPatchSchema`, `CerereRowsInputSchema`. Extraction schema got optional `applicant_type`, `company_name`, `apia_centre`, `schemes`, `second_crop_code`, `second_area` (the prompt isn't changed until step 3). `birthDateFromCnp` split out of `ageFromCnp`. Changed from the plan: `rowNo` is reading order 1…n, not the printed Nr. crt., so it's always unique. **Found and fixed on the way:** the reader's rows could carry a CNP/IBAN the AI put in the wrong box (farmer code, locality, crop name), also through today's `/documents/read`. `hasPersonalNumber`/`containsPersonalNumbers` (in `documents/index.ts`) now null those in `readPaperPlots` and `normalizeReading`. Tests: `documents/cerere.test.ts` (41). Built on the G2/G5 recommendations (birth year kept; extra header fields); revisit if those answers differ.* | `packages/shared` | tests incl. "no CNP/IBAN in output" |
| 2 | **DB**: `farm_documents`, `cerere_fields`, `cerere_rows`, `plot_seasons.source_row_id`, `save_cerere_document` / `apply_cerere` RPCs, bucket + storage RLS. *Written 2026-11-17. **Applied to Supabase on 2026-11-18** (with docs/apia-documents-autofill-plan.md step 3); its integration tests pass after migration 047 (a stale edit hung: 40001 → PT409). `supabase/migrations/041_farm_documents.sql`: the three tables (select for owner/manager via `my_farmer_ids()`, no insert/update/delete grants: writes only through the functions), `save_cerere_document` (idempotent on client id; `23505 cerere_exists`, detail = current id; `p_replaces` keeps the old one as history), `update_cerere` (writes header and/or rows on the version read, else `40001 stale`; sets `checked`, never `applied`; never takes `plot_id`), `apply_cerere` (through `save_plots`, then links rows ↔ seasons, status `applied`), `delete_farm_document` (owner; whole paper or only files; returns the storage paths), `has_personal_number()` as check constraints on the reading and every text column (a second guard behind the API), private bucket `farm-documents` with owner-only select/insert/delete on `<farm id>/…`. Changed from the plan: `version` column for the stale check; issues aren't stored (worked out by `withIssues`); bucket size limit left to the API (`plan-params.json`), so no number sits in SQL; the CNP check ignores spaces and dots but not dashes (in `documents/index.ts` too), so a bloc id never looks like a CNP. **Checked on PGlite** (Postgres 17, all 41 migrations except 034/PostGIS, 041 run twice, stand-ins for `auth` and `storage`): 50 checks pass — roles (owner/manager/worker/stranger) on every function, replace and history, stale writes, CNP/IBAN refused, apply + crop totals, deleting brings the replaced paper back, storage folder rules, farm deletion. One bug found and fixed there (deleting a replacing paper briefly made two current cereri). The harness is in the session scratchpad, not the repo. `tests/integration/farm-documents.test.ts` (10 tests, incl. Storage upload/download/signed URL per role and the public URL refused) is written and not run.* | migration `041` | PGlite run + integration RLS tests (incl. storage path of another farm refused) |
| 3 | **API**: `routes/farm-documents.ts`, upload + read in one call, signed URLs, delete + sweep, registry entries; reader additions (G5). *Built 2026-11-17; runs against migration 041, which isn't applied yet, so only the unit tests (fake store) have run. Routes: `POST /api/farm-documents` (owner keeps the file, refused for a manager **before** the paid reading; any other paper → 422 `not_a_cerere`; pages go to `<farm>/<client id>/<n>.<ext>` with sha256, and are removed again if the save is refused), `GET /api/farm-documents[?kind&year]`, `GET /:id` (fields, rows with issues, problems; never storage paths), `GET /:id/files/:n` (owner, signed link for `documents.file_link_seconds`), `PUT /:id`, `POST /:id/apply` (Idempotency-Key), `DELETE /:id[?only=files]` (owner). `ai/paper-reads.ts`: the daily limit and the 10-minute cache are now shared by `/documents/read` and the upload, so a cerere read at onboarding and then kept is paid once; a reading with a CNP/IBAN is refused there as a last check. `db/farm-documents.ts` (`DocumentsError` codes), `documents/cerere-wire.ts` (input schemas, DB-row converters, `CerereView`), registry `keep_cerere`, `edit_cerere`, `apply_cerere`, `delete_document` (`docs/functions.md` §7). Prompt: applicant type, company name, APIA centre, schemes, and the secondary crop on its parcel's row (it used to be ignored). `plan-params.json → documents`: `file_link_seconds` 60, `orphan_file_hours` 24. `npm run documents:sweep` (`scripts/sweep-documents.ts`) removes old pages no paper lists. Changed from the plan: one `PUT /:id` instead of separate fields/rows routes, taking **only the changes** and applying them on the newest copy (retried up to 3 times on `stale`), so the phone never sends a version and a queued edit can't undo someone else's. Tests: `farm-documents.test.ts` (19) and `farm-documents-sweep.test.ts` (1). Not done: the sweep isn't scheduled on the VPS yet (pm2 cron needs `tsx` there, or a built script; decide at deploy).* | `apps/api`, `functions/` | `farm-documents.test.ts` roles matrix, idempotency, `cerere_exists` |
| 4 | **Web `/documente`**: list, cerere view, editable fields and rows, problems, file viewer, offline edits queued. *Built 2026-11-17; the farm side waits for migration 041, so it is tested with a fake API (`Documente.test.tsx`, 9) and seen in a browser only on Ion's farm (390×844 and 1280×800, no sideways scroll). `/documente` („Hârtii” under „Mai mult” and on the rail), `?doc=<id>` opens one, Back returns to the list. Upload: `keep_cerere` with „Păstrează și pozele cererii” ticked by default for the owner (G1 as recommended; a manager keeps only the fields); a second cerere for the year offers „Pune-o în locul celei vechi” and resends the same pages (`replaces`). Problems first, each row problem scrolls to its row; fields save on leaving them, rows in a sheet (add, „Scoate rândul”); every change is checked on the phone with the same shared rules first, so a CNP or a bad county is refused before sending. `edit_cerere` is queueable (`QUEUEABLE`): offline, a fix shows at once on the copy (`withQueuedEdits`) with „se trimit când ai internet”, and the cerere is fetched again once it is sent. The list and each cerere are kept on the phone (`cropcash-documents`, `cropcash-cerere-<id>`, through `storageKey`, cleared on sign-out). Pages open through the one-minute link in a sheet (PDF in a new tab); delete and „Șterge doar pozele” ask in place, no browser dialog. Ion's farm: an example cerere from his two real blocs, only to look at. `Papers` gained `collect` and `whileReading` (`pick` uses them). Not done here: „Citește din nou” (needs an API route that re-reads the kept file; later), „Pune pe hartă”, the /harta and onboarding entry points and the parcel card link (step 5).* | `web/` | `Documente.test.tsx`, pages test, headless check 390×844 + 1280×800 |
| 5 | **Cerere → map**: apply through `PlotsReview`, row ↔ parcel links, „Diferă de parcelă”, „Din cerere” filter, `/harta?cerere=`. *Built 2026-11-17, on the web side only (the API's `apply_cerere` is step 3); like steps 2–4 it waits for migration 041, so it is tested with a fake API. **/documente:** „Pune pe hartă” opens `PlotsReview` with the rows not on the map yet (`rowsToPaperPlots`, LPIS lookup as before) and saves through `apply_cerere` with each row's number (`PlotsReview.onSave` now also gives the paper rows); a parcel already on the map with the same crop keeps its sowing and harvest days and second crop (`keepSeasonDetails`: `save_plots` replaces the whole season, so before this a paper would have wiped them). Each row says „pe hartă”, „parcela nu mai e pe hartă”, or „Diferă de parcelă: pe hartă 5 ha, în cerere 8 ha” with „Actualizează parcela” (`update_plot` with `seasonFromRow`, keeping the days when the crop stays; queueable). Nothing is changed on the map by an edit alone (G8 as recommended). „Parcele de pe hartă care nu sunt în cerere” lists the year's parcels no row points at, each linking to its card; „Vezi parcelele pe hartă” opens `/harta?cerere=<id>&an=<year>`. **/harta:** „Adaugă parcele din cererea APIA” now keeps the cerere first (`useKeepCerere`, shared with /documente; the owner is asked „Păstrăm și pozele cererii?” each time, G1) and puts it on the map through `apply_cerere`; when the year already has one it offers „Folosește cererea păstrată” (its rows not on the map yet) or replacing it. The open card says „Din cererea 2027, rândul 3” or „Nu e pe cererea 2027”, linking to the cerere. Chips „Toate / Din cererea 2027 / Nu sunt în cerere” filter the list and map, kept in the address as `?cerere=da|nu` (a cerere id from /documente counts as „da”). `useYearCerere` finds the year's current cerere (API, else the copies /documente keeps); Ion's farm uses his example. Tests: `cerere.test.ts` +3, `Documente.test.tsx` +3, `Harta.test.tsx` +3. Not done: the „Din cerere” choice isn't in the filter sheet (`PlotFilters`) or the assistant's filter words, only the chips; the card link opens the cerere but doesn't scroll to the row.* | web + API | `Harta.test.tsx`, cerere tests |
| 6 | **All farms**: `GET /api/plots/all`, scope switch, farm colours, chips highlight, read-only foreign card, offline copy. *Built 2026-11-17. Needs no migration (the parcels' tables and RLS are there already). **API:** `GET /api/plots/all?year=` reads every farm the person runs (owner, manager: the roles the parcels' RLS lets read them; a worker's or accountant's farm is left out), the open one (X-Farm-Id) first then by name, at most `plots-params.json` `overview_max_farms` (G7: 20, as recommended), answering `{farms: [{farmId, farmName, county, role, plots}], more}`. A farm that can't be read just then is left out instead of failing the rest. No money on the overview at all, rather than per role: each farm's money stays on its own page. **Web:** with 2+ farms run (from the farm list saved on the phone), /harta shows „Ferma asta | Toate fermele” (`?ferme=toate`). The overview (`components/plots/AllFarms.tsx`) draws every farm's parcels on one map, each farm's outline in its own colour (`farmInks`: from the farm id, the next free colour on a clash, so two farms never share one while colours last) with the crop colour still the fill. Farm chips (several at once) bring a farm forward, fade the rest and fit the map; the list groups by farm (name, parcels, ha, role); „Culturile, pe toate fermele” says „Grâu comun de toamnă: 12 ha în 2 ferme”. The filters bar works across the farms. A parcel opens its card read only (`CardWrites 'read'`), saying whose farm it is, with „Deschide ferma X” (switches the open farm and opens that parcel on /harta; offline only if the phone holds that farm) or, for the open farm, „Deschide fișa întreagă”. Offline: the last answer is kept under `cropcash-all-plots`, a person-level key (not a farm's; cleared on sign-out), shown with „Arătăm fermele așa cum erau pe …”. Mini-map unchanged. Tests: `plots/all.test.ts` (4), `plots-all.test.ts` API (4), `farm-inks.test.tsx` (2), `Harta.test.tsx` +5. Not done: a „Ferma” section in the filters sheet (the chips do that job); the chips' choice isn't kept in the address; the „Din cerere” filter (§6.1) stays per farm, not on the overview. Not browser-checked: it needs an account running two farms.* |
| 7 | **Draw a new parcel**: entry, start sheet (tap bloc / GPS / zero / coords), details sheet, absorb unplaced ha, queueable single-plot save; split later (G9) | web + shared | §7.2 tests — on MapLibre first, so it ships before the swap. *Built 2026-11-17, on MapLibre. **Entry:** „Desenează o parcelă” in /harta's header and in the empty list (owner/manager on the server; not on Ion's farm). **Start** (one sheet): „Atinge blocul pe hartă” (the map's next tap gives a point, `FarmMap.onPoint`; a bar says what to do and offers „Desenez de la zero” / „Renunță”; `GET /api/lpis/at`, the first bloc found; none → „Aici nu e niciun bloc APIA…” and it waits for another tap), „Sunt pe teren acum” (GPS asked only on that tap; a refusal or no fix says what else to do; no bloc there → drawing from that spot), „Desenez de la zero” (near the farm's parcels: new `ShapeEditor.start`). Both bloc choices need internet (NetButton); from zero works offline on the plain background. Coordinates: the editor's own „Lipesc coordonate”. **Draw:** the existing editor, every tool; „Înapoi la desen” from the details keeps the drawing. **Details:** crop (the year's crops first, then all, APIA code from the crop), area prefilled from the drawing (editable; a note above `area_warning_pct`), harvest year (the years on the map plus next), name (optional), land use (the bloc's, else TA). „Luăm 3 ha din porumb fără loc pe hartă.” before saving (`unplacedTaken`, plan year only), „Am pus parcela pe hartă. Am luat 3 ha …” after; the new card opens. **Save:** `save_plots` with one parcel, `geometrySource: 'drawn'`, the bloc's SIRUTA/bloc/fbid/village when started from one (`drawnPlotInput`). The server takes the unplaced hectares inside save_plots (as since 020). **Offline:** `save_plots` is queueable now; the parcel carries an id made on the phone. **Migration `044_plot_client_id.sql`** (written, not applied; needs the owner's OK like 041) lets save_plots make a parcel with an id no parcel has yet, so a save sent twice is one parcel. Until 044 is applied, a drawn parcel saves online but one queued offline is refused when sent (unknown parcel). While queued it shows on the map and list at once, with the crop's unplaced hectares already shrunk (`withPendingPlotWrites` handles `save_plots` with an id). All sheets of the flow are one `Sheet` whose content changes: two sheets swapping fought over the Back history and the closing one ended the flow. Tests: `draw.test.ts` (4, incl. 0,01 ha and 200 corners), `harta-draw.test.tsx` (4: bloc tap → draw → details → save with the bloc and the taken hectares; no bloc; GPS refused; offline from zero → queued → card open), `outbox.test.ts` updated. Not done: „Leagă de un rând din cerere” (5, optional), „Împarte parcela” (G9: later), several blocs under one tap (the first is taken), not browser-checked (needs a signed-in farm; MapLibre doesn't run in tests).* |
| G1 | **Google loader + key/Map ID config**, `plan-params.json → maps`, budget alert set *Built 2026-11-17, without a key. Env names follow the repo: `VITE_GOOGLE_MAPS_KEY` + `VITE_GOOGLE_MAP_ID` (both needed). Params in `plots-params.json` (`map_3d_min_memory_gb`, `google_maps_cost` null, DE-VERIFICAT, open question 32), not `plan-params.json`. Budget alert: owner's task (G12). `loader-geo.test.tsx`.* | web, `.env.example` | no key → fallback works; key → map loads on localhost |
| G2 | **`FarmMap3D` + `FarmMap2D`** behind today's `FarmMap` props; highlight, dim, colour by, fly/fit, intro, LPIS outlines; low-end fallback to 2D *Built 2026-11-17 as one `google/FarmMapGoogle.tsx` (3D when the phone can, „Vedere 3D” toggle, 2D otherwise and for the mini-map), loaded through `FarmMapLazy`. LPIS overlay on 2D only. Tested against `google/fake-google.ts` (`FarmMapGoogle.test.tsx`, 9 tests); the headless check on Ion's blocs waits for a key.* | `web/components/map/google/` | `FarmMap.test.tsx` with a fake `google.maps`; headless check on Ion's blocs |
| G3 | **`ShapeEditorGoogle`** on 2D hybrid, reusing `editor-state.ts`; all editor tests green against the new renderer *Built 2026-11-17: the editor now draws through an `EditorSurface` (`map/editor-surface.ts` MapLibre, `google/editor-surface.ts` Google 2D hybrid with AdvancedMarker handles; the map holds still while a handle is dragged). `ShapeEditor.test.tsx` unchanged and green; `ShapeEditorGoogle.test.tsx` (4). Manual drag test waits for a key.* | map | `ShapeEditor.test.tsx` ported; manual drag test on a real phone |
| G4 | **Remove MapLibre/MapTiler/OpenFreeMap**, SW tile cache for Google off, docs (`07-architecture.md` §8, `harta-plan.md` decisions 4–5 marked superseded, `app-inventory-web.md`) *Partly, 2026-11-17: the SW never touches Google's hosts (test added), docs updated (07 §8, harta-plan 4–5, inventory RD-9). **MapLibre/OpenFreeMap kept** as the fallback (no key, offline, key refused, script failed); removing it waits until a real key has been checked on a phone. `npm run build:web` passes.* | web, SW, docs | `npm run build` + bundle has no `maplibre-gl`; SW tests updated |
| 8 | **Demo + polish**: Ion's demo cerere (fake identity, real blocs), `seed:demo` creates it, worst cases (`break-ui`: 0/1/150 rows, 40-row cerere, 20 farms). *Partly, 2026-11-17: Ion's cerere is one pure builder (`documents/demo.ts`, tested) used by `/ferma-lui-ion/documente` and by `seed:demo`, which now keeps it on the demo account and puts its rows on his two parcels (skipped with a note while migration 041 isn't on the database; not run: it rebuilds the demo account on the real Supabase and Stripe). Worst cases: dev-only fixtures and a top switch on Ion's farm (`?date=rau|gol|unu|mult`, `components/dev/`, absent from the production build), checked in the headless browser at 320/390/1280 px; fixed: the map legend opens by itself only up to 5 entries and scrolls, farm chips in one sideways row with names on one line, „Ferma nu are încă parcele pe hartă”, „de” from 20 on (`many`), a code-only crop says its code once, the bloc number never splits, the second crop's APIA name, long section I values in growing boxes (`components/dev/worst-case.test.tsx`). Still open, the owner's call: colours after 8 farms, 1,200 parcels on one page, problems grouped per row. Left before ticking: run `seed:demo` once migration 041 is on the database.* | data, scripts | demo walkthrough in headless browser |

Steps 1–7 don't depend on Google and can ship first; G1–G4 can run in parallel with 4–7 because the props boundary stays the same.

---

## 10. Decisions to make

| # | Question | Recommendation | Answer |
|---|---|---|---|
| G1 | Keep the original file, or only the extracted fields? | Ask each time, ticked by default; owner can delete any time | |
| G2 | Store birth year (from CNP) on the cerere? | Yes, birth year only; never the CNP | |
| G3 | Who can open the stored file? | Owner only (it has CNP + IBAN). Managers see fields | |
| G4 | Retention and GDPR review before real farmers | Keep until deleted or farm deleted; add to open questions; DPIA check before launch | |
| G5 | Extract more header fields (applicant type, company, APIA centre, schemes)? | Yes, all as printed; schemes are a useful check on `computeSubsidies` | |
| G6 | Onboarding: keep the cerere read before the farm existed? | Offer „Păstrează cererea” after save; re-read only if >10 min passed | |
| G7 | Max farms on „Toate fermele” | 20, in `plan-params.json` | |
| G8 | After „Pune pe hartă”, do row edits update the parcel automatically? | No: show the difference + „Actualizează parcela” | |
| G9 | „Împarte parcela” now or later? | Later (after step 7) | |
| G10 | Google: 3D for viewing + 2D for drawing and mini-map | Yes (3D can't edit shapes) | |
| G11 | Lose the cartoon style and crop patterns on the map? | Yes on the app map (Google imagery can't be restyled); patterns stay in list/legend; landing keeps its own look | |
| G12 | Who owns the Google Cloud project, billing and quota caps? | The owner's account; budget alert + daily cap before any public demo | |
