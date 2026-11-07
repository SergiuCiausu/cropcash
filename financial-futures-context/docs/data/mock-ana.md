# Ana's mock account

Ana earns 6,800 RON a month, loses 198.98 RON (about €40) to three forgotten subscriptions, and has 1,125.05 RON left
over that currently drifts. That €40 becomes her Greece trip, then the start of her retirement savings.
The mock uses 4.97 RON per euro. All names, IDs and IBANs are fictional (bank code `DEMO`). As of 2026-11-07.
JSON: `fixtures/ana/`.

## Profile

| Field | Value | Source |
| --- | --- | --- |
| Name | Ana Popescu, 29 | App sign-up |
| City | Bucharest | App sign-up |
| Job | Marketing specialist at Nova Retail SRL (fictional) | App sign-up |
| Net salary | 6,800 RON, paid on the 10th | Detected from bank data (A2) |
| Gross salary | About 11,624 RON (net ÷ 0.585, estimated) | Calculated, used for pension contributions |
| Household | 1 person | App sign-up |
| Retirement age | 65 | Ana's choice |

## Accounts at Demo Bank Romania (simulated)

| Account | ID | `nature` | Currency | Balance | IBAN |
| --- | --- | --- | --- | --- | --- |
| Cont curent | 400000000000000001 | `account` | RON | 4,280.55 (+1 pending −64.20) | RO49DEMO0000000000000001 |
| Cont economii | 400000000000000002 | `savings` | RON | 3,150.00 | RO27DEMO0000000000000002 |
| Cont EUR | 400000000000000003 | `account` | EUR | 210.00 | RO86DEMO0000000000000003 |
| Card de credit | 400000000000000004 | `credit_card` | RON | −620.40 (limit 5,000) | none |
| Pillar II pension | manual_01 | manual entry (A7) | RON | 21,400.00 | not from the bank |

Net worth: **29,253.85 RON** (EUR at 4.97, card balance subtracted). Customer `100000000000000001`, connection
`200000000000000001`, consent `300000000000000001`.

## A typical month (current account)

| Item | RON per month | Where it shows up |
| --- | --- | --- |
| Salary | +6,800.00 | NOVA RETAIL SRL on the 10th |
| Rent | −2,300.00 | Transfer to landlord on the 3rd |
| Utilities | −420.00 | Electricity about 180 (14th), gas about 160 (18th), internet and TV 80 (8th) |
| Groceries | −1,350.00 | Lidl, Kaufland, Mega Image (8 trips) |
| Eating out | −520.00 | Restaurants, coffee, delivery (7 items) |
| Shopping and other | −600.00 | eMAG, Decathlon, H&M |
| Public transport pass | −140.00 | On the 1st |
| Mobile plan | −45.00 | On the 25th |
| Subscriptions she uses | −100.97 | Netflix 59.99, Spotify 25.99, iCloud 14.99 |
| Forgotten subscriptions | −198.98 | FitZone 129.00, StreamPlus 39.99, PhotoEdit Pro 29.99 |
| **Left over** | **+1,125.05** | Not saved on purpose yet |

Essential costs (rent, utilities, groceries, transport, mobile) = **4,255 RON** a month.

## Transaction history in the fixtures

`transactions-current-ron.json` holds 96 posted transactions from 2026-08-07 to 2026-11-06 (opening balance
2,376.51 RON), plus `transactions-pending.json` (Mega Image −64.20 on 2026-11-07).

| Month | In | Out | Notes |
| --- | --- | --- | --- |
| Aug (from 7th) | 6,800.00 | 2,628.41 | Partial month |
| Sep | 6,889.99 | 5,635.05 | eMAG refund +89.99 on the 14th; lower utilities |
| Oct | 6,800.00 | 7,124.95 | Typical month + car repair 1,450.00 on the 18th |
| Nov (1st–6th) | 0.00 | 3,197.54 | Includes 200.00 transfer to savings on the 4th |

Credit card: eMAG −420.40 (Nov 2) and Decathlon −200.00 (Nov 5). Savings: +200.00 transfer in (Nov 4).

## Recurring payments the app should detect

| Merchant | Amount (RON) | Day | Last used | Verdict |
| --- | --- | --- | --- | --- |
| FitZone gym | 129.00 | 1st | June 2026 | Forgotten, suggest cancel |
| StreamPlus | 39.99 | 15th | Never opened | Forgotten, suggest cancel |
| PhotoEdit Pro | 29.99 | 22nd | March 2026 | Forgotten, suggest cancel |
| Netflix | 59.99 | 5th | This week | Keep |
| Spotify | 25.99 | 12th | Daily | Keep |
| iCloud | 14.99 | 20th | Daily | Keep |
| Rent | 2,300.00 | 3rd | — | Essential bill |
| Electricity | about 180, varies | 14th | — | Variable bill |
| Gas | about 160, varies | 18th | — | Variable bill |
| Internet and TV | 80.00 | 8th | — | Fixed bill |

"Last used" comes from Ana's answers in the weekly review; the bank can't see usage.

## Goals

| Goal | Target | Saved now | Deadline | Monthly needed |
| --- | --- | --- | --- | --- |
| Greece trip | 5,000 RON | 1,200 RON | 2027-07-01 | 475 RON (198.98 found savings + 276.02 leftover), 8 contributions on the 11th → done 2027-06-11 |
| Emergency fund | 12,800 RON (3 × 4,255) | 3,150 RON | none | Starts after Greece |
| Retirement | 2,500 RON/month on top of the state pension, today's money | 21,400 RON Pillar II | Age 65 | 300 RON own + about 552 RON Pillar II |

## Story events

- **Setback:** car repair 1,450 RON at Service Auto Popa SRL (fictional) on 2026-10-18 → Ana pauses November's Greece
  contribution (A10): keep 475/month and finish 2027-07-11, or raise to 542.86 and keep 2027-06-11.
- **What-if:** Ana asks about a 50,000 RON car loan over 5 years (demo rate 9.5%) → 1,050.09 RON/month; leftover after
  cancelling the forgotten subscriptions drops to 273.94; Greece is short by 201.06 a month; expected retirement pot −7.5%.
  She does not sync it.
