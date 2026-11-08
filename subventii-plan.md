# Subsidy monitor – build plan

Written 7 November 2026. Implements `subventii-surse.md`. Terms are explained in `glossary.md`.

Two plans, built in order, in a standalone project at `wifey/subventii-monitor/`:

- **Plan A – Change monitor:** finds out cheaply what changed across the sources.
- **Plan B – Funding opportunities:** turns those changes into a list of what farmers can apply for, and by when.

Plan B depends on Plan A: it reads A's change events and never fetches pages itself, except for the EC API.

---

## Facts this plan relies on

Checked on the live sites on 7 November 2026.

| Fact | What it means here |
|---|---|
| Most HTML pages send no `ETag` or `Last-Modified` (AFIR, FGCR, ADR, FNGCIMM, ANSVSA, EC). APIA does. | These pages are downloaded in full and compared by hash. They are small: 10–160 KB. |
| MADR's `Last-Modified` on HTML appears to be the request time. | Never treat it as proof of a change. |
| PDFs on APIA, ONVPV, AFIR and MADR have real `ETag` or `Last-Modified`. | PDFs can be skipped with headers alone. |
| APIA and ONVPV return a real `304` with 0 bytes, on HTML and PDFs. | Conditional requests work. |
| Several servers, including all of APIA and MADR, omit the intermediate certificate. Node rejects them; browsers and Windows don't. | `certs/intermediates.pem` holds the 3 missing certificates. Verification stays on. Run `npm run update-certs` if a site starts failing with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. |
| AFIR `/api/file/document` links return 404 on HEAD and 302 on GET. | Resolve the redirect first, then check the real file. |
| The EC returned `Content-Length: 0` on HEAD for an HTML page. | Treat 0 as unknown. |
| `robots.txt` no longer matches section 3 of the spec. MADR, APIA, MIPE, ANSVSA and RRN-PAC do not block general bots from the listed paths. DAJ Botoșani and MySMIS resources do block us. | Read the rules live on each run. Do not hardcode a blocklist. |
| The ADR portal sets `Crawl-Delay: 60`. | Use the larger of this and the 3-second default. |
| ADR Centru returned 403. | Report for manual checking. Do not bypass. |
| The MIPE feed has a real `ETag`. | A cheap daily signal. |
| EC API: works, sends no `ETag`, and some records have expired deadlines under a live-looking status. | Filter on `deadlineDate`, and compare records by checksum. |
| EC API: the official APIs page documents this public endpoint and the `SEDIA` key. It states no rate limits. | Keep requests light: 2 seconds apart. |

---

## Stack

Node 22, TypeScript, npm (workspace of the CropCash repo).

| Job | Choice |
|---|---|
| HTML parsing | `cheerio` |
| Main content extraction | Per-site selectors, with `defuddle` as fallback |
| PDF text | `unpdf` |
| Text diff | `diff` |
| Database | Supabase (Postgres), through `@supabase/supabase-js` |
| Stored text and diffs | Supabase Storage, private `snapshots` bucket |
| Robots rules | `robots-parser` |
| Per-host rate limit | `p-queue` |
| HTTP and encoding | Built-in `fetch` and `TextDecoder`; `undici` to add certificates |
| DOM for `defuddle` | `linkedom` |
| Run and test | `tsx`, `vitest` |

```
subventii-monitor/
  src/
    cli.ts               seed | run | report
    seed.ts              parses the tables in subventii-surse.md
    store.ts             the database interface the rest of the code uses
    supabase-store.ts    that interface, on Supabase
    tls-setup.ts         loads the extra intermediate certificates
    fetcher.ts           robots, rate limits, retries, redirects, HEAD, conditional GET
    detect.ts            change-detection cascade; emits change events
    run.ts               runs every due source, host by host
    normalize.ts         ş→ș, ţ→ț, NFC, whitespace; case is kept
    links.ts             URL cleanup, link comparison, keyword scoring
    extract/
      html.ts            main content
      pdf.ts             PDF text
      selectors.ts       per-domain selectors
    opportunities/
      ec-api.ts          EC Funding & Tenders client
      parsers/           one file per source (afir.ts, mipe.ts, adr-*.ts)
      pdf-rules.ts       Romanian dates, amounts, applicant terms
      relevance.ts       direct / partnership / conditional / not relevant
      store.ts           upsert and event history
    report/
      daily.ts           change report
      digest.ts          farmer digest, closing-soon alerts
  (schema: ../supabase/migrations/004–007)
  certs/                 intermediates.pem
  scripts/               update-certs.ts
  tests/
  reports/               YYYY-MM-DD.md   (gitignored)
```

---

## Plan A – Change monitor

### Detection cascade

Each source stops at the first step that gives an answer:

1. **Not due:** skip. Missed days catch up on the next run because the check uses `next_due`.
2. **Robots:** check rules cached for 24 hours. Blocked sources are reported. A `404` robots file means allowed; a `5xx` means skip this run.
3. **PDFs and documents:** send HEAD and compare the stored `ETag`, `Last-Modified` and `Content-Length` as exact strings. If all match, stop. If HEAD fails or gives no usable headers, use a conditional GET and cancel the body if it is unchanged.
4. **HTML:** conditional GET. `304` means stop.
5. **Content hash:** extract main content, normalize, SHA-256. Same hash: update `last_checked`, store nothing.
6. **Real change:** save text, generate diff, emit a change event. A PDF whose bytes changed but whose text did not is not reported.

Index pages also compare link sets on every `200`.

### Schedule

| Frequency | Sources |
|---|---|
| Daily | Anything that announces funding: AFIR, APIA campaign pages, MIPE feed and calendars, regional agencies, DAJ, EC API |
| Weekly | Legislation, registers, reference pages, EU legal pages |

### Data

All in Supabase. Row Level Security is on with no policies, so only the secret key used by the script can reach the data. The public key can't read or write anything.

- `sources`: url, resolved_url, institution, title, type, frequency, next_due, last_checked, etag, last_modified, content_length, content_hash, file_hash, text_chars, state, failure_count, discovered_from
- `snapshots`: source_id, run_id, taken_at, http_status, content_hash, file_hash, text_path, diff_path, written only on change. The text and diff files are in Storage.
- `change_events`: source_id, run_id, snapshot_id, kind, detail, processed_at. Plan B and the report read these.
- `robots_cache`: origin, fetched_at, http_status, body
- `links_seen` (added in A4): index_source_id, url, first_seen, is_baseline, score, is_document, version_key, source_added
- `runs`: started, finished, requests, bytes, and how many sources stopped at each step

Writes aren't in one transaction. The source row is updated last, so a crash can repeat an event but can't lose a change.

### Safeguards

- **Link explosion:** discovered links become `pagina`, never `index`, so crawling is not recursive. Same domain only, with a cap per run.
- **First-run flood:** links on the first run are stored as baseline, not downloaded or reported. A replaced PDF at a baseline URL goes unnoticed unless a weekly HEAD check is added later.
- **False changes:** run extraction twice a few minutes apart during setup. Any page that changes needs a better selector.
- **Error pages served as `200`:** if text shrinks by more than 80% or is almost empty, flag it as suspicious.
- **JavaScript-only pages:** AGI, MySMIS and EC search pages may be nearly empty. Report "needs manual check". No headless browser in v1. Never attempt to get past a CAPTCHA.
- **Scanned PDFs:** compare by file hash and say no diff is available. No OCR in v1.
- **Repeat alerts:** report state changes once. A `5xx` or timeout is an error, not a disappeared source.
- **TLS:** report broken certificates. Never disable checks.

### Milestones

| # | Work | Done when |
|---|---|---|
| A1 ✓ | Project setup, seed, fetcher | All 180 URLs load (Neamț has none). First pass lists every 404, redirect and block. See `reports/first-pass-2026-11-07.md`. |
| A2 | Cascade, extraction, tests, Supabase | A local test server covers `304`, unchanged hash, changed hash and the AFIR redirect. At least one real server returns `304`. `npm run seed` and `npm run monitor` work on the hosted Supabase project. |
| A3 | Selectors, then noise check, then the issues below | Two runs a few minutes apart report no changes on those sites. AFIR's sessions list is captured in full. |
| A4 | Links, keyword scoring, PDF version grouping | A new link added to a test page appears in the report; baseline links do not. |
| A5 | Daily report | Report lists new, changed, gone and error sources with diffs. On a quiet day it says only that. |

**Known issues for A3:**

- Automatic extraction misses content on some pages. AFIR's 115 KB sessions page gave 651 characters and ANSVSA's guides page gave mostly menu text. Selectors must fix these, starting with the AFIR sessions list, because Plan B depends on it.
- From the first pass: update the moved links in the spec, and check the broken ones (APIA Cerere Unică page, MADR Documente implementare PNS, DAJ Hunedoara, DAJ Buzău, DAJ Sălaj, EC TAM).
- Some PDFs repeat bold text (`PPLLAANNUULL`). That's harmless for hashing, but Plan B's PDF rules must handle it.

**Plan A is done when** a second run right after the first reports nothing changed, sends no PDF bodies for sources with valid headers, and `runs` shows the bytes saved.

---

## Plan B – Funding opportunities

### New sources

Built state: see `progress.md`. MIPE's calendar already covers the regional programmes and PAP, so B5's regional parsers were dropped.

| Source | Status | Action |
|---|---|---|
| EC Funding & Tenders API | Works | Daily query (B1) |
| MIPE feed `https://mfe.gov.ro/feed/` | Works | Add to sources |
| Regional agencies: Nord-Est, Sud-Est, Vest, Nord-Vest, Oltenia, București-Ilfov | Homepages respond | Find their actual call pages |
| ADR Centru | 403 | List as manual check |
| Fisheries and aquaculture programme (PAP) | Reported by press | Find the official page |
| GAL / LEADER sites | Spec note only | Extract from the MADR PDF in B5 |

Official sources only in v1. Press may be useful later as a cross-check.

### Data

- `opportunities`: stable_key, source_id, programme, title, status (announced / open / closed / unknown), open_date, deadline, budget, cofinancing, applicant_types, county, sector, relevance, url, confidence, evidence_text, first_seen, last_verified
- `opportunity_events`: opportunity_id, date, field, old_value, new_value

`stable_key` is the API identifier when there is one, otherwise programme plus session, otherwise URL plus normalized title. It is what makes an extended deadline a change and not a new opportunity.

### Extraction

Runs only for sources with a change event:

1. **API records:** map fields directly. Ignore the status when the deadline has passed.
2. **Tables and lists:** a cheerio parser per source.
3. **PDF guides:** rules for Romanian dates, amounts and applicant terms.

Claude extraction is a possible later step, on changed documents only, with every value tied to a quoted passage. Decide after measuring how many values the rules miss.

### Relevance

| Label | Meaning | Digest |
|---|---|---|
| Direct | A farmer can apply alone | Shown first |
| Conditional | Depends on legal form or activity; regional SME calls may exclude primary agriculture | Shown, with the condition |
| Partnership | Only through a consortium, likely for most Horizon calls | Shown separately |
| Not relevant | Not for farmers | Kept, hidden |

### Digest

In Romanian, at the top of the daily report:

- New opportunities
- Changed deadlines or budgets
- Calls closing within 7 and 30 days
- Low-confidence items marked "verifică"

This changes one spec rule: closing deadlines appear even when no source changed. Every entry links to the official source and shows when it was last checked. Nothing is presented as final.

### Milestones

| # | Work | Done when |
|---|---|---|
| B1 | Check EC terms, build API client | Terms reviewed. Upcoming calls with future deadlines are stored. A failed query appears as an error, not an empty result. |
| B2 | `opportunities` tables, AFIR and MIPE parsers | Every open AFIR session on the live page appears with the right deadline. |
| B3 | Relevance labels | A hand-checked sample of 30 calls is labelled correctly, with errors reviewed. |
| B4 | Digest | A changed test deadline shows as a change. A call 7 days from closing appears on a quiet day. |
| B5 | Add sources: regional agencies, PAP, then GALs | Each new source passes the A3 noise check. |

**Plan B is done when** the digest lists all currently open AFIR sessions correctly and an extended deadline shows as a change, not as a new opportunity.

---

## After both plans

Scheduling and notifications come last, once the reports have proven reliable. Default: Windows Task Scheduler on this PC, then Telegram.

---

## Open decisions

| Decision | Default until decided |
|---|---|
| Where it runs | Windows Task Scheduler on this PC |
| Notification channel | None until reports are reliable, then Telegram |
| Audience: farmers or internal | Markdown digest first; `opportunities.json` for the app (now `web/`) if farmers will see it |
| Personalization by county, sector, legal form | Store the fields now, filter later |
| Claude extraction on PDFs | Rules first |
