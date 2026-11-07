# Projection engine

Forecasts show a likely range, in today's money, and update when the user's life changes.
Fixed code computes every number; AI only explains results. Inputs and their sources: `../data/projection-inputs.md`.
API: A11 (run projection), A12 (preview a plan) in `../data/app-api.md`.

**Inputs:** Assets, debts, income, spending, contributions, major events, return, inflation, salary growth, fees, and taxes.

**Calculation:** Start with the opening balance, add contributions and growth, subtract withdrawals and fees, then repeat each year.

**Example:** Saving €200 a month for 30 years means contributing €72,000. Ignoring inflation, taxes, and fees:

| Annual return | Approximate total after 30 years |
| --- | --- |
| 3% | €117,000 |
| 5% | €166,000 |
| 7% | €244,000 |

| Method | Use | Build in |
| --- | --- | --- |
| Scenario projection | Cautious, expected, and optimistic paths using fixed assumptions | Phase 1 |
| Monte Carlo simulation | Thousands of market paths and a chance-of-success estimate | Phase 4 |

Any change to income, spending, goals, or investments should trigger a recalculation. Retirement mode should test how
long the money lasts under each path, using plain-language results rather than false precision.

## Demo assumptions (Phase 1)

- Real returns after inflation and fees: cautious 2%, expected 4%, optimistic 6% a year. Real salary growth 0%.
- Annual compounding; monthly amounts × 12 added each year.
- Ana: age 29, retires at 65 (36 years). Pillar II starts at 21,400 RON; contributions 552.14 RON/month (4.75% of an
  estimated gross 11,624 RON) + 300 RON/month own saving.
- Retirement drawdown: 2,500 RON/month on top of the state pension (Pillar I is not modeled; say so on screen).

Results (fixtures `a11-projection-response.json`):

| Path | Pot at 65 (RON, today's money) | Money lasts until age |
| --- | --- | --- |
| Cautious | 575,300 | 90 |
| Expected | 881,300 | 100+ |
| Optimistic | 1,392,400 | 100+ |

Car loan what-if (A12): 50,000 RON over 60 months at a demo 9.5% → 1,050.09 RON/month, 63,005.58 total
(13,005.58 interest). Pausing the 300 RON own retirement saving for 5 years lowers the expected pot by 7.5%.
