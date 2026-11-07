# Keeping balances in sync

With only transaction data and a starting balance, the app's balance is an estimate that can drift from the bank's.
Label it "Estimated balance," show "Last updated" beside it, and never use it alone to approve real money movement.
API: B6 (bank balance), B8 (pending), A6 (estimated balance).

| Cause | What happens | How to reduce it |
| --- | --- | --- |
| Wrong starting balance | The user mistypes it or enters an old amount | Let them edit it, and recalculate from that date |
| Bad cutoff date | A transaction around the start date is counted twice or missed | Save the exact date and show early transactions for review |
| Delayed refresh | The bank moved money, but the daily update hasn't arrived | Show the last updated time |
| Failed refresh | A sync fails, so transactions are missing | Monitor refresh status and show a warning |
| Missed event | Your server misses a bank-data callback | Run a regular sync using the last processed refresh |
| Duplicate processing | One transaction is applied twice | Save by the provider's transaction ID, not by amount or description |
| Pending changes | A pending amount changes, posts, or becomes void | Update the existing record and recalculate |
| Disconnected account | The user revokes access or must log in again | Pause the estimate and ask them to reconnect |
| Unlinked account | Money moves to an account or card you can't see | Mark it as a transfer, or ask the user to link that account |
| Missing data | The bank doesn't provide every item or enough history | Compare totals and ask for a quick correction |
| Refunds and reversals | Money returns later or a transaction is canceled | Treat them as new events linked to the original purchase |
| Fees and interest | The bank adds a charge or interest | Include them if they appear; otherwise, handle the difference during a check |
| Currency differences | The amount changes between pending and posted | Use the posted amount as the final value |
| Your own logic | Pending, transfer, or sign-handling rules contain a bug | Test with sample cases and keep an audit log |

**Keep history intact:** Don't overwrite original transaction data. Calculate balances from it, so you can correct one
bad item and rebuild the result.

**Pending transactions:** Salt Edge may replace pending items with new IDs. Delete and re-fetch pending items on every
pull; never key anything on a pending transaction's ID.

## When the user notices a mismatch

1. Check the last refresh time and connection status.
2. Ask them to enter the balance shown by their bank.
3. Compare the difference with recent pending, void, or missing transactions.
4. Add a labeled "Balance adjustment" for anything unexplained.

**Fixture check:** In `fixtures/ana/`, each account's opening balance plus its posted transactions equals the B6 balance;
current account 4,280.55 − pending 64.20 = estimated 4,216.35.
