# App API (your backend, `/api/app`)

These endpoints run on top of stored bank data. Fixed code does every calculation; AI only turns the user's words into
structured requests and explains results. Responses are in `fixtures/ana/a*.json`. Each example uses Ana's data as of
2026-11-07 and stands on its own.

| # | Operation | Call | Fixture | Feeds |
| --- | --- | --- | --- | --- |
| A1 | Upload statement | `POST /api/app/statements` (multipart: `file`, `account_id`) | `a01-statement-upload.json` | Statement upload, older history |
| A2 | Detect salary | `GET /api/app/insights/income?months=3` | `a02-income.json` | Salary detection, payday |
| A3 | Detect recurring payments | `GET /api/app/insights/recurring` | `a03-recurring.json` | Subscriptions, bill calendar |
| A4 | Correct a category | `PATCH /api/app/transactions/{id}` | `a04-category-correction.json` | Quick confirmation, merchant rules |
| A5 | Monthly cash flow | `GET /api/app/insights/cashflow?month=2026-10` | `a05-cashflow-2026-10.json` | Where my money went |
| A6 | Estimated balance | `GET /api/app/balances` | `a06-balances.json` | Home, low-balance protection |
| A7 | Add a manual item | `POST /api/app/manual-items` | `a07-manual-item-pension.json` | Pension, cash, loans the bank can't see |
| A8 | Create goal / list goals | `POST /api/app/goals`, `GET /api/app/goals` | `a08-goals.json` | Goals |
| A9 | Save to goal (simulated) | `POST /api/app/goals/{id}/contributions` | `a09-contribution.json` | One-tap save |
| A10 | Pause a goal | `POST /api/app/goals/{id}/pause` | `a10-pause.json` | Pause button, setback |
| A11 | Run projection | `POST /api/app/projection` | `a11-projection-request.json`, `a11-projection-response.json` | Live projection panel |
| A12 | Preview a plan | `POST /api/app/plans/preview` | `a12-plan-preview-carloan.json` | Plan card in chat |
| A13 | Sync or undo a plan | `POST /api/app/plans/{id}/sync`, `DELETE /api/app/plans/{id}/sync` | `a13-plan-sync.json` | Sync to projection, Undo |
| A14 | Simulated investing rule | `POST /api/app/investing/rules` | `a14-investing-rule.json` | Simulated portfolio |

## Request bodies

**A4 Correct a category**
```json
{ "category": "health_and_fitness", "apply_to_similar": true, "rule": { "match": "payee_information", "value": "FitZone" } }
```

**A7 Add a manual item**
```json
{ "type": "pension_pillar_2", "name": "Pilon II", "balance": 21400.00, "currency": "RON", "as_of": "2026-09-30", "monthly_contribution": 552.14, "source": "statement" }
```

**A8 Create goal** (AI turns "Save 5,000 lei for Greece by next July" into this; code computes the monthly amount)
```json
{
  "name": "Greece trip", "template": "travel", "target_amount": 5000.00, "currency": "RON",
  "starting_amount": 1200.00, "deadline": "2027-07-01",
  "funding": { "day_of_month": 11, "sources": [ { "type": "found_savings", "amount": 198.98 }, { "type": "leftover", "amount": 276.02 } ] }
}
```

**A9 Save to goal** (send an idempotency key so a double tap saves once; Phase 1 records it as simulated)
```json
{ "amount": 198.98, "source": "found_savings", "note": "Canceled FitZone, StreamPlus and PhotoEdit Pro", "idempotency_key": "ana-2026-11-07-found-01" }
```

**A10 Pause a goal**
```json
{ "skip_month": "2026-11", "reason": "Car repair" }
```

**A11 Run projection:** see `fixtures/ana/a11-projection-request.json`. Results are in today's money; returns are after
inflation and fees. Inputs and sources: `projection-inputs.md`.

**A12 Preview a plan** (the 9.5% rate is a demo assumption)
```json
{ "type": "loan", "amount": 50000.00, "term_months": 60, "annual_rate": 0.095, "start": "2026-12-01", "funding_changes": [ { "pause": "own_retirement_saving", "months": 60 } ] }
```

**A14 Simulated investing rule**
```json
{ "name": "Payday rule", "amount": 100.00, "timing": "payday", "monthly_cap": 300.00, "portfolio": "simulated_global_index" }
```

## Logic notes

- **A2 salary:** repeated credits from the same payer on a similar day; confirm with "Mark as salary".
- **A3 recurring:** group by merchant + amount (±10% for variable bills) + interval; "last used" comes from the user.
- **A5 cash flow:** sum posted, non-transfer transactions by category for the month; list one-off items (largest unusual
  amounts). October: income 6,800.00, spending 7,124.95, net −324.95.
- **A6 estimated balance:** bank balance + pending total (4,280.55 − 64.20 = 4,216.35), with last updated time and bills
  due before the next payday.
- **A8/A10 goal maths:** required monthly = (target − saved) ÷ remaining contributions: (5,000 − 1,200) ÷ 8 = 475.00.
  Skipping one month: 3,800 ÷ 7 = 542.86 to keep the date.
- **A12 loan:** standard annuity: payment = P·r ÷ (1 − (1 + r)^−n), r = annual rate ÷ 12.
