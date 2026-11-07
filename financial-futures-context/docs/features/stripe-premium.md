# Stripe Premium (the Stripe part of the challenge)

Stripe powers one complete, real flow in the demo: Ana buying Premium. It runs in a Stripe sandbox, priced in lei.
Stripe has served Romanian businesses since 2020; Checkout supports one-time payments and subscriptions.
Bank data, goal money and investing stay simulated (see `../data/bank-api.md`).

## Set up before coding

1. Create a sandbox in the Stripe Dashboard and use its test API keys.
2. Create a Premium product with a monthly price in RON.
3. Set up a webhook endpoint and forward sandbox events to it with the Stripe CLI.
4. Keep your Stripe secret key on the server only.

| Demo moment | Stripe product | How to use it | Sandbox test |
| --- | --- | --- | --- |
| Ana taps Upgrade to Premium | Checkout | Create a Checkout Session in subscription mode with the Premium price | Pay with test card 4242 4242 4242 4242 |
| The app unlocks Premium | Webhooks | Mark Ana as Premium on `checkout.session.completed`; keep it in sync with `customer.subscription.updated` | Watch the events arrive through the Stripe CLI |
| Ana manages or cancels | Customer portal | Open a portal session from the app's settings | Cancel in the portal and check that Premium turns off |
| Next month's renewal | Billing | Billing creates the invoice and charges the saved card | Advance a test clock by one month |
| A renewal fails | Billing | Show an "Update your card" prompt on `invoice.payment_failed` | Use a test card that attaches but declines charges |

**Keep the ledger simple:** Save Ana's Stripe customer and subscription IDs. Update Premium status from webhook events,
not from button taps alone.

**Why not more Stripe products:** Financial Connections reads only US bank accounts, Treasury's EEA accounts are EUR-only
and Romania isn't listed, and Issuing prohibits consumer spending. Stripe Connect could be evaluated later for paying
grocery partners in Phase 5.

**Decide:** what Premium includes (for example, unlimited bank connections, Explain this, statement uploads, more saved
scenarios) and its price.
