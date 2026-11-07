# Superseded code (not running)

The team's Stripe flow from `origin/main` is the one that runs: `apps/api/src/stripe/money.ts`, `routes/money.ts` and `db/admin.ts`.

- `local-stripe-flow/` is the other Stripe flow, built locally: gateway, ledger, webhooks, demo routes, payout scheduler, `DemoPanel`, their tests and the migration. It uses `farmers.app_date`, which the code no longer reads.
- `team-original-migrations/` holds the team's three migrations as pushed.

`supabase/migrations/012_team_stripe_money.sql` replaces both sets of Stripe migrations. Don't add the old files back to `supabase/migrations/`: `db:migrate` tracks files by name, so they would run again. The team's `011` and `012` also drop `'sale'` from the `transactions.kind` check, which stops farmers recording sales.

The shared Supabase already has all of these applied, so the columns and functions from the local flow (`app_date`, `apply_payout_paid` and others) remain there unused.
