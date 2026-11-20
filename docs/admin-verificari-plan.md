# Admin panel, part 3: „De verificat”, everything the app still has to check

**What for:** an admin opens `/verificari` (linked from `/admin`) and sees, on one screen, everything in CropCash that isn't confirmed yet: every figure marked `DE-VERIFICAT` in `docs/data/*.json`, the assumptions, the figures from unofficial sources, and the open questions and contradictions in `docs/11-open-questions.md`. For each one the page shows what the app uses now, where to check it, what it changes for the farmer, and the source link. The admin checks it against the official text and records the answer: **confirmed**, **wrong (the right value is …)**, **still open** (with what was tried) or **not needed any more**. Each answer has a source and a date, and a confirmed or corrected figure turns into a ready-to-apply change to the data file.

Status: steps 1–6 built (2026-11-20), decisions confirmed. **Migration 054 is not applied yet** (the database write needs a yes: `npm run db:migrate` would also apply the pending 052/053 from other work). Step 7 (optional) and step 8 (real browser) not done. Written 2026-11-20 from the code.

**Changed while building:**
- The page is `/verificari`, not `/admin/verificari`: a screen is one path segment (`pageOf` keeps only the last one), and its menu section is `/admin`.
- The API checks admins with the same email list as `/admin` (`ADMIN_EMAILS`, else `DEMO_EMAIL`). No API code reads `app_roles` yet. The table's RLS uses `is_admin()` (migration 035).
- The doc is parsed into `packages/shared/src/verify/questions.gen.json` by `npm run verify:questions`, which `build:web` runs first. A test fails while the copy is behind the doc.
- A right value is stored as `{"v": …}`, so "no figure" (`null`) survives the trip through supabase-js.
- `@cropcash/shared/verify` is a separate entry point: it bundles 24 data files, which the rest of the app shouldn't load.

## What already exists and shapes this

| Fact | Where | What it means for the page |
|---|---|---|
| **137** values have a `*status` of `DE-VERIFICAT` in 20 files. Most are `status`; some are `deadline_status`, `minimum_status`, `months_status`, `terms_status`, `eligibility_status`, `max_ha_status`, `other_conditions_status` | `docs/data/*.json` | The list is built by walking the files, not typed by hand. Any key ending in `status` counts. |
| Biggest files: `arenda-prices-2026.json` (41), `subsidies-2026.json` (18), `apia-papers.json` (14), `anaf-efactura.json` (11), `fuel-excise.json` (9), `calendar-2026.json` (9) | same | Grouping by area (file → area) keeps 137 lines readable. |
| Other weak statuses: `presupunere` 104, `din-presă` 8, `din-sursă-neoficială` 6, `din-documentatie` 5, `din-brief` 4, `parțial` 3, `propunere` 1. Firm ones: `confirmat` 166, `confirmat-2026` 53, `confirmat-administrator` 7, `oficial` 2 | same | Three levels: **to check** (DE-VERIFICAT), **weak source** (press, unofficial, brief, partial, proposal), **our assumption** (presupunere). Firm ones aren't listed. |
| The objects around a status usually carry `note`, `source_url` or `source`, and sometimes `value`, `id`, `title_ro`/`name_ro` | same | The page can show the value, a readable name and the link without extra data. |
| `11-open-questions.md` has 4 tables/lists: A (34 figures DE-VERIFICAT, partly the same as the JSON markers), B (15 assumptions P1–P15), C (6 contradictions), D „Deschise” (~55 numbered open decisions). Done items are ~~struck through~~ or say **Rezolvat** | `docs/11-open-questions.md` | Read at build time by a small parser. Struck-through or „Rezolvat” items are shown as closed. |
| `/admin` already lists every **editable forecast figure** (`listFactors`), with drafts, preview, publish and history; a change is an override with a reason | `web/components/pages/Admin.tsx`, `packages/shared/src/data/overrides.ts`, `apps/api/src/routes/admin.ts`, migration 025 | A to-check item whose path is a factor links to that editor: „wrong, the right value is X” can be published to every farm at once, the same way as today. |
| Admins are rows in `app_roles` (role `admin`), checked by the API and by RLS | migration 035, `apps/api/src/middleware/admin.ts` | The new table and routes use the same check. No new kind of user. |
| The subsidies monitor (`subventii-monitor/`) watches ~179 official pages and records when one changes | tables `sources`, `snapshots`, `change_events` | Later step: when the page behind an item's `source_url` changes, the item is flagged „sursa s-a schimbat, verifică din nou”. |
| Every status change in the files today is a code change: someone edits the JSON and the note | git | The page doesn't write to the files. It records the answer and hands over the exact edit (decision 2). |

## What the page shows

**Top:** counts by level (de verificat / sursă slabă / presupunere / întrebări deschise), how many have an answer waiting to go into the files, and how many were checked in the last 30 days.

**Filters (in the address, like `/harta`):** level, area, „schimbă bani în plan” (yes when the path is a forecast factor or the file feeds the money plan), answered or not, „sursa s-a schimbat” (later step), and a search box.

**Areas** (file → area, kept in one map in shared code): Subvenții APIA (`subsidies-*`, `apia-coupled`, `apia-papers`), Taxe și TVA (`vat-2026`, `contract-taxes-2026`, `anaf-efactura`, `oblio`), Motorină și accize (`fuel-excise`, `excise-schemes`), Arendă (`arenda-prices-2026`), Calendar (`calendar-2026`), Pensie (`pension-*`), Culturi și îngrășăminte (`crops-reference`, `fertilizers`), Contracte (`contract-types`), Hartă (`plots-params`, `lpis`), Plan (`plan-params`), plus „Întrebări deschise” for the doc.

**One row:** a readable name (`title_ro` / `name_ro` / `id` / the last part of the path), the file and path, the value used now, the status and its note, the source link, and a badge if it changes money. **Opening it** shows the whole object, the related open question if one names the same file or path, and the answer form:
- **Confirmat:** source URL (required, `https://`) + what the source says (one line). For a factor, nothing else changes.
- **Greșit, valoarea corectă e …:** the new value (typed as the factor's type when it is one), source, note. For a factor, a button „Pune în ciorna de pe /admin” adds it to the existing draft, to preview and publish.
- **Încă deschis:** what was tried (required), so the next person doesn't redo it.
- **Nu mai e nevoie:** why.

Each answer keeps who and when. An item's history is listed under it: answers are added, never edited (like published versions).

**„De pus în fișiere”:** the answers not yet in the JSON, as a list a developer copies: for each one the file, the path, the old and new `status`/`value`/`note`/`source_url`. When the developer edits the file and deploys, the item's file status is no longer `DE-VERIFICAT`, and the page shows the answer as **done**. No manual ticking.

## Architecture

### Shared (pure, with tests): `packages/shared/src/verify/`
- `scan.ts` → `scanData(raw: RawFiles): VerifyItem[]`. It walks every file, and for each key matching `/status$/` whose value is in a level, it produces an item.
  - **Item:** `{ key, file, path, level, statusKey, status, value, name, note, sourceUrl, area }`.
  - **`key` is stable across reorderings:** in an array, an object with `id` (or `code`) is addressed as `[id=PD-05]`, never by index. `key = file + ':' + path + '#' + statusKey`. A test fails if two items share a key.
  - **`value`:** the sibling `value` field. For a `*_status` key it is the field without `_status` (`deadline_status` → `deadline`).
- `questions.ts` → `parseOpenQuestions(md: string): VerifyItem[]`. It reads table rows of A/B/C and the numbered list of D „Deschise”. An item is closed when it is struck through or says **Rezolvat** / **Nu mai e nevoie**. File and path references in backticks (`plan-params.json`, `weather.frost_min_c`) become links to the matching data items. Tested on the real file, so a format change in the doc breaks a test instead of silently dropping questions.
- `levels.ts`: the status → level map (one place; the levels above) and the file → area map.
- `answers.ts`: the answer schema (Zod) and `currentAnswer(items, answers)`. It returns **done** when the file status is already firm, **waiting for files** when the latest answer is confirmed/wrong but the file still says DE-VERIFICAT, and **open** otherwise. It also has `fileEdit(item, answer)`, which builds the JSON edit to hand over.

The web bundles the scan result at build time (like `loadData()`), so the list works offline.

### Database (`supabase/migrations/054_verify_answers.sql`)
- `verify_answers (id uuid, item_key text, verdict text check in ('confirmed','wrong','open','not_needed'), new_value jsonb, source_url text, note text not null, by_user uuid, by_email text, at timestamptz default now())`.
  - Insert only; no update or delete. RLS: admins (`app_roles`) read and insert. `source_url` must be `https://` when the verdict is `confirmed` or `wrong`.
  - Index on `(item_key, at desc)`.
- No copy of the items in the database: they come from the files of the running version, so the code and the list can't disagree.

### API (`apps/api/src/routes/verify.ts`, behind `requireAuth` + `requireAdmin`)
- `GET /api/admin/verify/answers` returns every answer (a few hundred rows at most).
- `POST /api/admin/verify/answers` takes `{ itemKey, verdict, newValue?, sourceUrl?, note }`. It checks the key against `scanData(loadData raw)` (an unknown key gets 400, so an answer can't point at nothing) and the schema, then inserts.
- Later step: `GET /api/admin/verify/source-changes` gives, for each item's `source_url`, the newest `change_events` row from the monitor, by URL.

### Web
- `web/app/verificari/page.tsx` + `web/screens/verificari.tsx` in `SCREENS`, with a skeleton in `skeleton/screens.tsx` (CLAUDE.md rule). A link from `/admin` („De verificat: 137”).
- `web/components/pages/AdminVerify.tsx`: the list, the filters and the answer form. `web/lib/cc/verify.ts`: loading answers, keeping the last copy for offline, and the copy-for-developer text.
- **Offline:** the list, the filters and the last answers seen stay readable. Recording an answer needs internet (`NetButton`, reason „Ca să salvăm răspunsul ai nevoie de internet.”) and is never queued, the same as publishing on `/admin`.

## Steps (each with `npm test` passing, ticked here)
1. ✅ **Scanner and levels** (`scan.ts`, `levels.ts`) with tests on the real files: count per level, stable keys, `[id=…]` paths, the `*_status` → value rule, no duplicate keys.
2. ✅ **Open-questions parser** with a test on `docs/11-open-questions.md`: number of open and closed items per section, links to data items.
3. ✅ **Migration + API** (migration written, not applied) with route tests: 401/403, an unknown key, a bad URL, insert-only, and a list ordered newest first.
4. ✅ **The page, read-only:** list, counts, filters in the address, the item's detail, offline copy. Component tests like `Harta.test.tsx`.
5. ✅ **Answers:** the form, history under the item, and the „waiting for files” / „done” states.
6. ✅ **Hand-over to files and to `/admin`:** the „De pus în fișiere” list with the exact JSON edit, and „Pune în ciorna” for factor items.
7. **Source changes from the monitor** (optional): a „sursa s-a schimbat” flag and filter.
8. **Check in a real browser** on the deployed admin account, then `docs/11-open-questions.md` gets a line pointing here.

## Decisions (recommended, to confirm)
1. **What counts.** Recommended: three levels from the files, plus the doc's open items either way:
   - DE-VERIFICAT: 137 items.
   - Weak source: 27 items (press, unofficial, documentation, brief, partial, proposal).
   - Assumptions: 104 items.
   That makes 268 data items. Firm statuses, `setare` (16) and `exemplu-demo` (4) are left out. Alternative: only DE-VERIFICAT, so 137 data items.
2. **The files stay the truth; the page doesn't write to them.** An answer is recorded in the database and handed over as an exact JSON edit, which a developer applies and deploys. The item then closes by itself. Alternative: the API writes the JSON and opens a pull request through GitHub, which adds a GitHub token on the VPS and a review step. That's not worth it for a few hundred edits.
3. **A wrong figure that's a forecast factor goes through the existing draft and publish on `/admin`.** It takes effect for every farm right away, with the reason, before anyone edits the file. Other wrong values (texts, deadlines, catalogue entries) wait for the file edit.
4. **The open-questions doc is read as is** (a tested parser), not moved into JSON. It stays the place where the team writes. If the parser gets in the way, moving it to `docs/data/open-questions.json` is the fallback.
5. **A separate page `/admin/verificari`,** linked from `/admin`, not a fourth section on the already long `/admin` page.

## Risks
- **Keys move when someone renames an `id` or restructures a file.** Old answers then point at nothing. The page lists those under „Răspunsuri fără element” instead of dropping them, and the scanner test catches duplicate keys.
- **The doc's format drifts** (a new section, a table with another column). The parser test on the real file fails, which is the point.
- **„Confirmed” without really reading the official text.** The required source URL and the one line of what it says make it checkable. The history shows who said so.
- **Two areas share the same truth** (an item in section A of the doc and the same JSON marker). They are linked, not merged: answering one doesn't close the other. The detail shows both.
