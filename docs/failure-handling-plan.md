# Failure-Handling Plan: CropCash web (Next.js, `web/`)

**Date:** 2026-11-08 · **Sources:** `docs/07-architecture.md` §8–§11, `docs/12-deploy.md`, `CLAUDE.md`, codebase `web/` (yes) plus the API guards in `apps/api/src/routes/money.ts` · **Inventory:** `docs/app-inventory-web.md` (IDs DEP/OP/FL/RD/AS below refer to it; the shared `docs/app-inventory.md` uses its own numbering) · **Idempotency plan:** not yet created (recommended; see FAIL-03, FAIL-07)

## Summary

The web app depends on 10 things that can fail (inventory DEP-1…DEP-10). The offline design is good: farm copy, outbox, `data-needs-net`, a stale-data banner, and degraded weather/rates/monitor. The gaps are in what happens **between** "online" and "offline". **No browser call has a timeout**, so a slow rural connection leaves buttons on "Așteaptă puțin…" forever. **A write that worked can be reported as failed** when the refetch of `/api/me` after it fails. **A lost answer on a money move tells the farmer to try again**, which is the wrong advice. Two paths **lose queued records**: re-login wipes the outbox, and the flush treats 401/429 as "refused". **A page whose scripts fail to load stays blank.** The biggest structural win is one shared request helper in `lib/live/client.ts` with timeouts, a `timeout` error distinct from `network`, and error-code-aware messages. Almost every item below reuses it.

| Priority | Items |
| --- | --- |
| Must before launch / demo | FAIL-01, FAIL-02, FAIL-03, FAIL-04, FAIL-05, FAIL-06 |
| Should | FAIL-07, FAIL-08, FAIL-09, FAIL-10, FAIL-11, FAIL-12, FAIL-13, FAIL-14, FAIL-15 |
| Later | FAIL-16, FAIL-17, FAIL-18, FAIL-19, FAIL-20 |

## Status (2026-11-08)

Built and covered by unit tests. The manual game day at the end of the build plan has not been run, and neither have `test:integration`, `test:stripe` or `demo:rehearse` on this code.

| Item | State | Where |
| --- | --- | --- |
| FAIL-01 timeouts | Done | `lib/live/client.ts`, registry `timeout`, `plan-params.json` `network` |
| FAIL-02 refetch failure reported as save failure | Done | `send()` in `legacy/app.js` and `lib/cc/store.ts` |
| FAIL-03 money with a lost answer | Done | `lib/live/money-check.ts`, `moneyAnswerLost` |
| FAIL-04 queue wiped on re-login | Done | `clearFarmData`, `stampOutboxOwner` in `lib/live/auth.ts`, sign-out warning |
| FAIL-05 flush drops on 401/408/429 | Done | `classifyFlushError`, `afterFailedSend`, `retryDelay` in `lib/live/outbox.ts` |
| FAIL-06 blank page on boot failure | Done | `lib/boot-retry.ts`, `components/PageFailed.tsx`, `app/error.tsx`, `app/global-error.tsx` |
| FAIL-07 one id per form | Done | intent keys in the forms and assistant cards |
| FAIL-08 online detection | Done | ping with a time limit, a re-check after a failed call and when the phone is reopened |
| FAIL-09 signed in with no copy | Done | `guardTarget` in `lib/live/auth.ts` |
| FAIL-10 service worker | Done | `lib/live/service-worker.mjs` |
| FAIL-11 session expired mid-action | Done | `withFreshSession`. It shows the sign-in message and keeps the form; it doesn't redirect |
| FAIL-12 assistant loses the question | Done | `legacy/assistant.js`, `components/app/Assistant.tsx` |
| FAIL-13 messages per error code | Done | `lib/live/fail-text.ts` |
| FAIL-14 plan saves offline | Done | `enqueue`, `withOutbox` in `lib/live/outbox.ts`. A timed-out plan save is not queued, because it may have landed |
| FAIL-15 Netlify build pointing at localhost | Done | `lib/live/public-config.mjs` |
| FAIL-16 to FAIL-20 | Later, not built | |

## Shared mechanisms

1. **One request helper** (`lib/live/client.ts`, extended rather than replaced). It takes a timeout class per call (`read`, `write`, `money`, `health`, `ai`, `upload`) and uses `AbortSignal.timeout`. It throws `ApiError(0, 'timeout')` when the request was sent but no answer came, and `ApiError(0, 'network')` when the connection failed before sending. It reads `Retry-After` on 429/503 into `error.retryAfterMs`. It has **no automatic retries** (the comment "Nothing here retries or queues" stays true). Retries live only in the outbox (AS-1), so they can't multiply. `surse.js:56` and the ping at `app.js:108` move onto it, and Supabase gets the same timeout through `createClient(..., { global: { fetch: timedFetch } })` at `lib/live/index.ts:37`.
2. **One message map**: `failText(error, kind)` in `app.js` (today at line 175) gets the server's `error` code and the operation kind (`record`, `money`, `plan`, `read`) and returns the farmer's sentence. The pages already call `CC.failText`/`H.failText`, so they need no change. The texts are in FAIL-03 and FAIL-13.
3. **Outbox state machine**: one pure function, `classifyFlushError(error) → 'retry' | 'stop-auth' | 'refused'`, in `lib/live/outbox.ts`, unit-tested, used by `flushOutbox` (FAIL-05).
4. **Boot guard** in `components/LegacyPage.tsx`: catches boot failures, reloads once on a chunk-load error, otherwise shows a plain fallback (FAIL-06).

## Dependency matrix

| Dependency | Slow | Down | 5xx | 429 | Unknown outcome | Bad data |
| --- | --- | --- | --- | --- | --- | --- |
| DEP-1 API (reads) | timeout, keep copy | copy + banner | copy + banner | copy, retry later | n/a | schema check, keep copy (FAIL-17) |
| DEP-1 API (record writes) | timeout → queue | queue | stop flush, retry later | stop flush, honor `Retry-After` | resend with same `clientId` | 400/422 → refused list |
| DEP-1 API (money writes) | 20 s timeout | refuse, "Pornește internetul" | "N-a mers, nu s-a mutat nimic" | "Mai încearcă peste un minut" | **reconcile from `/api/me`**, no blind retry | n/a |
| DEP-2 Supabase Auth | 15 s timeout | "Nu putem intra acum" | same | `over_email_send_rate_limit` text (exists) | sign-in: harmless to repeat | n/a |
| DEP-3 Stripe (via API) | inside API's own timeout | API returns 5xx → as above | as above | as above | webhooks reconcile on server | n/a |
| DEP-4 Claude (via API) | 60–90 s timeout, keep question | hide/disable, manual path | message, keep input | `daily_limit` text (exists) | read-only, safe to retry | API validates with Zod |
| DEP-5 Netlify | SW cache after 4 s | SW cache | **serve cache, not the error** (FAIL-10) | n/a | n/a | n/a |
| DEP-6 Google Fonts | system font | system font | system font | n/a | n/a | n/a |
| DEP-7 Storage | n/a | in-memory for this visit | n/a | n/a | n/a | parse guards (exist) |
| DEP-10 Chunks | SW cache | reload once, then fallback | reload once, then fallback | n/a | n/a | n/a |

## Timeouts and retry policies

All values are starting points. Tune them with real latency from the VPS and a slow-3G phone.

| Dependency / call | Total timeout | Retries | Backoff | Idempotent? | Breaker |
| --- | --- | --- | --- | --- | --- |
| `/api/health` ping | 5 s | re-ping every 30 s while failing (exists) | fixed 30 s | yes | no |
| Reads: `/api/me`, `Live.read`, weather, rates, monitor | 10 s | 0 inline; next page load or `online` | — | yes | no |
| Record writes (`record_sale`, `add_expense`, `undo_transaction`, tasks) | 15 s | via outbox only | 30 s, 2 min, 10 min, 30 min + 0–20 % jitter; honor `Retry-After` | sales/expenses yes (`clientId`); tasks yes (set/unset); undo yes (by id) | stop flush on first transient error (exists) |
| Plan writes (`save_harvests`, `update_farm`, `save_apia_decision`, onboarding) | 15 s each | 0 automatic; manual retry is safe | — | yes (whole-document PUT; onboarding POST→409→update) | no |
| Money writes (`start/change/stop_pension`, `save_envelopes`, `/api/stripe/setup`, `simulate_apia_advance`, `advance_clock`, `set_pension_fund`) | 20 s | **0**: never automatic, never queued | — | start_pension/advance: guarded by 409; setup/advance_clock: **unknown**, see open questions | no |
| Supabase `signInWithPassword` / `signUp` / refresh | 15 s | 0 | — | yes | no |
| `/api/assistant` | 60 s | 0 | — | yes (no write) | no |
| `read_document` upload + LLM | 90 s | 0 | — | yes (no write) | no |
| `/api/sources` (Surse) | 15 s | 0 | — | POST dedupes by URL (`already: true`) | no |
| SW navigation race | 4 s to cache (exists) | — | — | — | — |

A circuit breaker isn't needed in the browser. The ping plus `isOnline()` already acts as one for the whole API.

## Criticality by flow

| Flow | Dependency | Tier | Behavior on failure |
| --- | --- | --- | --- |
| FL-1 Sign in | DEP-2 Auth | Core | keep email/password, specific message, retry button (exists, add timeout) |
| FL-1 Sign in | DEP-1 `/api/me` (landing) | Degradable (today: silently wrong) | go to `/acasa` but in the "farm not loaded" state, not Ion (FAIL-09) |
| FL-2 Onboarding | DEP-1 | Core | keep every field (exists), retry is safe (exists) |
| FL-3 Open page | DEP-5/DEP-10 | Core first visit, then SW | SW copy; chunk failure → reload once → fallback (FAIL-06) |
| FL-3 Open page | DEP-1 refresh | Degradable | saved copy + banner (exists) |
| FL-4 Note a sale | DEP-1 | **Deferrable** (exists) | queue on network/timeout; never drop silently (FAIL-04, FAIL-05) |
| FL-5 Tick task | DEP-1 | Deferrable (exists) | queue |
| FL-6 Money moves | DEP-1 + DEP-3 | Core | fail fast, never queue; unknown outcome → reconcile (FAIL-03) |
| FL-7 Plan changes | DEP-1 | Core (docs say Deferrable) | keep the form, retry (decide per FAIL-14) |
| FL-8 APIA paper | DEP-4 | Optional | "scrie de mână" path (exists); add timeout |
| FL-9 Assistant | DEP-4 | Optional | keep the question in the box (FAIL-12) |
| FL-10 Follow call | DEP-1 | Core (needs net, by design) | message (exists) |
| FL-11 Surse | DEP-1 | Core / Degradable for the list | saved list stays (exists) |
| FL-12 Sign out | DEP-2 | Optional (local sign-out works offline) | warn about unsent records (FAIL-04) |
| All | DEP-6 Fonts | Optional | system font |

## Details

### FAIL-01 · No browser call has a timeout

- **Where:** `lib/live/client.ts:33` (every API call), `legacy/app.js:108` (ping), `legacy/surse.js:56` (raw `fetch`), `lib/live/index.ts:37` (Supabase client with default `fetch`). All flows.
- **Current behavior:** `fetch` waits as long as the browser lets it (often minutes on a phone that has signal but no data). The button stays on "Așteaptă puțin…" / "Se salvează…", the `sending`/`busy` flags stay set, and the farmer can't try again without reloading. A ping that hangs leaves `isOnline()` true, so writes go out instead of into the outbox.
- **Failure modes covered:** slow, half-open connection, captive portal.
- **Plan:** Shared mechanism 1. Add the `timeoutClass` to `createApi` (`api(path, { ...init, timeout: 'money' })`) and map `Live.read` → `read` and `Live.write` → `write` by default. Money functions get `money`, using the existing `access` field in `FUNCTIONS` if it marks them, or else a list in `functions.ts`. On abort, throw `ApiError(0, 'timeout')`. In `send()` (`app.js:138`), queue on `timeout` too, for queueable writes only. That is safe because sales and expenses carry `clientId`.
- **User experience:** the button comes back after at most 20 s with a message (FAIL-03 table). The farmer's input stays in the form.
- **Observability:** count `timeout` vs `network` per path (FAIL-16).
- **Test:** unit test on `createApi` with a `fetchFn` that never resolves: it rejects with `code: 'timeout'` after the class's time (fake timers). Manual: DevTools "Slow 3G" plus a 30 s server delay on `/api/sales` gives a queued sale, not a stuck button.
- **Depends on:** none.

### FAIL-02 · A write that worked is reported as failed

- **Where:** `legacy/app.js:145`, the `/api/me` refetch at the end of `send()`, after `wrote = true`. Affects FL-2, FL-4, FL-6, FL-7, FL-8, FL-10.
- **Current behavior:** if the write succeeds and the refetch fails or times out, `send()` throws. Every page then shows "Nu am putut salva. Încearcă din nou." For a money move the farmer is told it failed when it worked, and a retry gets a 409 (`pension_exists`) that is also shown as a failure.
- **Plan:** wrap the refetch. On failure, keep the write's success, clear `cropcash-me-at` so the banner and `refreshFarm` know the copy is old, and resolve normally. The page reloads, and `refreshFarm()` (`app.js:58`) fetches again on load and reloads once more when the farm changed. Never turn a refetch failure into a write failure.
- **User experience:** "Salvat." The figures update on the next load, and the banner says the data may be behind until then.
- **Test:** mock `Live.write` OK and `Live.api('/api/me')` rejecting. `send()` resolves and `cropcash-me-at` is removed.
- **Depends on:** none.

### FAIL-03 · A lost answer on a money move is treated as "no internet, try again"

- **Where:** `legacy/app.js:175` (`failText`), `legacy/bani.js:36` (`problem`), `legacy/pensie.js:196` (`ask`), `legacy/subventii.js:37`. FL-6 (OP-10…OP-15).
- **Current behavior:** a `network` error after the request left the phone (connection dropped mid-answer) says "Nu am putut salva, pentru că nu ai internet. Încearcă din nou când îl ai." The pension may already be running. A second tap gets `409 pension_exists` (`routes/money.ts:70`) or `409 already_received` (`:107`), which shows as "Nu a mers. Încearcă din nou." `advance_clock` and `/api/stripe/setup` have no visible guard, so a second tap may repeat them.
- **Failure modes covered:** timeout with unknown outcome, connection reset, 409 after an earlier success.
- **Plan:**
  1. Money calls use the `money` timeout and are **never retried automatically** (already true, keep it).
  2. On `timeout`, or `network` raised after the request started: fetch `/api/me` (10 s) and **reconcile**. Compare the field the action changes (`pension_plans` active/amount, `envelopes`, `stripe_account_id`, `payouts`/`apia_advance` transaction, `demo_now`) with what was asked for. If it matches, treat it as success and reload. If it doesn't match, say it didn't happen. If `/api/me` also fails, show the "unknown" message and disable the button until the next successful refresh.
  3. Map 409 codes that mean "already done" to success-and-reload: `pension_exists` for start, `already_received` for the advance. Map `no_pension` on stop to success-and-reload too.
  4. Server side (outside `web/`, listed so the web plan is complete): add an idempotency key header to money routes and pass it to Stripe as `idempotencyKey`. The browser makes one key per dialog opening and resends it on a manual retry. Until that exists, `advance_clock` and `/api/stripe/setup` stay "unknown" in the open questions. Run the idempotency planner for this.
- **User experience (texts in Romanian, no "cam"):**

  | Situation | Message |
  | --- | --- |
  | offline before sending | „Pornește internetul ca să muți banii.” (exists) |
  | 5xx / refused | „N-a mers. Nu s-au mutat bani. Încearcă din nou.” |
  | unknown, reconciled to done | (no message, page reloads with the new state) |
  | unknown, reconciled to not done | „N-a mers. Nu s-au mutat bani. Încearcă din nou.” |
  | unknown, can't check | „Nu știm încă dacă s-a făcut. Nu apăsa din nou. Verificăm când ai internet.” |
  | 429 | „Prea multe încercări. Mai încearcă peste un minut.” |
- **Observability:** count reconciliations by outcome (done / not done / unknown).
- **Test:** API stub that commits `start_pension` and then drops the connection. The page shows the pension running after reconciliation, not an error. A second tap returning 409 `pension_exists` reloads into the running state.
- **Depends on:** FAIL-01; server idempotency (IDEM, to be planned).

### FAIL-04 · Queued records are wiped on re-login and on sign-out

- **Where:** `lib/live/auth.ts:135,144` (`signIn`/`signUp` call `clearFarmData`, which removes every `cropcash*` key, `cropcash-outbox` included), `:149–152` (`signOut`), `legacy/app.js:71` (a 401 on `refreshFarm` forgets the session and reloads). FL-4, FL-12.
- **Current behavior:** the farmer notes three sales offline on Saturday. On Monday the refresh token has expired, `/api/me` returns 401, the app signs them out, they sign in again, and `clearFarmData` deletes the three sales without a word. Sign-out does the same with no warning. This is the one silent data-loss path in the app.
- **Plan:**
  1. Store the owner with the queue: `cropcash-outbox` becomes `{ userId, items }` (`readOutbox` accepts the old array shape and treats it as "unknown owner").
  2. In `signIn`/`signUp`, clear farm data **except** an outbox whose `userId` matches the new session's user. Drop an outbox that belongs to a different user. Keep an "unknown owner" queue and flush it only after the first `/api/me` succeeds (one-time migration).
  3. On a 401 in `refreshFarm`: call `supabase.auth.refreshSession()` once. Only if that also fails, send the farmer to `/login?next=<this page>`. Keep the outbox; don't reload into a signed-out farm.
  4. `signOut` with pending items: the sign-out link first shows „Ai N înregistrări netrimise. Dacă ieși acum, se pierd. [Rămân] [Ies oricum]”. 07-architecture.md §8 says logout clears the outbox, so the warning keeps that rule and makes it visible.
- **Test:** unit tests on `createAuth` with a `memoryStore`: same user → outbox kept, other user → dropped, signOut → cleared. App test: 401 with refresh OK → no sign-out.
- **Depends on:** none.

### FAIL-05 · The outbox flush drops records on 401, 408 and 429, and can stall forever

- **Where:** `legacy/app.js:156–165`: `if (!(e?.status >= 400 && e.status < 500)) break;`, then every other 4xx moves the item to `cropcash-outbox-refused`. AS-1.
- **Current behavior:** an expired token (401), a rate limit (429), a proxy timeout (408) or a missing farm (404 `no_farm`) moves the farmer's sale to "refused", and the banner asks them to type it again. A record the server rejects with 5xx every time blocks every record behind it, with no limit and no message. Retries happen only on `online` events and page loads.
- **Plan:** `classifyFlushError` (shared mechanism 3):
  - *2026-11-08:* the function exists in `web/lib/live/outbox.ts` with two answers, `'retry' | 'refused'`; `invalid_input`/`unknown_function` (status 0, rejected on the phone) and other 4xx → `refused` (abstraction-plan A1). The 401, `no_farm` and backoff rows below are still to do.

  | Error | Action |
  | --- | --- |
  | 400, 422, `invalid_input` | move to refused (exists), with the server's code saved alongside |
  | 401 | stop the flush, refresh the session (FAIL-04 step 3), keep the item |
  | 403, 404 `no_farm` | stop, keep, show the "farm not loaded" state (FAIL-09) |
  | 408, 429, 5xx, `timeout`, `network` | stop, keep, schedule a retry with the backoff in the timeouts table, honoring `Retry-After` |

  Count attempts per item (`attempts`, `lastError` on the `OutboxItem`). After 8 transient failures spread over at least 24 h, move the item to refused with the reason, so the queue can't block silently. Add a retry timer and a `visibilitychange` trigger next to the `online` event (`app.js:689`).
- **User experience:** the banner (`app.js:666`) already says "N înregistrări se trimit când ai internet". After 3 failed tries while online it adds: „Serverul nu răspunde acum. Încercăm din nou singuri.”
- **Test:** pure tests for `classifyFlushError`. Flush with a stub that returns 401 then 200: the item stays, then goes out. 429 with `Retry-After: 60` schedules the next try at 60 s or later.
- **Depends on:** FAIL-01, FAIL-04.

### FAIL-06 · A page whose scripts fail to start stays blank

- **Where:** `components/LegacyPage.tsx:13`: `boot(...).catch((e) => console.error(...))`. `lib/boot.ts:469–475` throws on a missing module, a failed `import()`, or an exception in a page's `install()`. FL-3. There is no `error.tsx` or `global-error.tsx`, and those wouldn't catch this anyway, because the legacy scripts run outside React rendering.
- **Current behavior:** the HTML shell renders with empty slots (`#hello`, `#h-amount`…) and nothing else. Typical causes: a deploy removed old hashed chunks while a phone still had the old HTML (`ChunkLoadError`), the SW returned an error, or a script threw on unexpected saved data.
- **Plan:** in `LegacyPage`, on boot failure:
  1. If it's a chunk/import error and `sessionStorage['cropcash-boot-retry']` isn't set, set it and `location.reload()` once.
  2. Otherwise render a fallback inside `<main>`: „Pagina nu s-a deschis. [Încearcă din nou] [Mergi la Acasă]”, plus „Datele tale sunt păstrate pe telefon.” when a farm copy exists. Report it (FAIL-16).
  3. In `boot`, run each page module's `install()` inside try/catch so a failure in an optional module (`notifications`, `assistant`, `charts`) is logged and skipped instead of stopping the page. Core modules (`app`, the page's own script) still go to the fallback.
- **Test:** make `MODULES.acasa` reject. The page reloads once, then shows the fallback. A throwing `notifications` install leaves the rest of the page working.
- **Depends on:** none.

### FAIL-07 · The same sale can be saved twice when the answer is lost

- **Where:** `legacy/app.js:129`: `clientId` is created inside each `send()`, so each tap of "Salvează" in Recolte (`recolte.js:191`) gets a new id. The assistant card does it correctly (`assistant.js:135`, one id per card).
- **Current behavior:** on a 502 from Caddy or a timeout after the API committed (not queued, because only `network`/`offline` queue today), the farmer sees an error, taps again and gets a second sale with a new `clientId`.
- **Plan:** create the `clientId` when the record form opens or after a successful save resets it, keep it across retries of the same form, and pass it in `input`. `send()` already keeps an existing `clientId`.
- **Test:** submit, stub a 502 after commit, submit again: both requests carry the same `clientId`, and the server saves one row (`repo.ts:190` already dedupes).
- **Depends on:** FAIL-01.

### FAIL-08 · Online detection can be wrong for a long time

- **Where:** `legacy/app.js:102–114`. The ping has no timeout. It runs only at load and on `online`. After a successful ping, a later write failing with `network` doesn't set `pingFailed`.
- **Plan:** 5 s timeout on the ping. Set `pingFailed = true` and start the 30 s re-ping when any call fails with `network`/`timeout`. Re-ping on `visibilitychange` to visible. Keep `navigator.onLine` as a fast "definitely offline".
- **User experience:** the "Fără internet" banner and the `data-needs-net` buttons follow reality within 30 s.
- **Test:** ping stub that hangs → offline after 5 s; a write `network` error → banner shows.

### FAIL-09 · A signed-in farmer whose farm didn't load sees someone else's figures

- **Where:** `lib/live/auth.ts:96–110` (`landingPage` goes to `/acasa` when `/api/me` fails) plus `legacy/app.js:90` (`BASE_FARM` falls back to the locally typed farm or Ion when there is no `cropcash-me`).
- **Current behavior:** first sign-in on a new phone while the API is down: the farmer lands on Acasă with Ion's 15 ha in Teleorman, or an old local farm, and nothing says it isn't theirs.
- **Plan:** in `app.js`, when `signedIn()` and there's no farm copy, don't build pages from Ion or the local farm. Render a single state: „Nu am putut aduce ferma ta. [Încearcă din nou]”. Retry calls `refreshFarm()`. If `/api/me` says there's no farmer, go to `/onboarding` (refreshFarm already reloads; it needs this redirect added).
- **Test:** signed-in session, empty storage, `/api/me` 503 → "farm not loaded" state; then 200 → page reloads with the farm.

### FAIL-10 · The service worker serves error pages and can fail to install

- **Where:** `lib/live/service-worker.mjs:43` (`cache.addAll`, all-or-nothing), `:66–79` (`networkFirst` returns any network response, error status included).
- **Current behavior:** if Netlify answers 404/5xx (mid-deploy, incident), the farmer gets that error even though the SW has a good copy. If one of the ~100 files fails during install, nothing is cached and the app doesn't open offline, with no sign of it.
- **Plan:** in `networkFirst`, use the network response only when `res.ok`. Otherwise use the cache if it has the page, and the error if not. Install: cache pages and chunks with `addAll` (they are needed). Add large images (`harvest-2400.jpg`) with `Promise.allSettled` so they can't block the install. `cacheFirst` for fonts: catch the offline `fetch` and return `Response.error()` (now an unhandled rejection).
- **Test:** a pure test in `service-worker.test.ts` that runs `swSource` in a fake SW scope: network 503 plus a cached page returns the cached page.
- **Later, when `/ferma-lui-ion/*` routes are built:** `scripts/write-sw.mjs:11` keeps only top-level routes (`!f.includes('/')`), so the demo pages wouldn't open offline under their address.

### FAIL-11 · An expired session mid-action looks like a generic error

- **Where:** every `CC.send` caller. A 401 from `Live.write` reaches `failText`, which returns "Nu am putut salva. Încearcă din nou." Retrying never helps.
- **Plan:** in `send()`, on 401: `refreshSession()` once and retry the same call once (safe here: the request was rejected, nothing ran). If the refresh fails: „Trebuie să intri din nou în cont. Ce ai scris rămâne aici.” with a link to `/login?next=<page>`. Record forms keep their values.
- **Test:** write → 401, refresh OK → write retried once → success.

### FAIL-12 · The assistant loses the question, and long AI calls have no end

- **Where:** `legacy/assistant.js:197` clears the input before `ask()`, and on failure `turns.pop()` (`:186`) throws the question away. `:176` has no timeout, `papers.js:165` neither (an upload of several MB on 3G plus the LLM).
- **Plan:** clear the input only after a reply arrives. On failure, put the text back. Timeouts: assistant 60 s, `read_document` 90 s (FAIL-01 classes). Messages: 503 `assistant_unavailable` (exists); add `timeout` → „Răspunsul durează prea mult. Încearcă din nou sau întreabă mai scurt.” and, for papers, „Hârtia nu s-a citit la timp. Încearcă din nou sau scrie de mână.” The waiting text shows "încă mă uit…" after 15 s, so the wait is explained.
- **Test:** assistant stub that hangs: after 60 s the question is back in the box and the error bubble shows.

### FAIL-13 · Error messages ignore what the server said

- **Where:** `legacy/app.js:175` (`failText`) knows only `offline`/`network`. The API returns codes (`invalid_input`, `no_farm`, `stripe_not_set_up`, `pension_exists`, `too_much`, `credit_received`, `daily_limit`, 503 for a missing AI key).
- **Plan:** a single code → text map (shared mechanism 2), Romanian with diacritics, plain words. A few entries: `no_farm` → „Fă-ți întâi ferma.” (link to onboarding); `stripe_not_set_up` → „Deschide întâi contul CropCash din pagina Bani.”; `credit_received` → „Creditul a intrat deja, nu se mai poate scoate.”; 5xx → „Serverul are o problemă. Ce ai scris rămâne aici. Încearcă din nou peste puțin.”; fallback stays „Nu am putut salva. Încearcă din nou.” `language.test.ts` already guards the banned words; add the new texts to it.
- **Test:** table test over the map; every code the API can return for a page's calls has an entry.

### FAIL-14 · Plan changes can't be saved offline, but the docs say they can

- **Where:** `docs/07-architecture.md` §8 table: „Vânzări și cheltuieli înregistrate, schimbarea datelor fermei: ✅ prin outbox”. In code, `QUEUEABLE` (`lib/live/outbox.ts:9`) excludes `save_harvests`/`update_farm`, so Date plan and Recolte setup show the "no internet" error.
- **Plan:** decide (open question). Either (a) keep it online-only and fix the doc and the `data-needs-net` texts on those buttons, or (b) queue them as "last write wins" whole documents, coalescing to the newest entry per name. (b) is safe because both are full-document PUTs, but the salary shown would be provisional, as it already is for queued sales.

### FAIL-15 · A production build can point to `localhost`

- **Where:** `lib/live/public-config.mjs:27`: `apiUrl: env.VITE_API_URL || 'http://localhost:3001'`.
- **Current behavior:** a Netlify build without `VITE_API_URL` ships an app whose ping always fails. Every farmer sees "Fără internet", and sales queue forever.
- **Plan:** when `process.env.NETLIFY` or `NODE_ENV=production` is set, throw at build time if `VITE_API_URL` is missing or not `https://`. Keep the localhost default for `npm run dev`.
- **Test:** `publicConfig({ ..., NETLIFY: 'true' })` without `VITE_API_URL` throws.

### Later

- **FAIL-16 · Nothing reports browser failures.** Errors are swallowed in about 40 `catch {}` blocks, most of them correctly. Add `report(kind, detail)`: it logs to the console and does a best-effort POST to a small `/api/client-events` endpoint (rate-limited, no personal data). Report boot failures, money reconciliation outcomes, refused outbox items, timeouts per path, and SW install failure. The API should send an `x-request-id` back, and error messages can show its first 6 characters for support.
- **FAIL-17 · Bad data replaces a good copy.** `refreshMonitor` (`app.js:400–409`) saves whatever comes back. An empty `calls` list from a broken monitor replaces a good copy. Keep the old copy when the new list is empty and the old one wasn't, and mark it with the old date. `/api/me` isn't validated before it overwrites `cropcash-me`. Check the required fields (`name`, `parcels` array) and keep the old copy if they're missing.
- **FAIL-18 · Full storage makes queueing throw.** `writeOutbox` (`app.js:81`) isn't wrapped, so a full `localStorage` makes `queue()` throw, and the farmer gets "no internet" instead of "phone storage is full". Catch it and show „Telefonul nu mai are loc. Nu am putut păstra înregistrarea.”
- **FAIL-19 · Two tabs flush the same queue.** Each tab has its own `flushing` flag. Use `navigator.locks.request('cropcash-outbox', …)` when available. The dedupe by `clientId` already makes this harmless for sales and expenses.
- **FAIL-20 · Unhandled rejection on the login page.** `legacy/login.js:80–89`: the self-starting check (`isSignedIn`, `signOut`) has no catch. Wrap it so a failed `getSession` leaves the form usable.

## Multi-step flows

| Flow | Steps | Failure point | Compensation / resume |
| --- | --- | --- | --- |
| Onboarding (`onboarding.js:71`) | POST farmer → `save_harvests` → `save_apia_decision` → `/api/me` | any step | Resumable today: retry re-runs all steps, the POST turns into an update on 409, the others are whole-document PUTs. Keep the form (it is kept). Add FAIL-02 for the last step. |
| Plan save (`app.js:486`) | `save_harvests` → `update_farm` → `/api/me` | `update_farm` fails | Retry re-sends both, which is idempotent, so a plain retry finishes it. |
| Follow several variants (`app.js:431`) | one `follow_opportunity` per key | after k of n | Retry re-follows all (idempotent). Fine. |
| Money move + refresh | write → `/api/me` | refresh | FAIL-02 (refresh failure ≠ write failure). |
| Money move with unknown outcome | write → ? | answer lost | FAIL-03 reconciliation; server-side idempotency key. |

## Async work

| Job / consumer | Max attempts | DLQ | Alert | Replay |
| --- | --- | --- | --- | --- |
| AS-1 Outbox flush | 8 transient failures over ≥ 24 h per item (FAIL-05); validation errors at once | `cropcash-outbox-refused`, shown in the banner (exists) | banner on the phone; `report('outbox_refused')` | the farmer types it again in Recolte (exists). Later: a "Trimite din nou" button for refused items whose cause was temporary |
| AS-2 `refreshFarm` | 1 per page load | n/a | — | next load |
| AS-3 `refreshMonitor` | 1 per page load, 1 h cache | n/a | — | next load |
| AS-5 SW install | browser retries on next navigation | n/a | `report('sw_install_failed')` | — |

## Observability and alerts

| Signal | Threshold | Severity | Runbook |
| --- | --- | --- | --- |
| External uptime check on `https://cropcash-api.andreitutea.com/api/health` | 2 failures in a row (1-min interval) | page the team during demo days | `pm2 status`, `pm2 logs`, Caddy certificate, VPS reachable? Restart with `pm2 restart`. The phones keep working offline; queued records go out once it's back. |
| Uptime check on the Netlify site `/acasa` | 2 failures | high | Netlify status, latest deploy; roll back the deploy in Netlify. |
| `client-events`: boot failures | > 5 in 10 min | high | usually a deploy that removed chunks: check the SW version and that the reload-once ran. |
| `client-events`: money reconcile "unknown" | any | high | check Stripe dashboard and `pension_plans` for that farm. |
| `client-events`: outbox refused | > 3 per day | medium | look at the saved error codes: a validation change on the API that older phones don't know? |
| API 5xx rate (pm2 logs / Caddy access log) | > 5 % for 5 min | medium | logs by route. |

## Fault-injection tests

| Test | Injected fault | Expected behavior |
| --- | --- | --- |
| `client.test.ts` timeout | `fetchFn` never resolves | rejects `timeout` after the class's time; no retry |
| `client.test.ts` 429 | 429 + `Retry-After: 30` | `ApiError(429)` with `retryAfterMs = 30000` |
| `outbox.test.ts` classify | 400, 401, 404, 408, 429, 500, timeout | refused / stop-auth / stop / retry as in FAIL-05 |
| auth store | sign-in as same user with 2 queued records | records kept; other user → dropped |
| `send()` | write OK, `/api/me` rejects | resolves; copy marked old (FAIL-02) |
| money reconcile | `start_pension` commits, connection drops | page shows the pension running, no error |
| money 409 | `pension_exists` | reloads into the running state |
| boot | `import('../legacy/acasa.js')` rejects | one reload, then the fallback text |
| SW | network 503, page in cache | cached page served |
| Recolte | 502 after commit, tap again | same `clientId` twice, one row |
| Assistant | hang 60 s | question back in the input |
| Game day (before the demo) | phone on "Slow 3G", then airplane mode, then `pm2 stop` on the VPS during: note a sale, start the pension, open every page, sign in | each step shows what this plan says; nothing stuck, nothing lost, no duplicate charge |

## Assumptions

- Timeout values are starting points; there is no latency data from rural phones or from the VPS.
- Stripe calls happen only on the API, so the web plan covers Stripe through what the API returns. Server-side Stripe timeouts, idempotency keys and webhook reconciliation belong to an API-side plan.
- The single-user-per-farm rule from §8 holds, so "last write wins" is acceptable for queued whole-document writes.
- `localStorage` stays the store; the IndexedDB / TanStack Query plan in §8 points 2–4 isn't being built.

## Open questions

- Does `deps.money.setup` reuse an existing Stripe customer/account when called twice, or create a second one? — affects FAIL-03
- Does a resent `advance_clock` advance demo time twice? — affects FAIL-03
- Should plan changes (Date plan, Recolte setup) work offline as the docs say, or stay online-only? — affects FAIL-14
- Is a `/api/client-events` endpoint acceptable (small, no personal data), or should browser failures only go to the console for the hackathon? — affects FAIL-16
- Which uptime checker should the team use for the alerts, and who gets the alert during the demo? — affects Observability
