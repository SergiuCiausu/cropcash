# App inventory: CropCash (web/ + the API it calls)

Sources: `CLAUDE.md`, `docs/07-architecture.md` §8, `docs/08-stripe.md`, `docs/web-react-port-plan.md`, `docs/13-auth-demo-loading-plan.md`, code in `web/` (`web/legacy/*.js`, `web/lib/live/*`, `web/lib/cc/*`), `apps/api/src/**`, `packages/shared/src/functions/registry.ts`, `supabase/migrations/*.sql` · Last updated: 2026-11-08 by idempotency-planner

## Summary
CropCash turns a small farm's APIA subsidies and harvest money into a monthly salary and a pension. The farmer uses `web/` (Next.js static export, PWA, works offline). The pages are the ported legacy scripts in `web/legacy/`, which call Supabase auth and the Express API in `apps/api` through `window.Live` (`web/lib/live`). Data is in Supabase Postgres. Money moves through Stripe in test mode only (connected accounts, payouts, subscriptions, test clocks).

## Data stores
| ID | Store | Kind | Holds | Status | Source |
| --- | --- | --- | --- | --- | --- |
| DS-1 | Supabase Postgres | primary DB | farmers, parcels, envelopes, transactions, payouts, pension_plans, expected_payments, task_completions, opportunity_follows, farmer_sources, watched_pages | Built | `supabase/migrations/001…017` |
| DS-2 | Browser localStorage | client cache + outbox | `cropcash-me` (copy of /api/me), `cropcash-outbox`, `cropcash-outbox-refused`, view state, signed-out farm | Built | `web/legacy/app.js:13-82`, `web/lib/cc/storage.ts:18-23` |
| DS-3 | Service worker cache | static files | pages/scripts/fonts; never API calls or non-GET | Built | `web/lib/live/service-worker.mjs:56-63` |
| DS-4 | API process memory | counters | assistant and document daily limits, sources daily limits | Built | `routes/assistant.ts:16`, `routes/documents.ts:30`, `routes/sources.ts:27` |
| DS-5 | Stripe (test mode) | external ledger | v2 accounts, customers, test clocks, PaymentIntents, payouts, prices, subscriptions | Built | `apps/api/src/stripe/money.ts` |

## Entities
| ID | Entity | Key fields / natural key | Lifecycle states | Source |
| --- | --- | --- | --- | --- |
| EN-1 | Farmer (farm) | `user_id` unique | created → updated | `001_init.sql:12` |
| EN-2 | Transaction | `stripe_object_id` unique; `(farmer_id, client_id)` unique where not null | inserted → deleted (undo, failed payout) | `001_init.sql:66`, `017_transaction_client_id.sql:7` |
| EN-3 | Payout (salary) | `stripe_payout_id` unique; `(farmer_id, scheduled_for)` unique | pending → paid / failed | `001_init.sql:75-77` |
| EN-4 | Pension plan | `farmer_id` unique | active ↔ stopped | `001_init.sql:82`, `db/admin.ts:104-114` |
| EN-5 | Expected payment (credit) | `group_id` (server random) | inserted → deleted | `db/repo.ts:139-170` |
| EN-6 | Task completion | PK `(farmer_id, task_id)` | done → removed | `010_records_tasks.sql:30` |
| EN-7 | Opportunity follow | PK `(farmer_id, stable_key)` | followed → removed | `013_opportunities_app.sql:15` |
| EN-8 | Farmer source | `(owner_hash, page_id)` unique | attached → removed | `015_farmer_sources.sql:31` |
| EN-9 | Outbox item | `outbox:<ms>-<rand>` in localStorage | queued → sent / refused | `web/legacy/app.js:120-122` |
| EN-10 | Stripe setup on farm | `stripe_account_id`, `test_clock_id`, `stripe_customer_id` columns | none → set | `stripe/money.ts:63-116` |

## Operations (anything that changes state or causes a side effect)
| ID | Operation | Trigger | Writes / side effects | Dependencies | Status | Source |
| --- | --- | --- | --- | --- | --- | --- |
| OP-1 | Sign up / sign in / sign out | user, `/login` | Supabase auth user, confirmation email, clears localStorage | DEP-1 | Built | `web/legacy/login.js:47-64`, `web/lib/live/auth.ts` |
| OP-2 | Onboarding: create farm | user, last step | `POST /api/farmers` → `create_farm` RPC; on 409 falls back to OP-3; then OP-4, optional OP-11 | DEP-1 | Built | `web/legacy/onboarding.js:72-77`, `routes/farmers.ts:38` |
| OP-3 | Update farm (`update_farm`) | Recolte, Datele planului, onboarding | `PUT /api/farmers/me` → `update_farm` RPC replaces details + parcels | DEP-1 | Built | `routes/farmers.ts:75` |
| OP-4 | Save harvests (`save_harvests`) | Recolte, Datele planului | `PUT /api/farmers/me/harvests` replaces JSON document | DEP-1 | Built | `web/legacy/app.js:486-491`, `routes/farmers.ts:109` |
| OP-5 | Record sale (`record_sale`) | Recolte form, assistant card, outbox | `POST /api/sales` insert transaction (dedupe on `clientId`) | DEP-1 | Built | `web/legacy/recolte.js:188-199`, `routes/records.ts:32`, `db/repo.ts:172` |
| OP-6 | Add expense (`add_expense`) | Recolte form, assistant card, outbox | `POST /api/expenses` → `record_expense` RPC, takes from an envelope | DEP-1 | Built | `routes/records.ts:59`, `017_transaction_client_id.sql` |
| OP-7 | Undo transaction | Recolte "Șterge" | `DELETE /api/transactions/:id`, restores envelope; or removes an outbox item locally | DEP-1 | Built | `web/legacy/app.js:131`, `routes/records.ts:102` |
| OP-8 | Complete / reopen task | Calendar, assistant, outbox | `PUT/DELETE /api/tasks/:id` | DEP-1 | Built | `web/legacy/calendar.js:29-35`, `routes/records.ts:117,133` |
| OP-9 | Follow / unfollow opportunity | Oportunități, Calendar | `POST /api/opportunities/(un)follow` upsert/delete | DEP-1 | Built | `web/legacy/app.js:425-433`, `routes/opportunities.ts` |
| OP-10 | Add / remove credit | assistant card only | `POST /api/credits` (2 rows, random `group_id`), `DELETE /api/credits/:groupId`, then fixes salary | DEP-1 | Built | `routes/plan.ts:27-64` |
| OP-11 | Save / clear APIA decision | Subvenții, onboarding | `PUT/DELETE /api/farmers/me/apia-decision` | DEP-1 | Built | `web/legacy/subventii.js:41-69` |
| OP-12 | Accept envelope split | Bani "accept" | `PUT /api/envelopes` → `set_envelopes`, fixes salary | DEP-1 | Built | `web/legacy/bani.js:162`, `routes/plan.ts:66` |
| OP-13 | Set pension fund | Pensie select | `PUT /api/pension/fund` | DEP-1 | Built | `web/legacy/pensie.js:236-238` |
| OP-14 | Stripe setup | Bani "setup" | creates v2 account, updates it, adds bank account, sets payout schedule, test clock, customer, attaches card; writes ids | DEP-1, DEP-2 | Built | `web/legacy/bani.js:163`, `routes/money.ts:42`, `stripe/money.ts:63-116` |
| OP-15 | Start pension | Pensie "start" | Stripe price + subscription (charges monthly), `pension_plans` upsert, invoice sync, salary fix | DEP-1, DEP-2 | Built | `web/legacy/pensie.js:250-252`, `routes/money.ts:64`, `stripe/money.ts:222-242` |
| OP-16 | Change pension | Pensie "change" | new Stripe price, subscription item update, DB update, salary fix | DEP-1, DEP-2 | Built | `routes/money.ts:76`, `stripe/money.ts:248-262` |
| OP-17 | Stop pension | Pensie "stop" | Stripe subscription cancel, DB status, salary fix | DEP-1, DEP-2 | Built | `routes/money.ts:87`, `stripe/money.ts:265-268` |
| OP-18 | Simulate APIA advance (demo) | Bani "income" | PaymentIntent with transfer to farmer, transaction row, waits up to 30 s | DEP-1, DEP-2 | Built (DEMO_MODE) | `web/legacy/bani.js:164-168`, `routes/money.ts:100`, `stripe/money.ts:119-148` |
| OP-19 | Advance clock (demo) | Bani "forward" | per step: incomes (PaymentIntents), expenses, repayments, salary payouts; test clock advance; `demo_now`; invoice + payout sync | DEP-1, DEP-2 | Built (DEMO_MODE) | `web/legacy/bani.js:150-155`, `routes/money.ts:118`, `stripe/money.ts:295-336` |
| OP-20 | Read a paper | Papers upload | `POST /api/documents/read` → Claude call (costs money), daily counter | DEP-3 | Built | `web/legacy/papers.js:163-165`, `routes/documents.ts:32` |
| OP-21 | Ask the assistant | assistant sheet | `POST /api/assistant` → Claude call, daily counter; returns proposed writes (OP-5, 6, 8, 9, 10) | DEP-3 | Built | `web/legacy/assistant.js:166-193`, `routes/assistant.ts:33` |
| OP-22 | Add / remove own source | Surse | `POST /api/sources` (fetches the page, upserts), `DELETE /api/sources/:id` | DEP-4 | Built | `web/legacy/surse.js:206-243`, `routes/sources.ts` |
| OP-23 | Stripe webhook | Stripe | `payment_intent.succeeded` → transaction upsert; `invoice.paid` → invoice sync; `payout.paid/failed` → status, removes salary row on failure | DEP-2 | Built | `routes/money.ts:23-33`, `stripe/money.ts:367-405` |
| OP-24 | Outbox flush | `online` event, page load | replays OP-5/6/8 in order, moves 4xx to `refused`, reloads | DEP-1 | Built | `web/legacy/app.js:150-175, 682-718` |
| OP-25 | Signed-out local writes | any page without an account | localStorage only (farm, harvests, records, done tasks, follows) | — | Built | `web/legacy/app.js:22-28`, `recolte.js:200-203` |

## Reads that matter
| ID | Read | Used by | Dependencies | Can be stale? | Source |
| --- | --- | --- | --- | --- | --- |
| RD-1 | `GET /api/me` → `cropcash-me` copy | every page, after every write | DEP-1 | Yes, by design (offline) | `web/legacy/app.js:57-73, 145-146` |
| RD-2 | `POST /api/functions/:name` (reads) | pages, assistant | DEP-1 | No | `web/lib/live/functions.ts:15-21` |

## Async work
| ID | Job / consumer / cron | Trigger / schedule | Does | Delivery semantics (if known) | Source |
| --- | --- | --- | --- | --- | --- |
| AS-1 | Stripe webhook (OP-23) | Stripe events, two destinations (own + connected accounts) | see OP-23 | at-least-once, may be out of order | `docs/08-stripe.md` §3 |
| AS-2 | Outbox flush (OP-24) | browser `online`, page load, every open tab | replays queued writes | at-least-once, once per tab | `web/legacy/app.js:150` |

## External dependencies
| ID | Dependency | Used for | Called from | Criticality guess | Source |
| --- | --- | --- | --- | --- | --- |
| DEP-1 | Supabase (Postgres + Auth) | data, login | API, `web/lib/live/auth.ts` | Core | `CLAUDE.md` |
| DEP-2 | Stripe (test mode) | accounts, transfers, payouts, subscriptions, test clocks | OP-14…19, OP-23 | Core for salary/pension | `docs/08-stripe.md` |
| DEP-3 | Claude API | paper reading, assistant | OP-20, OP-21 | Optional | `apps/api/src/ai/*` |
| DEP-4 | Official websites | own sources | OP-22 | Optional | `routes/sources.ts` |

## Key user flows
| ID | Flow | Steps (operation IDs) | Source |
| --- | --- | --- | --- |
| FL-1 | Sign up to first salary plan | OP-1 → OP-2 → OP-4 → (OP-11) | `docs/06-features-mvp.md` |
| FL-2 | Note a sale or expense, online or offline | OP-5 / OP-6 → (OP-24) | `docs/07-architecture.md` §8 |
| FL-3 | Demo money flow | OP-14 → OP-12 → OP-18 → OP-19 → OP-23 | `docs/09-demo-pitch.md` §3 |
| FL-4 | Pension | OP-13 → OP-15 → OP-16 / OP-17 | `docs/05-taxes-pension.md` |

## Open questions
- Does pm2 run the API as one process (fork mode) or several? In-memory limits and any in-process lock depend on it. — needed by idempotency-planner, blocks IDEM-01…04
- Does `simulationSteps` skip incomes already recorded, or only steps after `demo_now`? — needed by idempotency-planner, blocks IDEM-01

## Changelog
- 2026-11-08 Created by idempotency-planner from the files listed above.
- 2026-11-08 Read by abstraction-planner (no changes to entries); see `docs/abstraction-plan.md`.
