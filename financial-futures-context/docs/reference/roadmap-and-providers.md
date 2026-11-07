# Roadmap and providers

Build order: proof of value first, then regulated features only when the previous stage works. Shopping comes last as a
live ordering feature, but simple savings suggestions start much earlier.

| Phase | What | Gate to the next phase |
| --- | --- | --- |
| 1 Challenge demo | Simulated bank, Ana's story, goals, quests, forecast, Stripe Premium | Judges can follow the full journey |
| 2 Read-only launch | Live bank data, insights, receipts, savings suggestions, forecasts | Users act on a saving; legal setup confirmed |
| 3 Goals and money movement | Licensed partner accounts, approved transfers, contribution safeguards | Goals funded safely; broker support confirmed |
| 4 Investing, retirement, family | Rule-based investing, Monte Carlo, net worth, household sharing | Enough user demand to secure a partner |
| 5 Shopping and orders | Basket handoff first, then in-app ordering through retailer partners | — |

**Decision to make first:** Will the live app stay read-only at launch, or prioritize real money movement sooner?
The plan recommends read-only first because it needs fewer licenses and partners.

## Phase 2: First live version

Launch read-only: insights and savings suggestions prove value without holding money or placing orders.
Build: live bank connections through Salt Edge's Partner program (Finqware or Enable Banking as alternatives); secure
accounts, consent screens, connection management; income, category, transfer and subscription detection; budgets, bill
calendar, alerts, weekly reviews; statement upload, receipt scanning, manual entry, email imports; basic goals tracked as
plans without moving money; savings suggestions for one category (groceries or phone plans); scenario forecasts on real
data; Premium through Stripe Payments and Billing; shared search recommendations.
**Done when:** users can connect real accounts, understand their money, act on at least one saving, and see their forecast update.

## Phase 3: Goals and money movement

Real goal deposits only through a licensed bank or e-money partner, so the app doesn't hold user funds itself.
Build: a partner account in the user's name with goals as labels; user-approved transfers through a licensed payment
initiation provider; recurring contribution reminders or a partner-supported automatic flow; low-balance protection,
missed-contribution recovery, undo where possible; clear history for every transfer and rule.
**Constraint:** PSD2 requires strong authentication for each single payment; don't assume the app can pull money silently.
**Done when:** legal review confirms the setup, users can fund a goal safely, and support can handle failed or disputed payments.

## Phase 4: Investing, retirement, and family

Brokerage onboarding, custody and trading through a provider such as Upvest, lemon.markets, or DriveWealth; a risk and
suitability questionnaire separate from the starting plans; rule-based investing with amount, timing, monthly cap, pause
and approvals; live portfolio values, fees, performance, diversification; pension and broker statement imports;
retirement simulations; Monte Carlo chance-of-success; family accounts with permission-based sharing.
**Done when:** users can follow their chosen rules, see risks and fees clearly, and understand their retirement range in plain language.

## Phase 5: Shopping and orders

Rollout: build the basket in the app and send the user to the store to finish → affiliate links and shopping feeds,
clearly labeled → pitch a partner API with real user numbers → in-app ordering through a partner with substitutions,
delivery fees and clear totals → partner order updates, recorded savings, offer to move them into a goal.
Bringo: no public customer-order API found (easySales integration is for sellers); ask Bringo or Carrefour Romania about
partner access. The agreement must define who handles payment, refunds, missing items, and customer support.

## Providers

| Need | Demo | Live option | Status or limit |
| --- | --- | --- | --- |
| Read bank data | Simulated bank in Salt Edge's format, or Salt Edge's fake banks | Salt Edge, Finqware, or Enable Banking | Salt Edge lists Banca Transilvania; confirm BCR, Raiffeisen, UniCredit Romania. GoCardless Bank Account Data closed to new accounts since July 2025 |
| Pull money for goals | Simulated | Licensed payment initiation provider, such as Salt Edge or Token.io | SCA per payment |
| Hold goal money | Simulated ledger | Licensed bank or e-money partner | Stripe Treasury not available for Romania |
| Spending cards | Not in demo | Card-issuing partner later | Stripe Issuing prohibits consumer spending |
| Buy stocks | Simulated portfolio | Upvest, lemon.markets, DriveWealth | Confirm Romanian coverage |
| Charge for the app | Stripe Checkout and Billing, test mode | Stripe Payments and Billing | Subject to Stripe's business review |

What Salt Edge covers directly: balances, transactions, categories, merchant identification (Romania supported),
transfer flags, duplicate flags, currency rates, consent callbacks. What the app builds on top: salary detection,
recurring payments, bill calendar, duplicate charges, refund matching, budgets, safe-to-save. Not from bank data at all:
receipts, product prices, cash spending, investments, Pillar II/III pensions, most loans.

Costs: no public price lists for Salt Edge, Finqware or Enable Banking. Ask each for pricing at 100, 1,000, and 10,000
connected users, including setup fees, minimums, payment charges, coverage, and licensing.

## Later ideas (85)

| Phase | Ideas |
| --- | --- |
| 2 | Preference picker, Quick confirmation, Email receipts, Screenshot import, Paste a link, Voice shopping list, Duplicate payment check, Refund matching, Shared expense detection, Bill calendar, Cash withdrawal prompt, Foreign spending detection, Photo goal, Goal cost estimate, Calendar import, Emergency fund suggestion, Bonus prompt, Price alert, Bill photo, Warranty capture, Voice note, Weekly review, Import from a spreadsheet, Bank statement upload, Life stage picker, Household size, Language detection, Currency detection, Progressive questions, Merchant name cleanup, Merchant rules, Split transaction, Budget from history, Payday budget reset, Variable bill forecast, Subscription price alert, Free trial reminder, Spending limit by voice, Receipt folder, Forwarded email address, Goal priority drag, Birthday and holiday planner, Trip budget builder, Store selection map, Allergy profile, Package size comparison, Promotion matching, Loyalty card scan, Share to app, Income change update, Explain this, Undo button, Accessibility shortcuts |
| 3 | Smart monthly amount, Rule templates, Home screen widget, Lock screen note, Safe-to-save amount, Windfall split, Goal completion prompt, Missed contribution recovery, Low-balance protection |
| 4 | Quick risk quiz, Existing pension import, Broker statement import, Tax document import, Payday investing rule, Investment amount cap, Annual check-in, Trusted helper access, Live portfolio values, Chance-of-success view |
| 5 | Reorder prediction, Browser extension, Shared household list, Pantry photo, Meal planner, Recipe link import, Location-based reminder, Saved addresses, Favorite products, Substitution preferences, Basket budget, Household staple tracker, Reorder last basket |

## Open questions

- Find the full challenge brief, deadline, judging criteria, and any required Stripe products.
- Ask Salt Edge, Finqware, and Enable Banking for pricing, RON support, coverage, months of history, and licensing.
- Confirm Salt Bank coverage and each target bank's personal and business support.
- Ask whether goals and monthly contributions can work with RON accounts through a licensed partner.
- Confirm which brokerage partners support Romanian users.
- Ask the Competition Council whether Monitorul Prețurilor data can be reused.
- Ask Bringo or Carrefour Romania about partner API access.
- Check the status of PSD3 and the Payment Services Regulation.
- Review Google's pricing and terms for route data, Maps Static images, caching, and attribution.
- Test the 3 km near limit and 40/35/25 Balanced weights with real user choices.
- Confirm reliable fare sources for each launch city before showing transit prices.
