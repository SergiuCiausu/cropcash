# Scope: Phase 1 (challenge demo)

Build one complete story with test data, including quest-based plans and a visible forecast.
Nothing here moves real money. Later phases are in `reference/roadmap-and-providers.md`.

## Build in this order

1. Create a sample profile for Ana with income, spending, subscriptions, and goals (`data/mock-ana.md`, `fixtures/ana/`).
2. Add a **Connect my bank** button that links a simulated Demo Bank Romania using Salt Edge's API format (`data/bank-api.md`).
3. Show income, spending categories, and detected subscriptions.
4. Add receipt scanning and a basket of about 20 common products across three supermarkets.
5. Create goal deposits with templates, automatic contributions, a pause button, and scenario views.
6. Add a one-tap save that moves found savings into a goal.
7. Build a retirement forecast with sliders, a scenario switcher, and automatic refresh (`features/projection-engine.md`, `features/live-projection-panel.md`).
8. Add a simulated investing rule and portfolio, clearly labeled as simulated.
9. Add the Travel starting plan, a subscription cleanup challenge, and a side-by-side retirement comparison (`features/quests-and-progress.md`).
10. Add a simulated Bringo-style checkout and catalog update.
11. Add demo search results with Balanced default, the three filters, location on/off, preferred transport, store address, route times, Directions, and a static map image (`features/search-and-recommendations.md`).
12. Add a Premium plan that Ana buys through Stripe Checkout in test mode, with Stripe Billing handling renewals (`features/stripe-premium.md`).

**Done when:** a judge can follow Ana's full journey in a few taps without a live scraper, bank, broker, or store integration.

## Phase 1 input and automation ideas (20)

| Idea | What gets easier or automated |
| --- | --- |
| Bank connection | Fills balances, transactions, and recurring bills |
| Salary detection | Confirms income and payday |
| One-sentence setup | Creates a goal from plain language |
| Automatic categories | Sorts transactions and learns from corrections |
| Subscription detection | Lists repeat payments with Keep and Cancel |
| Receipt scan | Adds store, items, prices, and categories |
| Barcode scan | Finds alternatives for a product |
| Goal amount slider | Updates deadline and contribution |
| One-tap save | Sends found savings to a goal |
| Transfer detection | Excludes moves between own accounts |
| Goal templates | Prefills goal setup |
| Pause button | Pauses saving and updates the goal date |
| Retirement sliders | Updates the forecast instantly |
| Ask the app | Answers from the user's data |
| Sample data preview | Lets users explore before connecting |
| Goal date picker | Shows the required monthly amount |
| Retirement lifestyle picker | Sets a draft income target |
| Automatic forecast refresh | Recalculates after key changes |
| Scenario switcher | Changes forecast assumptions with one tap |
| Assumption defaults | Prefills inflation, returns, and fees |

## Explicitly out of scope for Phase 1

- Real bank connections, real transfers, real goal accounts, real investing, real orders.
- Detailed fuel cost (WLTP, fuel receipts, odometer, OBD, trip tracking) — deferred; see `features/search-and-recommendations.md`.
- Monte Carlo chance-of-success view (Phase 4).
- Stripe Financial Connections, Treasury, Issuing.
