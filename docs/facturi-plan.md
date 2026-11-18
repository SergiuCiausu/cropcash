# Plan: invoices, Oblio and RO e-Factura (with a simulator until the APIs are connected)

Status: **plan, nothing built.** Decisions D1–D4 agreed on 2026-11-17 (§1).
Everything about Oblio's and ANAF's APIs below is from public docs as remembered, not checked against a live
account: each is marked `DE-VERIFICAT` and is checked in steps 7–8, before any real call.

Two directions, one model:

1. **Facturi emise (outgoing).** The farm sells grain → issues an invoice → it reaches ANAF's SPV (e-Factura).
   Through Oblio (which sends to SPV itself) or straight to ANAF.
2. **Facturi primite (incoming).** Suppliers' invoices (seed, fertilizer, diesel, service) land in the farm's SPV
   inbox → CropCash reads the UBL XML → proposes an expense, already filled (category, number, supplier, litres
   of diesel) → the farmer taps „Salvează”. This is the bigger win: today every expense is typed or photographed.

Until a real connection exists, both run against a **simulator** that behaves like the real thing (numbers,
statuses, delays, rejections, inbox), writes real UBL XML, and is marked „Simulare” everywhere.

---

## 0. What exists today

| Piece | Where | Today |
|---|---|---|
| Sales and expenses | `transactions` (`kind` sale/expense, 010), `record_expense()`, `apps/api/src/routes/records.ts` | One row per sale/expense, amounts in bani |
| Invoice number / partner / litres | migration 027: `doc_no`, `counterparty`, `fuel_liters_cl` | Optional free text, typed or read from a photo |
| Invoice photo → expense | `packages/shared/src/documents`, `apps/api/src/ai/documents.ts`, „Fă o poză la factură” in `Recolte.tsx` | Claude reads the photo, code fills the form, nothing saved until „Salvează” |
| Excise refund on diesel | `web/lib/reports/fuel.ts`, report „Facturile și bonurile” | Needs litres + invoice no. per diesel invoice |
| Accountant access | `farm_members` (028), `/contabil` | Read-only reports per farm |
| Several farms per person | 039 | Every new table hangs off `farmer_id` and `my_farmer_ids()` |
| Fiscal identity of the farm | — | **Nothing**: no legal form, CIF, VAT status, address, IBAN |
| Test-mode guard | Stripe: refuses keys not starting with `sk_test_` | The pattern to copy for ANAF/Oblio |
| Idempotency | 018, `docs/idempotency-plan.md`, `clientId` on records | Reuse for „Emite factura” |

---

## 1. Decisions (agreed 2026-11-17)

- **D1 · Who issues invoices.** Since the 100+ ha pivot most target farms are PFA / II / SRL, for whom e-Factura is
  mandatory. A farmer who is a *persoană fizică* usually doesn't invoice: the buyer issues the purchase paper
  (borderou / fila din carnetul de comercializare). Decided: outgoing invoices only when the farm's legal form is
  PFA / II / IF / SRL; for a persoană fizică the „Facturi emise” tab is hidden and only „Primite” shows (if the
  farmer has an SPV account at all). `DE-VERIFICAT`: e-Factura B2C rules for persoane fizice in 2026.
- **D2 · Oblio first or ANAF first.** Decided: **Oblio first** for outgoing (it numbers, makes the PDF, signs and
  sends to SPV, and keeps a legal archive), **ANAF direct** for the inbox (Oblio's inbox API, if any, is
  `DE-VERIFICAT`). ANAF direct for outgoing comes later, for farms without Oblio.
- **D3 · ANAF login.** ANAF OAuth needs the farm's (or the accountant's) qualified digital certificate in the
  browser at login. Ion can't do that on a phone. Decided: the accountant connects SPV once from `/contabil`
  (role `accountant` gets a „Conectează SPV” action); the token then serves the farm. Token lifetime
  (`DE-VERIFICAT`: ~90 days access, ~365 days refresh) → calendar reminder before it expires.
- **D4 · VAT.** Farms can be VAT payers, not registered, or under the special agricultural scheme (Cod fiscal
  art. 315¹). Rates and the scheme's rules are `DE-VERIFICAT` → decided: they stay in `docs/data/vat-2026.json`, never in code.
- **D5 · Simulated invoices never become real.** A simulated invoice can't be "promoted" to a real one. When the
  farm connects for real, simulated ones stay, marked, and real numbering starts from the series the farmer sets.

---

## 2. Architecture

```
packages/shared/src/invoices/          pure, no I/O, tested
  model.ts        Zod: Invoice, InvoiceLine, Party, FiscalProfile, statuses
  totals.ts       line → net/VAT/gross in bani (integers), rounding per line then per total
  numbering.ts    series + next number, gaps detection
  ubl.ts          build UBL 2.1 / CIUS-RO XML from an Invoice; parse incoming UBL → Invoice
  validate.ts     the CIUS-RO rules we can check offline (CIF checksum, required fields, totals add up)
  to-expense.ts   incoming Invoice → ExpenseInput proposal (category guess, docNo, counterparty, fuelLiters)

apps/api/src/invoicing/
  provider.ts     interface InvoiceProvider { issue, status, cancel, pdf, listInbox, fetchInboxItem }
  simulated.ts    the simulator (§3)
  oblio.ts        Oblio REST client (step 7)
  anaf.ts         ANAF e-Factura client + OAuth (step 8)
  connections.ts  which provider a farm uses; credentials encrypted (AES-GCM, key in .env)
  poller.ts       advances pending uploads, syncs the inbox (cron on the VPS, pm2)
apps/api/src/routes/invoices.ts        /api/invoices, /api/einvoice/inbox, /api/integrations
```

**Provider choice per farm**, in `integration_connections`: `provider` = `simulated | oblio | anaf`,
`mode` = `sim | test | prod`. Env guard like Stripe's: `INVOICING_ALLOW_PROD` must be `true` for any `prod`
connection; otherwise ANAF calls go only to the test host and Oblio only to a test company. Default for every farm:
`simulated`.

**Credentials** (Oblio API secret, ANAF tokens) are encrypted at rest with `INVOICING_KEY`, read only by the API,
never sent to `web/`, never logged.

### Data (migration 041, safe to run again; 040 was taken)

| Table | What |
|---|---|
| `farm_fiscal_profiles` | `farmer_id`, legal_form (`pf`, `pfa`, `ii`, `if`, `srl`), cif, reg_com, vat_status, address, county, iban, bank. One per farm |
| `invoice_series` | `farmer_id`, prefix, next_number, `is_simulated` (sim series always start with `SIM-`) |
| `invoices` | direction (`out`/`in`), provider, series, number, issue/due date, buyer/seller snapshot (jsonb), totals in bani, currency, status, provider ids (`oblio_id`, `anaf_upload_index`, `anaf_download_id`), `transaction_id` (the sale/expense it belongs to), `client_id` unique, `is_simulated` |
| `invoice_lines` | invoice_id, description, crop_id, quantity (integer, grams or units ×1000), unit price bani, vat rate bp, totals |
| `invoice_events` | invoice_id, at, from_status, to_status, detail (ANAF error messages) — the history the UI shows |
| `integration_connections` | farmer_id, provider, mode, credentials_enc, status (`ok`/`expired`/`error`), expires_at, connected_by |

RLS through `my_farmer_ids()` like every farm table; the accountant role reads invoices and the profile and may
manage the connection (D3). Statuses are written only by the API (service role), like payouts.

### Statuses

Outgoing: `draft → issuing → sent_to_spv → in_processing → accepted | rejected`, plus `cancelled` (storno =
a new invoice with negative lines, linked). Incoming: `new → proposed → recorded | dismissed`.

---

## 3. The simulator

Goal: everything the UI, reports, tests and the demo need works today, and swapping in the real provider changes
only `provider` on the connection.

- **Issue.** Takes the next number from the farm's `SIM-` series, builds the real UBL XML with `ubl.ts`, runs
  `validate.ts`. Failing validation → `rejected` with the same kind of messages ANAF gives (in Romanian, mapped
  to plain words in the UI). Passing → `sent_to_spv`, with a fake upload index.
- **Time.** Status moves on with the clock, not instantly: `in_processing` after a few minutes, `accepted` after
  a bit more (delays in `docs/data/einvoice-sim.json`). It uses the same clock as the demo, so „Dăm timpul
  înainte” (`POST /api/demo/advance`) also moves invoices on. Real accounts use the real date (§7 of the
  employees plan).
- **Forced failures for testing.** `einvoice-sim.json` lists triggers: a buyer CIF of `RO0000000000` → rejected
  "CIF invalid"; a note containing `#sim-timeout` → stuck `in_processing` for a day, then error. Only in `sim`
  mode, so the failure screens can be built and tested.
- **Inbox.** Simulated supplier invoices come from `docs/data/einvoice-inbox-demo.json` (no invented figures:
  Ion's demo has no recorded expenses, so each amount is the plan's own cost for that crop and month:
  `crops-reference.json` cost per ha × the month's share × Ion's hectares; suppliers are made up, with CIFs
  starting with zeros so none can be a real company's; no diesel litres, since no price per litre is in the data). On
  "sync", the simulator drops the next ones whose date ≤ the clock into the inbox, as UBL XML, so the real parser
  runs on them.
- **PDF.** A simple PDF from the invoice (same renderer family as `web/lib/reports`), with a diagonal
  **„SIMULARE — nu este factură fiscală”** watermark. Real PDFs come from Oblio / ANAF's XML→PDF later.
- **Label everywhere.** Every simulated invoice, list row and PDF shows a „Simulare” badge; the integrations
  card says „Nu e legat încă de Oblio / SPV. Facturile de aici sunt de probă.”

---

## 4. Screens

- **New screen `/facturi`** (in `SCREENS`, with a skeleton in `web/components/skeleton/screens.tsx`), two tabs:
  - **„Primite”**: new supplier invoices first, each with the proposed expense („Motorină, 1.240 l, Petrom,
    nr. …”) and „Notează cheltuiala” / „Nu e a fermei”. Opens the existing expense form, prefilled, nothing saved
    until „Salvează” (same rule as the photo flow). Already-recorded ones link to their expense.
  - **„Emise”**: list with status in plain words („Trimisă la ANAF”, „Primită de ANAF”, „Respinsă: CIF-ul
    cumpărătorului e greșit”), PDF, „Anulează” (storno).
- **From a sale (Recolte):** after „Salvează” on a sale, „Fă factura” opens a short form prefilled from the sale
  (crop, tonnes, price, buyer from `counterparty`). Buyer lookup by CIF: `DE-VERIFICAT` which public endpoint
  (ANAF's public CUI service) — in sim mode, from a small fixture.
- **„Datele firmei”** (in the farm settings): the fiscal profile. Needed before the first outgoing invoice.
- **„Legături”** card: Oblio and SPV, each `Simulare` / `Test` / `Legat` / `Expirat`, connect/disconnect.
- **Ion's farm (`/ferma-lui-ion/facturi`)** reads simulated invoices from `demo-ion.json`, no API, read-only.
- **Accountant (`/contabil`)** sees both tabs per farm and may connect SPV (D3).
- **Reports:** „Facturile și bonurile” and the excise report take invoice numbers and litres from recorded
  incoming invoices — nothing new to type.

**Offline.** Lists and PDFs of already-loaded invoices work offline (cached like the farm copy). A draft can be
filled offline and stays on the phone. „Emite factura”, „Anulează” and „Verifică SPV” are `NetButton`s
(`reason="Factura primește număr și pleacă la ANAF doar cu internet"`) and never go into the offline queue: they
hand out legal numbers. „Notează cheltuiala” from an inbox item may queue, like any expense (it records what
already happened).

**Texts:** Romanian, plain. „Factură”, „ANAF”, „SPV” are words farmers know; avoid „UBL”, „XML”, „CIUS”, „token”.

---

## 5. Money and correctness rules

- All amounts in bani (integers). Line net = quantity × price rounded to the ban; VAT is worked out **per
  (category, rate) group** on the sum of that group's line nets (EN 16931 BR-CO-17), not per line, so ANAF's
  check finds the same figure; totals = sums of the groups. Rounding half away from zero, so a storno mirrors its
  invoice exactly. The UBL totals are generated from the same numbers, never recomputed separately.
  `DE-VERIFICAT`: CIUS-RO rounding tolerance.
- Quantities as integers (kg ×1000 or units ×1000), no floats.
- A number, once given, is never reused: `invoice_series.next_number` bumped in the same SQL transaction as the
  insert (`issue_invoice()` function, like `record_expense()`).
- „Emite factura” carries a `clientId`; a repeated tap returns the same invoice (018 idempotency).
- An incoming invoice is unique per `(farmer_id, seller_cif, series, number)`; the same one from SPV and from a
  photo is detected: the photo flow warns „Factura asta e deja la Primite”.
- Storno never deletes: it's a new linked invoice.

---

## 6. Tests

- `packages/shared/src/invoices/*.test.ts` (offline, in `npm test`): totals and rounding, CIF checksum,
  numbering, UBL build → parse round-trip, parsing real-shaped sample XMLs (fixtures in
  `packages/shared/src/invoices/fixtures/`, anonymised), `to-expense` category guesses (diesel litres from the
  line quantity and unit code).
- `apps/api/src/invoices.test.ts`: simulator lifecycle with a fake clock, forced failures, idempotent issue,
  RLS (farmer A can't read farm B's invoices; accountant reads, doesn't issue).
- `web`: `/facturi` renders both tabs, the „Simulare” badge, NetButton offline, prefilled expense from inbox.
- Later, behind env like `test:stripe`: `npm run test:oblio` (a test company on Oblio) and
  `npm run test:efactura` (ANAF test host), never in `npm test`.

---

## 7. Steps

Each step: `npm test` green → tick here → one status line. No commit unless asked.

1. [x] **Shared model.** `packages/shared/src/invoices`: model, totals, numbering, validate, CIF checksum. Tests.
   **Done (2026-11-17):** `ids.ts` (CIF check digit, IBAN mod 97), `model.ts` (fiscal profile, party, line, draft,
   statuses and allowed moves), `totals.ts` (VAT per group, BigInt products), `numbering.ts` (series, `SIM-`
   rule, gaps), `validate.ts` (issue codes only; the Romanian words go in `web/components` with step 5).
   25 tests. **Change from the plan:** VAT per group, not per line (§5).
2. [x] **UBL.** `ubl.ts` build + parse, CIUS-RO required fields, round-trip tests, `to-expense.ts`.
   **Done (2026-11-17):** `xml.ts` (own small reader/writer, no dependency; a DOCTYPE is refused, so no XXE),
   `ubl.ts` (`buildUbl` in schema order, simulated invoices carry a „SIMULARE” note in the XML; `parseUbl` reads
   Invoice and CreditNote whatever the prefixes, amounts as integers from the text, never through floats),
   `to-expense.ts` (category from the words on the lines, diesel litres, credit notes / stornos / other currencies
   skipped, `incomingKey` for duplicates). Two rules added to `validate.ts`: a reason on category E, a sector
   in Bucharest. 20 tests. A storno is written as type 380 with negative quantities and a BillingReference.
3. [x] **Data.** Migration 041 (tables in §2, `issue_invoice()`, RLS, grants). `docs/data/einvoice-sim.json`,
   `einvoice-inbox-demo.json`, `vat-2026.json` (rates `DE-VERIFICAT` + entries in `docs/11-open-questions.md`).
   **Done (2026-11-17):** `supabase/migrations/041_invoices.sql` (not applied yet: `npm run db:migrate` before the
   API of step 4 is deployed). Decided while building: the **accountant may issue** invoices too (owner, manager,
   accountant); **drafts stay on the phone**, so a server invoice starts at `issuing` with its number already
   given, and a failure after that is `rejected` (fixed and sent again), never a gap in the numbering; who issued,
   what and for how much can't change after the insert (trigger), and status moves are checked against the same
   list as `model.ts` (a test reads the SQL). `vat-2026.json`: 21% and 11% from Legea 141/2025 (from the press);
   inputs at 11% `DE-VERIFICAT`; grain between VAT payers is taxare inversă until 31 Dec 2026; grain to others
   and the special scheme `null`. Open questions 26–30. `packages/shared/src/invoices/data.ts`: the three
   schemas, `vatForUse`, `simTrigger`, `demoInbox`. 14 tests.
4. [x] **Simulator + API.** `provider.ts`, `simulated.ts`, routes, poller tied to the demo clock, `/api/demo/advance`
   moves invoices. API tests.
   **Done (2026-11-17):** `apps/api/src/invoicing/` (`provider.ts`, `simulated.ts`, `service.ts`), `db/invoices.ts`,
   `routes/invoices.ts`, wired in `app.ts` / `server.ts`. Routes: `GET /api/invoicing`, `PUT /api/invoicing/profile`,
   `POST /api/invoicing/series`, `GET|POST /api/invoices`, `GET /api/invoices/:id` (with the history),
   `GET /api/invoices/:id/xml`, `POST /api/invoices/:id/resend`, `POST /api/invoices/:id/cancel` (storno),
   `POST /api/einvoice/inbox/sync`, `POST /api/einvoice/inbox/:id/link|dismiss|restore`. An accountant names the
   farm in X-Farm-Id. **Change from the plan: no poller for the simulator.** The status is worked out from the
   farm's clock each time an invoice is read (`simulatedStatus`, the larger of the demo clock and real time), so
   „Dăm timpul înainte” moves invoices without touching `routes/money.ts`. A poller comes with Oblio/ANAF (steps
   7–8), which can't be asked on every read. The simulated inbox fills only on a farm with a demo clock; a real
   farm never gets made-up supplier invoices. 23 tests (`apps/api/src/invoices.test.ts`,
   `packages/shared/src/invoices/simulator.test.ts`), with an in-memory store that keeps 041's rules; not run on
   Supabase yet.
5. [x] **Screens.** „Datele firmei”, `/facturi` (both tabs), „Fă factura” from a sale, „Legături” card, skeletons,
   Ion's read-only copy, `/contabil` tabs. Reports read recorded invoices.
   Done (2026-11-17): `/facturi` (`components/pages/Facturi.tsx`, words and calls in `web/lib/cc/invoices.ts`), in the rail
   and under „Mai mult”. „Primite”: opening the list syncs the inbox; „Notează cheltuiala” confirms the proposed
   category and date, saves `add_expense`, then links it. Not queued offline: the link needs the saved id, so it waits
   for internet like the rest. „Emise”: status chips, events, „Trimite din nou”, „Anulează (stornare)”. „Fă o factură”
   from the header or from a sale in Recolte (`#vanzare-<id>`, server ids only), VAT choices from vat-2026.json. „Datele
   firmei” and new series (always SIM- until a connection exists). „Legătura cu ANAF” card (Simulare). Ion: his inbox
   built on the phone from the demo XML, no API; „Emise” explains why a PF gives no invoices. `/contabil`: the
   accountant gets „Facturile fermei” (both tabs, read-only, X-Farm-Id). Reports need no change: a recorded invoice is an
   ordinary expense with its doc number and supplier. The last copy stays on the phone per farm. Not done here: the PDF
   with the watermark, the XML download button for the accountant (step 7/8).
6. [x] **Demo.** `seed:demo` adds a few issued (one rejected and fixed, one storno) and an inbox with the diesel
   invoices; `demo:rehearse` covers „Primite → Notează cheltuiala” and „Fă factura → Primită de ANAF”.
   Done (2026-11-17). Decided with the user: on the demo account Ion is a **PFA** (`docs/data/einvoice-demo-issued.json`:
   CIF 00000043, not a VAT payer, series SIM-ION), so „Emise” has something to show; /ferma-lui-ion stays a persoană
   fizică. **No diesel invoices**: docs/data has no diesel price per litre, so the inbox keeps the three data-backed
   ones (works, seeds, treatments) until a sourced price is added. Three maize invoices (tonnes = Ion's maize ha × mean
   yield × the share sold; mean price per tonne; category O): one rejected by the simulator's marker and sent again, one
   accepted, one cancelled by a storno. `seed:demo` (step 6 in the script) plays them through the API, setting the
   farm's demo clock to each day and putting it back after, then checks 3 accepted + 1 cancelled. `demo:rehearse` issues
   one on the demo date before „6 luni înainte” and checks it's „Primită de ANAF” after the jump, then, last so the
   pitch figures don't move, notes the first supplier invoice as an expense and checks it's linked. Pure builder
   `invoices/demo-issued.ts` (6 tests) and the seed's sequence on the in-memory store (`apps/api/src/invoices.test.ts`).
   **Not run on Supabase:** migration 041 first, then `npm run seed:demo` and `npm run demo:rehearse`.
7. [x] **Oblio (when there's an account).** Check the API against Oblio's docs (`DE-VERIFICAT`: token endpoint
   with email + API secret, create invoice, get/cancel, send to e-Factura, series and VAT nomenclatures, rate
   limits). `oblio.ts` behind the same interface, contract tests on recorded responses, `test:oblio` on a test
   company. Map Oblio errors to the same plain messages. Farm connects with email + API secret in „Legături”.
   Done (2026-11-17), without an Oblio account yet. The API was read from https://www.oblio.eu/api (the only page
   that answers; the PHP client on GitHub is gone): token at /authorize/token (form, client_id = email, client_secret
   = the key from Setări > Date cont), Bearer on the rest, POST /docs/invoice (JSON), POST /docs/einvoice (send to
   SPV), status from GET /docs/invoice/list?withEinvoiceStatus=1, storno as a new invoice with referenceDocument,
   limits 30 per 100 s (documents) and 30 per 10 s (the rest). No received-invoices endpoint: the inbox stays ANAF (D2).
   **Decided with the user: full flow now.** A connected farm's real series go to Oblio and from Oblio to SPV: real
   invoices from the first one (the card says so before the key is sent); the connection is stored as mode `prod`, so
   step 9 has nothing left to switch for Oblio. Our number goes with `disableAutoSeries`, and a real series is one of
   the Oblio company's, started at Oblio's next number, so both hand out the same numbers. The body is made from our
   own XML read back (`oblioInvoiceBody`), so Oblio gets what `validateInvoice` passed; the invoice id is the
   `idempotencyKey`, so a resend after no answer can't duplicate it, and a resend after Oblio has it only retries SPV.
   Errors: 401 → the connection is marked expired, 400 → Oblio's own message, no answer/429/5xx → „Oblio nu a
   răspuns”. Status is asked at most once per `check_interval_s`; a provider that doesn't answer no longer breaks the
   list. Keys sealed with AES-256-GCM (`INVOICING_KEY`, the farm id as associated data); without the key there is
   no Oblio. Settings and DE-VERIFICAT names in `docs/data/oblio.json`, open points in question 31. Files:
   `packages/shared/src/invoices/oblio.ts`, `apps/api/src/invoicing/{oblio,secrets}.ts`, routes
   `POST /api/invoicing/connections/oblio`, `DELETE /api/invoicing/connections/:provider`, the card on /facturi.
   `npm run test:oblio` reads only; `OBLIO_ISSUE=1 OBLIO_SERIES=X` also creates one invoice and deletes it (never
   SPV). 30 new tests. **Not run against Oblio yet**: needs an account, then `test:oblio`.
8. [x] **ANAF e-Factura (when there's a certificate / accountant).** Register the OAuth app at ANAF; flow from
   `/contabil`; client for upload, message status, message list, download (zip with XML + signature), XML→PDF,
   validate — all `DE-VERIFICAT` against ANAF's current docs. Test host first (`test:efactura`), token refresh,
   expiry reminder in the calendar. Inbox sync moves from the simulator to ANAF for connected farms.
   Done (2026-11-17), without an ANAF app registration yet. ANAF's API pages on mfinante.gov.ro didn't answer, so the
   endpoints are from ANAF's URL list and the anafpy reference (docs/data/anaf-efactura.json, DE-VERIFICAT, question
   32). OAuth: „Conectează SPV” (/contabil, and /facturi for an owner with a certificate) sends the browser to
   logincert.anaf.ro with a state sealed by INVOICING_KEY (farm, user, CIF, page to come back to; 10 minutes, once);
   GET /api/anaf/callback (before the session check) trades the code, checks the tokens see the farm's CIF in SPV, keeps
   them sealed, and comes back with #spv=ok or the reason. Tokens refresh refresh_before_days early, one refresh at a time,
   and the rotated refresh token is kept. New connections are mode `test` (api.anaf.ro/test) until step 9. „Primite”
   comes from ANAF for connected farms (listaMesajePaginatieFactura, filter P; once per inbox.interval_s; each message
   downloaded once; unreadable ones skipped); the simulator stays for the rest. The calendar gets a paperwork event
   „Leagă din nou SPV” lead_days before the refresh token expires, moved on refresh, removed on disconnect. ANAF's limits
   are kept in the client before ANAF's. Upload + stareMesaj (with ANAF's errors from the nok download) are built and
   tested, but no screen makes an ANAF series yet: outgoing stays Oblio (D2). „PDF de la ANAF” on a real invoice uses the
   public transformare. Checked live on ANAF's public validator: sale, storno (380, negative quantities) and exempt line
   pass; a missing due date (BR-CO-25) now defaults to the issue date; a buyer without CIF on a VAT invoice (BR-RO-120)
   is now refused by validateInvoice (`buyer_needs_id`). `npm run test:efactura` runs those checks with no login, and
   with EFACTURA_FARM_ID lists a connected farm's messages (EFACTURA_UPLOAD=1 uploads one sample to the test host).
   Files: packages/shared/src/invoices/anaf.ts, apps/api/src/invoicing/{anaf,zip}.ts, web/components/app/SpvConnect.tsx.
   **Not run against ANAF's OAuth yet**: needs the app registered at ANAF (callback https://<api>/api/anaf/callback).
9. [x] **Production switch.** `INVOICING_ALLOW_PROD`, per-farm `mode = prod` only after a test-host run passed for
   that farm; deploy notes in `docs/12-deploy.md` (poller under pm2, `INVOICING_KEY` on the VPS).
   Done (2026-11-18). `INVOICING_ALLOW_PROD` must be exactly `true` for any ANAF production call: without it new
   connections stay on the test host, and a connection already on prod opens no session (nothing reaches ANAF). Per
   farm, `mode = prod` only after a probe on the test host passed, younger than `probe_valid_days`: a 1-leu invoice
   from the farm's „Datele firmei” (`anafProbeDraft`, validated first) uploaded to the test host with the farm's
   tokens, passed when stareMesaj says ok (`anafProdBlock` is the gate). Routes: `POST
   /api/invoicing/connections/anaf/probe`, `POST /api/invoicing/connections/anaf/mode` ({mode: prod|test}). Switching
   restarts the inbox on the new host; a reconnect keeps prod (and the probe) for the same CIF. Invoices from the test
   host carry `testHost` and show „Probă ANAF”. A status check uses the host the invoice was uploaded to.
   **Oblio is not behind the switch** (decided 2026-11-17, step 7): an Oblio connection is real from the first invoice.
   **Change from the plan, decided with the user (2026-11-18): the poller runs inside the API process**, every
   `INVOICING_POLL_S` (default `poll_s` in anaf-efactura.json), only with `INVOICING_KEY`: a separate pm2 process
   would refresh the same farm's rotated ANAF token alongside the API and expire it. One pass per farm: tokens kept
   fresh (an unused refresh token would run out), the pending probe, invoices waiting for a provider (without a user
   token, `outRows`), the inbox; each part on its own. Deploy notes in `docs/12-deploy.md` §7.

Steps 1–6 need nothing external. 7 and 8 are independent of each other.

---

## 8. Open questions (go to `docs/11-open-questions.md` in step 3)

- e-Factura obligations in 2026 for a farmer who is a persoană fizică (sales and the SPV inbox).
- VAT rates for grain and inputs in 2026, and the special agricultural scheme (art. 315¹): who's in it, what the
  invoice must show.
- Whether the borderou de achiziție / carnet de comercializare must go through e-Factura or e-Transport.
- e-Transport (UIT codes) for grain shipments — out of scope here, but the same SPV connection serves it later.
- Oblio: does it expose the received-invoices inbox through the API? Pricing per farm, and whether the accountant's
  Oblio account can serve several farms.
- ANAF token lifetimes and whether one accountant token can act for several CIFs.
- Archive duty: how long the farm must keep the XML + signature, and whether CropCash keeps it or Oblio does.
- From step 2, to check on ANAF's validator: the CIUS-RO CustomizationID version (1.0.1), payment means code 42,
  how a buyer with no CIF (a private person) is written, the wording ANAF expects for an exempt (E) line, and
  whether a storno should be type 380 with negative quantities (what we write) or a CreditNote (381).
