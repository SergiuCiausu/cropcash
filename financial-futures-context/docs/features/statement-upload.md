# Account statement upload

Users can upload a PDF or CSV account statement and get a clear money profile without connecting a bank. This also gives
the app a dated starting balance, supports Romanian RON accounts before live bank connections are available, and fills
history older than a bank returns (Salt Edge's `max_fetch_interval` defaults to 60 days). API: A1.

## Upload flow

1. The user chooses a statement and agrees to its use.
2. The app reads the account details, period, opening and closing balances, and transactions.
3. It checks that the opening balance plus transactions equals the closing balance.
4. It groups income, expenses, and recurring payments.
5. The user reviews a summary and confirms anything uncertain, including their salary.
6. The app adds the approved data to the dashboard, goals, and forecast.

| What the app learns | How it works | What the user confirms |
| --- | --- | --- |
| Money available | Uses the statement's closing balance and date as the starting point | Whether this is the latest balance or needs updating |
| Subscriptions | Finds repeated merchants, amounts, and timing | Keep, cancel, or not a subscription |
| Biggest expenses | Ranks merchants and categories by total spending | Corrected categories |
| Income sources | Groups regular and one-off money coming in | Each income source's name |
| Salary | Suggests the likely salary and payday from repeated payments | "Mark as salary" |
| Regular bills | Identifies recurring rent, utilities, loans, and similar costs | Whether each bill is essential |

## Rules

- **Prevent duplicates:** Compare statement entries with existing transactions before importing them.
- **Handle uncertain data:** Show low-confidence items for review instead of guessing.
- **Support common formats:** Start with the main Romanian banks, then add more statement layouts.
- **Protect the file:** Treat statements as sensitive financial data, encrypt them, and let users delete them.
- **Limit retention:** Keep only the original file for as long as the user needs it, or delete it after extraction by default.

**Done when:** A user can upload a real statement, correct the summary in under a minute, and see the same data
reflected across the app.
