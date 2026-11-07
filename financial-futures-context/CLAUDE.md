# Financial Futures app

A money copilot for Romania that helps people spend less, earn more, and see where they're heading.
Promise: **Know your money, keep more of it, and grow your future.**

We are building the **Stripe challenge demo** (Phase 1): one complete story for a user called Ana, using a
simulated bank and Stripe in test mode. Nothing in Phase 1 moves real money.

## Rules that apply everywhere

- **No real money, no real banks in Phase 1.** Bank data comes from a mock server that speaks Salt Edge's v6 API format.
  Goal deposits, transfers and investing are simulated and labeled "simulated" in the UI.
- **One bank-data interface.** All bank calls go through a `BankDataProvider` with three implementations chosen by
  `BANK_DATA_SOURCE`: `mock` (default, works offline), `saltedge_sandbox` (Salt Edge fake banks), `saltedge` (later).
  Never call a bank API from UI code.
- **Fixed code calculates, AI explains.** AI may read the user's words (topic, amounts, goal details) and explain results.
  Rankings, forecasts, budgets, balances and every number shown come from deterministic code.
- **Stripe only does billing.** Premium plan via Stripe Checkout + Billing in test mode, priced in RON. Not used for bank
  data, holding money, or cards (those products don't serve Romanian consumers).
- **Money format.** Store amounts as decimal strings or integer bani, never floats in calculations. Currency is RON unless the
  account says EUR. Show amounts in Romanian format in the UI (e.g. `4.280,55 lei`) — see `docs/design.md`.
- **Secrets stay on the server.** Stripe secret key and Salt Edge App-id/Secret never reach the client.
- **Show ranges, not promises.** Forecasts show cautious / expected / optimistic paths in today's money.
- **Setbacks are not failures.** Pausing a goal is "using the plan". No leaderboards, no ranking people's money.
- **No game graphics.** Quests and progress are shown as plain lists, checkmarks and progress bars.
- **Demo banner.** While `BANK_DATA_SOURCE=mock`, show "Demo data, no real bank connected."

## Stack

Not decided yet. Record the choices here once made (framework, language, styling, state, charts, test runner, how to run).

## Where to read before working on something

| Working on | Read |
| --- | --- |
| What the product is, Ana's story, the demo script | `docs/product.md` |
| What's in scope now vs later | `docs/scope-phase1.md` |
| Which screens exist and how they connect | `docs/screens.md` |
| Look, tone, language, number formats | `docs/design.md` |
| Bank connection, accounts, transactions (Salt Edge format) | `docs/data/bank-api.md` |
| Your own backend endpoints (insights, goals, projection, plans) | `docs/data/app-api.md` |
| Ana's mock data (profile, accounts, month, goals) | `docs/data/mock-ana.md` + `fixtures/ana/` |
| Forecast inputs and where each comes from | `docs/data/projection-inputs.md` |
| Forecast maths and scenarios | `docs/features/projection-engine.md` |
| Live projection panel, plan cards, Sync, states | `docs/features/live-projection-panel.md` |
| Quests, starting plans, progress points | `docs/features/quests-and-progress.md` |
| Search ranking, filters, store results, maps | `docs/features/search-and-recommendations.md` |
| Price sources, catalogs, product matching | `docs/features/price-and-product-data.md` |
| Statement upload (PDF/CSV) | `docs/features/statement-upload.md` |
| Estimated balance and sync edge cases | `docs/features/balance-sync.md` |
| Stripe Premium flow | `docs/features/stripe-premium.md` |
| Chat topic detection list | `docs/reference/chat-topics.md` |
| Legal and trust rules | `docs/reference/legal-and-trust.md` |
| Phases 2–5, providers, open questions | `docs/reference/roadmap-and-providers.md` |

## Fixtures

`fixtures/ana/` holds the JSON the mock server returns. They are the source of truth for demo numbers:
`b*` files are Salt Edge-format responses (B1–B13), `a*` files are app API responses (A1–A14), and `transactions-*.json`
hold three months of Ana's transactions (2026-08-07 to 2026-11-07) whose totals reconcile with the account balances.
If a doc example and a fixture disagree, the fixture wins.

## Demo script (what a judge sees)

Ana connects her bank → the app finds three forgotten subscriptions (198.98 RON ≈ €40/month) → she cancels them and
one-tap saves toward Greece → she picks the Travel starting plan → a car repair forces a pause, handled calmly →
she asks about a car loan in chat, sees its impact on a plan card, and doesn't sync it → she compares retirement paths →
she upgrades to Premium with Stripe Checkout.
