# Progress

What has been built in `subventii-monitor/`, what has been proven, and what is left.
Plans are in `subventii-plan.md`, terms in `glossary.md`. Last updated 2026-11-07.

"Fixtures" means tested with made-up data. "Live" means checked against the real site.

## Status

| Milestone | State | Proven by |
| --- | --- | --- |
| A1 Sources and fetching | Done | Live: 171 of 180 sources reachable |
| A2 Change detection and database | Code done | Live in memory (11 sources). Never run on real Supabase |
| A3 Cleaner text, per-site noise | Done | Live: 147 pages compared, 3 noisy. 2 fixed, MySMIS is reported as blocked |
| A4 New link discovery | Built | Fixtures only |
| A5 Daily report | Built | Fixtures only |
| B1 EC API client | Built | Live: 96 calls read, 20 labelled for farmers |
| B2 Opportunities tables and parsers | Built | Parsers live on saved pages. Tables never run on real Supabase |
| B3 Relevance labels | Built | Live on saved MIPE data and fixtures |
| B4 Digest in the daily report | Built | Fixtures only |
| B5 Extra sources | Partly replaced | See below |

Tests: 134 passing, typecheck clean.

## To run it for real

Needs a hosted Supabase project.

1. Run the three files in `supabase/migrations/`, in name order, in the SQL Editor.
2. Fill `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env`.
3. Run `pnpm seed`, then `pnpm monitor` twice. The second run should show few downloads and no false changes.

## Plan A

### A1: done

- 179 sources parsed from `subventii-surse.md` (180 until two rows turned out to be the same ADR Sud-Muntenia page).
- Fetching with robots.txt checks, per-host pacing, retries, and conditional requests.
- Intermediate certificates added in `certs/`, so TLS checks stay on.
- Not reachable: DAJ Botoșani, MySMIS resources, APIA Cerere Unică, MADR Documente implementare PNS, MADR minimis news, EC TAM, DAJ Buzău, DAJ Sălaj, DAJ Hunedoara.

### A2: code done

- Cascade: headers, then conditional GET, then normalized text hash, then diff.
- `SupabaseStore` for production, `MemoryStore` for tests.
- Live in memory: second pass downloaded 549 KB against 6,646 KB, with no false changes.

### A3: done

- Text extraction with defuddle, selectors for `afir.ro` and `ansvsa.ro`, and the `noise-check` tool.
- Two saved passes of the same day compared: 147 pages, 3 noisy. A longer gap could still show date-based noise.
- `mfe.gov.ro` (2 pages): WordPress shuffled tag links, which are now removed.
- MySMIS: the site answers with a CAPTCHA page. It's now reported as blocked and never solved or retried.
- AFIR's live counter: the portal goes through a parser that leaves it out.
- Selectors for APIA and MADR weren't needed: their text was stable and sampled pages were main content.
- 4 moved links updated in the spec, one of which merged into an existing row. The APIA motorină page now sits in APIA's archive of finished measures.
- 4 pages have almost no text and go to manual checking: AGI Online, Registrul ajutoarelor de stat, DAJ Olt, DAJ Giurgiu.

### A4 and A5: built

- Links: silent first pass, keyword score, version grouping, at most 25 new sources per run.
- Report: Romanian Markdown, with "Nu s-a schimbat nimic." on quiet days.
- Left: try both on real pages.

## Plan B

### Sources

| Source | How | Result on real data |
| --- | --- | --- |
| AFIR portal | Parser | 7 components across DR-12, DR-14, DR-18 |
| MIPE calendar | Parser for the JSON inside the page | 1,089 calls, 281 not closed, 46 kept for farmers |
| EC Funding & Tenders | Official public API | 96 calls, 20 kept as partnership |

### What changed from the plan

- **Regional sites aren't needed for deadlines.** MIPE's list already covers all 8 regional programmes and the fisheries programme (PAP), so no regional parsers were built.
- **Not built:** GAL/LEADER sources, and a parser for the PNRR calendar. PNRR is still watched as a normal page.

### Decisions worth knowing

- A call's identity (`stable_key`) doesn't include its deadline, so an extension shows as a change rather than a new call.
- A parsed page's calls become its comparable text, so diffs show calls, and the free-text shrink alarm doesn't apply to it.
- If an EC request fails or returns nothing, stored calls stay as they are and the report shows the error.
- If a parser finds nothing, stored calls stay and the page is flagged for manual checking.
- A call that leaves a list before its deadline is reported, because the budget may have run out.
- Each source's first sync is silent, so the first report doesn't list everything as new.

### Known limits

- Relevance labels are a first filter, not an eligibility decision. They read MIPE's applicant text and call titles.
- B3's hand-check of 30 calls hasn't been done. On current MIPE data, no call is labelled direct and 46 are conditional.
- The EC API page confirms the API is public, but no usage limits were found. The client waits 2 seconds between requests.
- AFIR components have no applicant text, so all are labelled direct.
