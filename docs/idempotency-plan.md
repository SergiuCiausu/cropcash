# Idempotency Plan: CropCash (`web/` and the API it calls)

**Date:** 2026-11-08 · **Sources:** `CLAUDE.md`, `docs/07-architecture.md` §8, `docs/08-stripe.md`, `docs/web-react-port-plan.md`, `docs/13-auth-demo-loading-plan.md`, codebase (yes) · **Inventory:** `docs/app-inventory.md`

Status: **Must (IDEM-01…07) built on 2026-11-08** as step 12 in `docs/10-plan.md`, with migration `018_idempotency.sql`. The Shoulds (IDEM-08…12) are step 13, built on 2026-11-08 with migration `019_harvests_version.sql`. Queued harvest saves wait for FAIL-14 in `docs/failure-handling-plan.md`. The Laters (IDEM-13…15) are step 14, built on 2026-11-08. `docs/abstraction-plan.md` doesn't exist yet.

What was built differs from the details below in four places, each simpler and just as safe:
- **IDEM-02:** no `starting` status and no claim RPC. Under the lease, `startPension` first lists the customer's active subscriptions and takes over one with this farm's `metadata.farmer_id`, which covers a crash between Stripe and the DB.
- **IDEM-03:** no partial unique index. Within one demo the advance clock also pays next year's APIA advance, so `(farmer_id, kind)` would refuse it. The lease plus the `received` check plus the Stripe key `cc:income:<farm>:apia_advance:<date>:-` cover it.
- **IDEM-04:** the test clock and the account update send no key, because their body holds "now" and Stripe refuses a key reused with other values. The clock id is saved right after it's made, and the update is a set. The customer key includes the clock id.
- **IDEM-01:** `from` is optional, so `scripts/rehearse-demo.ts` and the seed keep working. Without it, the server uses the current `demo_now`, still under the lease.
- Also done early from IDEM-09: `PUT /api/pension` holds the lease and skips Stripe when the amount is already the one asked for.

## Summary

`web/` triggers 25 side-effecting operations (OP-1…OP-25). Most are already safe to repeat:

- tasks, follows, the APIA decision, the pension fund and the envelopes are upserts or "set to this value" writes;
- sales and expenses carry a `clientId`;
- the Stripe webhook dedupes on `stripe_object_id`.

**7 are unsafe today, and all of them touch money or the salary.** None of the Stripe calls sends an idempotency key, and every one of them follows a "check in the DB, then create in Stripe" pattern. So a second tab, a double tap that gets past the button guard, or a retry after a lost answer creates a second subscription, PaymentIntent or payout.

The Severe ones are:
- **advance clock** (IDEM-01): pays salaries and incomes a second time;
- **start pension** (IDEM-02): two subscriptions that both charge every month;
- **simulate APIA advance** (IDEM-03): the advance arrives twice.

On the client, the sale/expense `clientId` is made per call, not per intent. A retry after a 5xx gets a fresh id and saves the record twice (IDEM-05).

The plan adds three small shared pieces:
1. an intent-key helper in `web/lib/live`;
2. a per-farm lease table for Stripe operations;
3. deterministic Stripe idempotency keys.

Everything else uses natural keys and guarded state changes that live with each operation.

| Priority | Operations |
| --- | --- |
| Must before launch | IDEM-01, IDEM-02, IDEM-03, IDEM-04, IDEM-05, IDEM-06, IDEM-07 |
| Should | IDEM-08, IDEM-09, IDEM-10, IDEM-11, IDEM-12 |
| Later | IDEM-13, IDEM-14, IDEM-15 |

"Severe" below means money moves twice in Stripe. Stripe runs in test mode only, so no real lei move. For the demo, though, it shows a wrong balance and a wrong salary on stage, and the same code would double-charge with live keys.

## Shared mechanisms

### M1 · Intent key on the client (`web/lib/live/intent.ts`)
- `newIntentKey(): string` returns a UUID v4. It uses `crypto.randomUUID` when present and falls back to `crypto.getRandomValues`. The fallback matters because `randomUUID` exists only in secure contexts: a phone testing over `http://192.168…` gets no id today, and the guard at `web/legacy/app.js:126` then skips the `clientId` silently.
- A key is made **when the farmer starts an intent** (a form or confirm dialog opens, or an assistant card appears). It is kept on that form or dialog and reused for every retry until the write succeeds or the inputs change. It is never made per click.
- `Live.write(name, input, { key })` sends the key in an `Idempotency-Key` header (for routes in M3) or as `clientId` / `groupId` in the body (for routes with a natural key, IDEM-05 and IDEM-07).
- It lives in `web/lib/live`, so it survives the React port (`docs/web-react-port-plan.md`), where `web/legacy/*.js` goes away.

### M2 · Per-farm lease for Stripe operations (`farm_leases`, migration `018_farm_leases.sql`)
```sql
create table farm_leases (
  farmer_id uuid not null references farmers(id) on delete cascade,
  op text not null,                -- 'stripe_setup' | 'pension' | 'demo_money'
  holder uuid not null,            -- random per request
  expires_at timestamptz not null,
  primary key (farmer_id, op)
);
-- take_farm_lease(p_farmer, p_op, p_holder, p_ttl_s) returns boolean:
--   insert … on conflict (farmer_id, op) do update set holder = p_holder, expires_at = now() + ttl
--   where farm_leases.expires_at < now()   -- only an expired lease can be taken over
-- release_farm_lease(p_farmer, p_op, p_holder): delete where holder = p_holder
```
- A table is used, not `pg_advisory_lock`. The API talks to Postgres through supabase-js/PostgREST, where every call is its own transaction, so a session advisory lock can't span the Stripe calls.
- TTL: 120 s for setup and pension, 900 s for `demo_money` (one `advance` of 12 months takes minutes). The holder releases the lease in `finally`.
- When the lease is taken, the request gets **409 `busy`** and the page says „Se lucrează deja la asta. Încearcă din nou peste un minut.” The client may retry with the same intent key.
- Written with the service-role client (`db/admin.ts`). Rows disappear on release. An expired row is simply taken over, so no cleanup job is needed.

### M3 · Deterministic Stripe idempotency keys (`stripe/money.ts`, helper `key(...parts)`)
- Every Stripe create or update call passes `{ idempotencyKey }` built from the farm id plus the business identity of the effect, never a random value. For example: `cc:salary:<farmerId>:<payday>`, `cc:income:<farmerId>:<kind>:<date>:<cropId|paymentId|->`, `cc:pension-sub:<farmerId>:<intentKey>`.
- Stripe keeps v1 keys for 24 h. Past that window, the DB guards in each operation are what stop a duplicate. The keys cover the "crashed between the Stripe call and our insert" window.

### Existing natural keys this plan relies on (already built)
| Guard | Where |
| --- | --- |
| `transactions.stripe_object_id` unique, upsert ignore-duplicates | `001_init.sql:66`, `db/admin.ts:71-76` |
| `transactions (farmer_id, client_id)` unique where not null | `017_transaction_client_id.sql:7-9` |
| `payouts (farmer_id, scheduled_for)` and `stripe_payout_id` unique | `001_init.sql:75-77` |
| `pension_plans.farmer_id` unique | `001_init.sql:82` |
| `task_completions` PK `(farmer_id, task_id)` | `010_records_tasks.sql:30` |
| `opportunity_follows` PK `(farmer_id, stable_key)` | `013_opportunities_app.sql:15` |
| `farmers.user_id` unique (one farm per account) | `001_init.sql:12` |

No generic `idempotency_keys` response table is proposed. Every unsafe operation here either has a natural identity (a payday, a campaign year, a client id) or can be turned into "make it so" with a state guard, and those are simpler to reason about. If the abstraction planner later picks shared middleware, M1's header is already in place for it.

## Operations

| ID | Operation (inventory ID) | Duplicate sources | Consequence | Pattern(s) | Priority |
| --- | --- | --- | --- | --- | --- |
| IDEM-01 | Advance clock, demo (OP-19) | tap after a network error, second tab, retry after a crash midway, slow request (minutes) | Severe | absolute target + guarded transition + M2 lease + M3 keys + payout claim | Must |
| IDEM-02 | Start pension (OP-15) | second tab, retry after 5xx/lost answer, crash between Stripe and DB | Severe | guarded transition (`starting`) + M1 key + M2 lease + M3 keys | Must |
| IDEM-03 | Simulate APIA advance, demo (OP-18) | second tab, retry after the 30 s wait fails, crash before insert | Severe | M3 key on the natural identity + M2 lease + replay as success | Must |
| IDEM-04 | Stripe setup (OP-14) | second tab, retry after a partial failure | High | M2 lease + M3 keys + save each id as soon as it exists | Must |
| IDEM-05 | Record sale / add expense (OP-5, OP-6) | retry after 5xx with a new `clientId`, concurrent same `clientId` on expenses, no `randomUUID` | High | M1 key per intent + unique `(farmer_id, client_id)` + race-safe `record_expense` | Must |
| IDEM-06 | Stop pension (OP-17) | retry after lost answer, crash after Stripe cancel | High | guarded transition (`stopping`) + tolerate "already canceled" + replay as success | Must |
| IDEM-07 | Add credit, via the assistant (OP-10) | retry after error on the card, two answers proposing the same credit | High | client `groupId` (M1) + unique index | Must |
| IDEM-08 | Outbox flush and undo (OP-24, OP-7) | every open tab flushes, undo during flush, old items without `clientId` | High | Web Locks + backfill `clientId` + id map | Should |
| IDEM-09 | Change pension (OP-16) | retry, double tap | Medium | "set to amount" + reuse price by lookup key + M2 lease | Should |
| IDEM-10 | Stripe webhook, payouts (OP-23) | redelivery, out-of-order `payout.paid` after `payout.failed` | Medium | guarded transition on payout status | Should |
| IDEM-11 | "Already done" answers shown as errors (OP-7, OP-8, OP-10, OP-15, OP-17, OP-18) | the retry of a write that worked | Medium | replay as success on the client | Should |
| IDEM-12 | Save harvests + update farm (OP-3, OP-4) | two tabs/devices, half-done pair | Medium | optimistic concurrency (`harvests_version`) | Should |
| IDEM-13 | Read a paper, ask the assistant (OP-20, OP-21) | retry after 502 | Medium (cost) | short response cache by content hash | Later |
| IDEM-14 | Add own source (OP-22) | double submit, two tabs | Low | already natural-key; count the limit once | Later |
| IDEM-15 | Signed-out local writes (OP-25) | double submit before reload | Low | button pending state | Later |

Already safe, no change: OP-1 (Supabase handles a repeated sign-up and rate-limits the email), OP-2 (409 → falls back to update, `web/legacy/onboarding.js:74`), OP-9, OP-11, OP-12, OP-13, OP-23 for `payment_intent.succeeded` and `invoice.paid`.

## Details

### IDEM-01 · Advance clock, demo (`POST /api/demo/advance`)

- **Trigger and current behavior:**
  - `web/legacy/bani.js:150-155` sends `{ months }`. The `busy` flag (`bani.js:38-40`) stops a double tap in one tab only.
  - `MoneyService.advance` (`stripe/money.ts:295-336`) computes the steps from the current `demo_now`. For each step it:
    - creates a PaymentIntent with no idempotency key (`money.ts:122-131`);
    - creates a payout with no idempotency key (`money.ts:205-208`) and only then upserts the `payouts` row (`money.ts:209`).
  - It moves `demo_now` only after each two-month chunk (`money.ts:324`).
  - "Advance N months" is relative: the same request sent twice moves the clock 2N months.
- **Duplicate sources:**
  - The farmer taps again after a phone network drop, because `advance_clock` is not queueable, so the button comes back.
  - A second tab or phone.
  - The request runs for minutes (30 s wait per income, up to 60 s per clock move), so a mobile connection often drops while the server keeps going.
  - pm2 restarts in the middle.
- **Consequence:** Severe. A crash after a payout but before `demo_now` moves means the retry recomputes the same steps. Each income gets a new PaymentIntent (new `pi.id`, so the unique `stripe_object_id` doesn't help) and each salary a second Stripe payout. The `payouts` upsert ignores the duplicate row, but the money already left in Stripe. A plain retry after success advances the demo another N months.
- **Pattern(s):** 5 guarded transition, 10 lease (M2), 8 provider keys (M3), 3 claim row for payouts.
- **Key:**
  - The client sends `{ months, from: <demo_now it saw> }`. `from` comes from the saved `/api/me` copy.
  - The server targets `addMonthsIso(from, months)`, not the current `demo_now`.
  - Stripe keys: `cc:income:<farmerId>:<kind>:<date>:<cropId|paymentId|->` and `cc:salary:<farmerId>:<payday>`.
  - The test clock advance needs no key: it is "advance to `frozen_time`". The server skips it when `testClocks.retrieve(...).frozen_time >= target`.
- **Storage and retention:** M2 lease `('demo_money', 900 s)`. A claim row in `payouts`: insert `(farmer_id, scheduled_for, status 'creating')` before calling Stripe, via the existing unique `(farmer_id, scheduled_for)`. If the insert conflicts, skip the step. After Stripe answers, update the row to the `stripe_payout_id` and `pending`. Add `'creating'` to the allowed statuses in the migration.
- **In-flight duplicate:** lease taken → 409 `busy`.
- **Replay response:**
  - `demo_now == target` → 200 `{ events: [], already: true }`, and the page reloads as on success.
  - `demo_now` between `from` and `target` (an earlier run crashed) → the server resumes from `demo_now` to `target`; every step is safe to repeat.
  - Any other `demo_now` → 409 `stale_clock`, and the page reloads to show the real date.
- **Side effects:** Stripe keys cover a crash between the Stripe call and our insert within 24 h. Expenses and repayments already use deterministic ids (`money.ts:163, 178`).
- **Client side:** `from` comes from the saved copy, so a second tab with an old copy gets `stale_clock` instead of a second advance. The button already disables itself.
- **Tests:**
  - Sequential: call twice with the same `from` → one set of payouts and incomes, and the second call returns `already: true`.
  - Concurrent: two calls at once → one runs and the other gets 409 `busy`.
  - Fail midway: a fake Stripe throws after the first payout; retry → no second `payouts.create` for that payday (assert the call count on the fake), and incomes are not repeated.
  - Stale: `from` older than `demo_now` → 409, nothing in Stripe.
  - Add these to `apps/api/src/webhook.test.ts`'s fake-Stripe style tests. Run one real case in `npm run test:stripe`.

### IDEM-02 · Start pension (`POST /api/pension`)

- **Trigger and current behavior:**
  - The confirm dialog at `web/legacy/pensie.js:196-217` disables "Bine așa" while the request runs, then re-enables it on any error.
  - The route checks `running(farm)` (`routes/money.ts:70`), then creates a price and a subscription with no keys (`stripe/money.ts:224-234`), then upserts `pension_plans` on `farmer_id` (`money.ts:235-240`).
- **Duplicate sources:**
  - A second tab, since both pass `running()` before either writes.
  - A retry after a 5xx when the subscription already exists.
  - A crash after `subscriptions.create` and before `upsertPension`: the retry sees no running plan and creates another.
- **Consequence:** Severe. Two subscriptions on one customer both charge every month. The upsert keeps only the last `stripe_subscription_id`, so stopping the pension cancels one and the other keeps charging. `syncPensionInvoices` records every paid invoice of the customer, so the pension shows twice what the farmer chose and the salary drops.
- **Pattern(s):** 5 guarded transition, 2 client key (M1), 10 lease (M2), 8 provider keys (M3).
- **Key:** the intent key is made when the "Pornești pensia?" dialog opens. It is sent as the `Idempotency-Key` header and stored as `pension_plans.start_key`. Stripe keys: `cc:pension-price:<farmerId>:<key>`, `cc:pension-sub:<farmerId>:<key>`.
- **Storage and retention:** new columns `pension_plans.start_key uuid`, and `status` gains `'starting'`. A claim RPC `claim_pension_start(p_farmer, p_key, p_monthly)` inserts or updates the row to `starting` with `start_key = p_key`, only when there is no row or the row is `stopped`. If the row is `starting` with the same key, it returns `resume`. It also needs a Stripe step-zero check: before creating, `subscriptions.list({ customer, status: 'active' })`. A subscription with `metadata.farmer_id` and `metadata.start_key = key` is adopted, not duplicated. That check covers retries after the 24 h key window.
- **In-flight duplicate:** M2 lease `('pension', 120 s)` → 409 `busy`.
- **Replay response:**
  - Plan `active` with the same `start_key` → 201 `{ ok: true }`, the same as the first answer.
  - `active` with a different key → 409 `pension_exists`. This is a real conflict, e.g. another phone started it.
- **Side effects:** Stripe keys plus adopt-by-metadata. `fixSalary` is a set, so it is safe.
- **Client side:**
  - Keep the key while the dialog is open, so "Bine așa" after an error resends the same key.
  - Make a new key only when the dialog is opened again with a different amount.
- **Tests:**
  - Sequential with the same key → one subscription and a 201 both times.
  - Concurrent with two different keys → one 201 and one 409 `busy`/`pension_exists`; the fake Stripe sees one `subscriptions.create`.
  - Fail after `subscriptions.create` → retry with the same key → no second create, and the plan becomes `active`.
  - Webhook `invoice.paid` redelivered → one pension transaction (already true).

### IDEM-03 · Simulate APIA advance, demo (`POST /api/demo/income`)

- **Trigger and current behavior:**
  - `web/legacy/bani.js:164-168`.
  - The route checks `plan.received` for `apia_advance` (`routes/money.ts:107`), then `income()` creates a PaymentIntent with no key (`stripe/money.ts:122-131`).
  - The transaction is upserted on `pi.id` (`money.ts:132-141`).
  - Then the route waits up to 30 s for the balance (`money.ts:144-146`).
- **Duplicate sources:**
  - Two tabs.
  - A tap again after the long wait ends in a network error.
  - A crash after the PaymentIntent and before the insert. The webhook usually records it later, but a retry before the webhook arrives creates a second one.
- **Consequence:** Severe. Two transfers to the farmer's account and two `apia_advance` rows with different `pi.id`. The salary plan counts the advance twice.
- **Pattern(s):** 8 provider key on the natural identity, 10 lease (M2), 3 natural key in the DB.
- **Key:** `cc:income:<farmerId>:apia_advance:<campaignYear>`. The advance happens once per campaign, so no client key is needed. Add a partial unique index `transactions (farmer_id, kind, harvest_year) where kind in ('apia_advance','apia_balance') and source = 'stripe_transfer'` so the DB refuses a second one after the 24 h key window. Check that `harvest_year` is set on these rows; set it in `income()` if not.
- **Storage and retention:** the M2 lease `('demo_money')` is shared with IDEM-01, so an advance and an income can't run at the same time either.
- **In-flight duplicate:** 409 `busy`.
- **Replay response:** already received → **200 `{ event: <the stored one>, already: true }`** instead of 409 `already_received`. The page then reloads as on success (see IDEM-11).
- **Side effects:** Stripe key. The webhook upsert on `pi.id` stays as is.
- **Client side:** the button already disables itself; nothing more is needed.
- **Tests:** sequential → one PaymentIntent and one row; concurrent → one 201 and one 409 `busy`; fail after create → retry gets the same PaymentIntent from Stripe (same key) and one row; `payment_intent.succeeded` redelivered → one row.

### IDEM-04 · Stripe setup (`POST /api/stripe/setup`)

- **Trigger and current behavior:**
  - `web/legacy/bani.js:163`.
  - `setup()` (`stripe/money.ts:63-116`) creates whatever is missing, in this order:
    1. the account, followed by account update, `createExternalAccount` and payout schedule;
    2. the test clock;
    3. the customer, with an attached card.
  - It writes `stripe_account_id` only after all four account calls (`money.ts:97`). The comment says "Idempotent", which holds only for sequential calls that all succeed.
- **Duplicate sources:**
  - Two tabs, which both see `acct = null`.
  - A failure in `accounts.update` or `createExternalAccount`: the account exists in Stripe but not in the DB, so the retry creates a new account.
- **Consequence:** High. Orphan connected accounts, test clocks and customers; the last writer wins in `setStripeIds`. If an orphan customer gets a pension later, the charges hit an account the app no longer looks at.
- **Pattern(s):** 10 lease (M2), 8 provider keys (M3), 1 naturally idempotent "ensure" steps.
- **Key:** `cc:setup-account:<farmerId>`, `cc:setup-bank:<farmerId>`, `cc:setup-clock:<farmerId>`, `cc:setup-customer:<farmerId>`, `cc:setup-pm:<farmerId>`.
- **Storage and retention:**
  - Save `stripe_account_id` **right after** `accounts.create`. Then run the update, bank and schedule calls as "ensure" steps. Update and schedule are sets. For the bank account, check `listExternalAccounts` first.
  - After 24 h the DB ids are what guard.
  - Before creating an account, also search by `metadata.farmer_id` (`accounts.list` is v1-only, see the open question) to adopt an orphan from an earlier failure.
- **In-flight duplicate:** M2 lease `('stripe_setup', 120 s)` → 409 `busy`.
- **Replay response:** everything set → 200 with the same ids. This already happens.
- **Client side:** nothing new.
- **Tests:** concurrent → one `accounts.create`; fail after `accounts.create` → retry → no second create and the id is saved; sequential → no Stripe create calls on the second run.

### IDEM-05 · Record sale / add expense (`POST /api/sales`, `POST /api/expenses`)

- **Trigger and current behavior:**
  - `send()` gives each **call** a fresh `clientId` (`web/legacy/app.js:126`). The Recolte form builds a new `input` on every submit (`web/legacy/recolte.js:188-199`).
  - A network error queues the same input, so that path is safe.
  - A **5xx** is not queued (`app.js:136-138`), so `sendRecord` re-enables the form (`recolte.js:180-186`). The next tap on "Salvează" sends a new `clientId`. A 5xx can happen after the commit, e.g. the 201 is lost when `planFor()` fails after the insert (`routes/records.ts:54-56`).
  - The assistant card is already right: it makes one id per card (`web/legacy/assistant.js:137-139`).
- **Duplicate sources:** a resubmit after 5xx; `crypto.randomUUID` missing (no `clientId` at all); two concurrent requests with the same `clientId` on expenses.
- **Consequence:** High. The sale or expense counts twice in the money, the salary and the forecast. An expense also takes from the envelope twice.
- **Pattern(s):** 12 client key per intent (M1), 3 unique `(farmer_id, client_id)` (already built), plus a race fix.
- **Key:** made when the record form opens or the record kind is chosen, kept until success or until an amount/date/crop field changes. Scope: per farm.
- **Storage and retention:** `transactions.client_id`, forever (it's the row).
  - **Race fix in `record_expense`** (`017_transaction_client_id.sql:40-55`): it selects by `client_id`, then inserts, so two concurrent calls with the same id both miss the select and the second insert raises 23505 → 500. Fix it in a new migration with `perform pg_advisory_xact_lock(hashtextextended(p_client_id::text, 0))` before the select. Both calls are inside one RPC transaction, so a transaction-level lock works here.
  - `addSale` already turns 23505 into "return the existing id" (`db/repo.ts:190-194`).
- **In-flight duplicate:** the second call waits on the lock, then returns the saved id.
- **Replay response:** 201 with the original id. For expenses the envelope is not touched again (already so).
- **Client side:**
  - The key lives on the form (`form.dataset.intent`) and in the React port in the form's state.
  - `send()` keeps assigning one only when the input has none, which stays as a fallback.
  - Use M1's `getRandomValues` fallback.
- **Tests:**
  - Sequential with the same `clientId` → one row and the same id (exists for sales; add one for expenses).
  - Concurrent with the same `clientId` → one row, no 500, envelope taken once.
  - 5xx after the insert, then the form resubmits → one row (client test with a fake API in `web/lib/live`).

### IDEM-06 · Stop pension (`DELETE /api/pension`)

- **Trigger and current behavior:** the route checks `running()` and calls `subscriptions.cancel`, then `updatePension(status 'stopped')` (`stripe/money.ts:265-268`).
- **Duplicate sources:** a retry after a lost answer; a crash between the Stripe cancel and the DB update.
- **Consequence:** High.
  - A plain retry gets 409 `no_pension`, so the farmer sees „Nu am putut salva” for something that worked.
  - After a crash the DB says `active` while Stripe says canceled. Every retry calls `cancel` on a canceled subscription, Stripe refuses, and the farmer gets 500 forever.
  - The salary keeps the pension subtracted.
- **Pattern(s):** 5 guarded transition, 1 tolerate "already done", M2 lease `('pension')`.
- **Key:** the subscription id. No client key is needed: "stopped" is a target state.
- **Storage and retention:**
  1. Set `status = 'stopping'` where it is `active`.
  2. Cancel in Stripe. Treat `subscription.status === 'canceled'` (retrieve first) or Stripe's "already canceled" error as success.
  3. Set `stopped`.
  A `stopping` row is resumed by the next call.
- **In-flight duplicate:** 409 `busy`.
- **Replay response:** already `stopped` → **204**, not 409.
- **Tests:** stop twice → 204 both times and one Stripe cancel; fail after the cancel → retry → 204 and the DB is `stopped`.

### IDEM-07 · Add credit, via the assistant (`POST /api/credits`)

- **Trigger and current behavior:**
  - Only the assistant card calls `add_credit` (`apps/api/src/ai/assistant.ts:20-27`, `web/legacy/assistant.js:141-153`).
  - The server makes a random `group_id` (`db/repo.ts:140`).
  - The card re-enables "Da, salvează" after an error, and the retry inserts a second pair of rows.
- **Duplicate sources:** a retry after 5xx or a lost answer; a double answer from the assistant proposing the same credit twice (two cards).
- **Consequence:** High. Two credits in the plan: the salary is fixed lower (`routes/plan.ts:45`) and the forecast shows a repayment twice.
- **Pattern(s):** 12 client key (M1), 3 unique constraint.
- **Key:** `groupId` (uuid), made when the card is shown, the same as `clientId` for sales. Add an optional `groupId` to `CreditInputSchema`. The server uses it instead of `crypto.randomUUID()` when given.
- **Storage and retention:** unique index `expected_payments (farmer_id, group_id, kind)`. On 23505 → return 201 `{ groupId }` without changing anything.
- **In-flight duplicate:** the unique index; the loser returns the same `groupId`.
- **Replay response:** 201 with the same `groupId`.
- **Client side:** `showCard` adds `groupId` for `add_credit`, next to the existing `clientId` line.
- **Tests:** the same `groupId` twice → two rows (in + out), not four; the salary is set once to the same value.

### IDEM-08 · Outbox flush and undo across tabs

- **Trigger and current behavior:**
  - Every open tab runs `flushOutbox()` on load and on `online` (`web/legacy/app.js:686, 718`). The `flushing` flag (`app.js:150-152`) works per tab only.
  - `writeOutbox(outbox().filter(...))` is read-modify-write on localStorage.
  - Undo of an outbox item just removes it locally (`app.js:131`), even if a flush already sent it.
- **Duplicate sources:** two tabs flushing the same items; undo during a flush; items queued before `clientId` existed, or on a phone without `randomUUID`.
- **Consequence:**
  - High for sales and expenses without a `clientId`: a double send means a double record.
  - Medium otherwise:
    - `reopen_task` sent twice gets a 404, which lands in `cropcash-outbox-refused`, and the farmer is told it was refused;
    - an undone record reappears after the reload;
    - a racing tab can drop an item that was just queued.
- **Pattern(s):** 10 lock (browser Web Locks), 11 checkpoint per item, 3 natural key.
- **Key:** each item's `clientId` (sales, expenses) or task id (tasks).
- **Storage and retention:**
  - `navigator.locks.request('cropcash-outbox', …)` wraps `flushOutbox`, `queue()` and the outbox branch of undo. Where Web Locks is missing, fall back to today's behavior.
  - `readOutbox` (`web/lib/live/outbox.ts:24-30`) gives a `clientId` to any `record_sale`/`add_expense` item without one, and the caller saves it **before** sending.
  - After each item is sent, save `{ outboxId → serverId }` in `cropcash-outbox-sent` for 24 h, so an undo that arrives after the send can call `undo_transaction` with the server id.
- **In-flight duplicate:** the second tab waits on the lock, then finds the outbox empty.
- **Replay response:** on flush, a 404 for `reopen_task` and a 404 for `undo_transaction` count as success, not refused (see IDEM-11).
- **Tests** (unit, in `web/lib/live/outbox.test.ts` with a fake lock and a fake storage):
  - two flushes started together → each item sent once;
  - an old item without `clientId` → one is added and stays the same across two flush attempts;
  - undo after the send → `undo_transaction` with the server id.

### IDEM-09 · Change pension (`PUT /api/pension`)

- **Current:** creates a new Stripe price on every call (`stripe/money.ts:251-256`) and swaps the subscription item to it. The repeat effect is the same amount, so the money is fine, but each retry leaves an orphan price.
- **Plan:**
  - Reuse one price per amount: `prices.list({ lookup_keys: ['cc-pension-<monthlyBani>'] })`, or create it with that `lookup_key` and the key `cc:pension-price:<monthlyBani>`.
  - Skip the update when the item already has that price.
  - Use the M2 lease `('pension')`, so a change can't race a stop.
  - Replay → 204.
- **Tests:** change twice to the same amount → one price and one `subscriptions.update`.

### IDEM-10 · Stripe webhook, payout status

- **Current:**
  - `markPayout` sets whatever status the event says (`stripe/money.ts:350-354`). On `failed` it deletes the salary transaction.
  - Redelivery is harmless, since the update and delete are by id.
  - But Stripe doesn't promise order. A late `payout.paid` arriving after `payout.failed` marks the row `paid` while its transaction is already gone, so the farmer's money and the payout list disagree.
- **Plan:**
  - Guarded transition in `setPayoutStatus`: `paid` only `where status in ('pending','creating')`; `failed` from `pending`, `creating` or `paid` (a paid payout can still fail later).
  - `syncPayouts` (`money.ts:342-347`) keeps reading the true status from Stripe, so it stays the source of truth.
  - No inbox table is needed: every webhook write is keyed on a Stripe id.
- **Tests:** `payout.failed` then `payout.paid` → stays `failed` with no salary row; each event redelivered → same state.

### IDEM-11 · Treat "already done" answers as success on the client

Several retries of a write that succeeded come back as errors:

| Write | Repeat answer today |
| --- | --- |
| `undo_transaction` | 404 (`routes/records.ts:102-108`) |
| `reopen_task` | 404 (`records.ts:133-141`) |
| `remove_credit` | 404 (`routes/plan.ts:63`) |
| `stop_pension` | 409 `no_pension` |
| `simulate_apia_advance` | 409 `already_received` |

The plan:
- Server: change the two money routes as in IDEM-03 and IDEM-06.
- Client: in `web/lib/live/functions.ts` `write()`, a 404 on a `DELETE` of a known id counts as success. Mark these functions in the registry with `repeatSafe: 'gone'`.
- Surse already does this for sources (`web/legacy/surse.js:238`).

**Test:** each of these writes, sent twice, resolves both times.

### IDEM-12 · Save harvests + update farm (lost update, half-done pair)

- **Current:**
  - `sendHarvests` (`web/legacy/app.js:486-491`) and `savePlanFigures` send `save_harvests` (replaces the whole document) and then `update_farm` (replaces parcels and opening money).
  - Both are naturally idempotent on their own.
  - But a phone with an old `cropcash-me` copy overwrites what another device saved. If the second call fails, the harvests and the farm disagree until the farmer saves again.
- **Plan:**
  - Pattern 4: add `farmers.harvests_version int`. The client sends the version from its copy and the server updates `where harvests_version = $v`, then sets `v + 1`. A mismatch gets 409 `changed_elsewhere`, and the page reloads with „Ferma s-a schimbat pe alt telefon. Am adus cifrele noi.”
  - Later, move both writes into one RPC so the pair is atomic.
- **Tests:** two saves from the same version → one 200 and one 409; a retry of the 200 with the new version → 200, unchanged.

### Later (table only): IDEM-13, IDEM-14, IDEM-15

- **IDEM-13:**
  - Each `read_document` and `assistant` call costs a Claude request and one unit of the daily limit, so a retry after 502 pays twice.
  - Cache the answer in memory for 10 minutes, keyed by `sha256(userId + files)` for documents and by `sha256(userId + messages)` for the assistant. Don't count a cache hit against the limit.
- **IDEM-14:**
  - `POST /api/sources` is already natural-key safe: the `same` check, the `addPage` upsert on `url` and the `attach` upsert.
  - Two concurrent adds both read the page and both count against the daily limit. Low.
- **IDEM-15:** signed-out Recolte records use `n${Date.now()}` ids and have no pending guard (`web/legacy/recolte.js:200-203`); a double submit before the reload adds two. Low, and `docs/13-auth-demo-loading-plan.md` makes sign-in required anyway.

## Safe to retry

No failure-handling plan exists yet. Once this plan is done, these can be retried automatically with the **same** key or body:

| Operation | Safe to retry after | Notes |
| --- | --- | --- |
| OP-5 record sale, OP-6 add expense | IDEM-05 (sales are already safe with the same `clientId`) | retry with the same `clientId` |
| OP-8 complete/reopen task, OP-9 follow/unfollow, OP-11, OP-12, OP-13 | now | sets and upserts; treat 404 on delete as success (IDEM-11) |
| OP-3 update farm, OP-4 save harvests | now (same body); IDEM-12 for the version | replace-style writes |
| OP-2 create farm | now | 409 → update path |
| OP-10 add credit | IDEM-07 | same `groupId` |
| OP-14 Stripe setup | IDEM-04 | no body; lease 409 means wait and retry |
| OP-15/16/17 pension | IDEM-02, IDEM-09, IDEM-06 | same `Idempotency-Key`; never auto-retry from the page, only after the farmer taps again |
| OP-18 APIA advance, OP-19 advance clock | IDEM-03, IDEM-01 | same `from`; demo only |
| OP-23 webhooks | now (+ IDEM-10 for order) | returning 5xx and letting Stripe redeliver is safe |
| OP-20, OP-21 | never automatically | they cost money; IDEM-13 makes a manual retry cheap |

Nothing moving money ever goes in the outbox (already the rule in `docs/07-architecture.md` §8). This plan keeps it that way.

## Assumptions

- The API runs as **one pm2 process**. The M2 lease works across processes anyway, but the in-memory limits (DS-4) would be per process if this changes.
- Caddy `reverse_proxy` does not retry requests (no `lb_try_duration` set), and Netlify serves only static files, so no proxy replays a POST. The plan is safe either way, because every unsafe route gets a key or guard.
- The browser `fetch` in `web/lib/live/client.ts:22` has no timeout and never retries (its comment says so). The duplicates come from the farmer tapping again, other tabs and the outbox.
- Stripe webhooks are at-least-once and unordered, delivered to two destinations (own account and connected accounts).
- Stripe v1 idempotency keys last 24 h. The plan never relies on them alone past that: every Severe operation also has a DB guard.

## Open questions

- Do Stripe **v2** `core.accounts.create` calls accept an idempotency key in the SDK version we use, and is there a way to list v2 accounts by `metadata.farmer_id`? — affects IDEM-04
- `simulationSteps` passes `received` into the timeline (`packages/shared/src/cashflow/simulate.ts:56`). Does that drop every income already recorded, including `crop_sale`, or only the APIA ones? If it drops them all, IDEM-01's resume is safer and the income keys are a second guard rather than the only one. — affects IDEM-01
- Are `apia_advance` rows written by `income()` given a `harvest_year`? The partial unique index in IDEM-03 needs it, or a different natural key (`demo_date`'s campaign). — affects IDEM-03
- Is `DEMO_MODE` on in the deployed API (`cropcash-api.andreitutea.com`)? If yes, IDEM-01 and IDEM-03 are reachable by any signed-in user, not only during the pitch. — affects IDEM-01, IDEM-03
