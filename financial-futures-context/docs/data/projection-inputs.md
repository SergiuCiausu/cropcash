# Projection inputs

The forecast needs 19 inputs: 11 come from bank data or the app's own analysis, 8 are Ana's answers or default
assumptions. Transaction-based inputs need at least 3 months of history; if a bank returns less (`max_fetch_interval`
in B1), statement upload (A1) fills the gap.

| Input | Where it comes from | Operation | Ana's value |
| --- | --- | --- | --- |
| Cash balances | Bank accounts | B6 | 7,430.55 RON and 210 EUR |
| Exchange rate | Currency rates | B12 | 4.97 RON per EUR |
| Debts | Credit card from the bank; other loans entered by hand | B6, A7 | 620.40 RON on the card |
| Pension savings | Pillar II statement, entered by hand | A7 | 21,400 RON |
| Pension contributions | Estimated from gross salary (4.75%) | A2, A7 | 552.14 RON a month |
| Investments | Simulated now; licensed broker in Phase 4 | A14 | None yet |
| Net income and payday | Detected salary, confirmed by Ana | A2 | 6,800 RON on the 10th |
| Essential spending | Categorized transactions | B7, A5 | 4,255 RON a month |
| Other spending | Categorized transactions | B7, A5 | About 1,420 RON a month |
| Recurring bills and subscriptions | Recurring payment detection | A3 | 198.98 RON a month forgotten |
| One-off events | Unusual transactions | A5 | Car repair, 1,450 RON |
| Goal contributions | Goals | A8, A9, A10 | 475 RON a month for Greece |
| Major decisions | Synced plan cards only | A12, A13 | Car loan previewed, not synced |
| Age and retirement age | Ana's answers | Sign-up | 29, retiring at 65 |
| Retirement spending target | Ana's answer, in today's money | Retirement sliders | 2,500 RON a month |
| Investment return | Default assumption, after inflation and fees | A11 | 2%, 4% or 6% a year |
| Inflation | Handled by showing everything in today's money | A11 | Built into real returns |
| Salary growth | Default assumption, after inflation | A11 | 0% a year |
| Taxes | Net salary already after income tax; investment tax not modeled in Phase 1 | A2 | Not modeled yet |

Two gaps to state on screen: the state pension (Pillar I) is not modeled, so the 2,500 RON target is extra income on top
of it, and investment tax is ignored until Phase 4.
