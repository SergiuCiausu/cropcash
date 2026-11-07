# Bank data API (Salt Edge v6 format)

The mock server answers on the same paths and field names as `https://www.saltedge.com/api/v6`, so switching to Salt Edge
changes only the base URL and keys. Every request carries `App-id` and `Secret` headers (the mock accepts any values).
Responses are in `fixtures/ana/b*.json` and `fixtures/ana/transactions-*.json`.

## Implementation rules

- Put all calls behind `BankDataProvider` with `listBanks`, `createCustomer`, `connect`, `getConnection`, `getAccounts`,
  `getTransactions(accountId, {pending})`, `refresh`, `reconnect`, `getRates`, `removeConnection`, plus handlers for the two
  incoming callbacks.
- Paginate with `from_id` until `meta.next_id` is `null`. Store transactions by `id` (upsert) so repeated pulls never double.
- Delete and re-fetch pending transactions on every pull; their IDs can change.
- Open `connect_url` in a new tab or pop-up, never an iframe in a webview.
- Mock-only extras: the approve page at `connect_url`, and a demo control that sends B10.

| # | Operation | Call | Fixture |
| --- | --- | --- | --- |
| B1 | List banks | `GET /api/v6/providers?country_code=RO&include_ais_fields=true&exclude_inactive=true` | `b01-providers.json` |
| B2 | Create customer | `POST /api/v6/customers` | `b02-customer.json` |
| B3 | Start bank connection | `POST /api/v6/connections/connect` | `b03-connect.json` |
| B4 | Connection finished (incoming) | `POST /callbacks/saltedge/success` on your server | `b04-callback-success.json` |
| B5 | Check connection | `GET /api/v6/connections/{id}` | `b05-connection.json` |
| B6 | List accounts | `GET /api/v6/accounts?connection_id={id}` | `b06-accounts.json` |
| B7 | List transactions | `GET /api/v6/transactions?connection_id={id}&account_id={id}&per_page=250` | `transactions-*.json` |
| B8 | List pending transactions | same as B7 with `&pending=true` | `transactions-pending.json` |
| B9 | Refresh data | `POST /api/v6/connections/{id}/refresh` | `b09-refresh.json` |
| B10 | Consent expired (incoming) | `POST /callbacks/saltedge/consent` on your server | `b10-callback-consent-expired.json` |
| B11 | Reconnect bank | `POST /api/v6/connections/{id}/reconnect` | `b11-reconnect.json` |
| B12 | Currency rates | `GET /api/v6/rates?date=2026-11-07` | `b12-rates.json` |
| B13 | Disconnect bank | `DELETE /api/v6/connections/{id}` | `b13-remove-connection.json` |

## Request bodies

**B2 Create customer**
```json
{ "data": { "identifier": "user_ana_8f3a21" } }
```

**B3 Start bank connection**
```json
{
  "data": {
    "customer_id": "100000000000000001",
    "consent": { "scopes": ["accounts", "transactions"], "from_date": "2026-08-07", "period_days": 180 },
    "attempt": {
      "fetch_scopes": ["accounts", "balance", "transactions"],
      "fetch_from_date": "2026-08-07",
      "locale": "ro",
      "return_to": "https://app.local/bank-connected"
    },
    "widget": { "allowed_countries": ["RO"], "skip_provider_selection": true },
    "provider": { "code": "mock_demobank_ro" },
    "return_connection_id": true,
    "categorization": "personal",
    "automatic_refresh": true
  }
}
```

**B9 Refresh data** (allowed again after `next_refresh_possible_at`; the mock adds the next day of Ana's spending)
```json
{ "data": { "attempt": { "fetch_scopes": ["accounts", "balance", "transactions"], "return_to": "https://app.local/bank-connected" } } }
```

**B11 Reconnect bank** (a new consent object is required)
```json
{
  "data": {
    "consent": { "scopes": ["accounts", "transactions"], "period_days": 180 },
    "attempt": { "fetch_scopes": ["accounts", "balance", "transactions"], "return_to": "https://app.local/bank-connected" }
  }
}
```

Incoming callbacks (B4, B10): answer `200 OK` with an empty body, then act (B4 → fetch B6 and B7; B10 → mark the
connection paused and show "Reconnect your bank").

## Field notes

- `amount` is negative for money out, positive for money in. `mode` is `normal`, `fee`, or `transfer`.
- Use `extra.payee_information` / `extra.payer_information` for clean merchant names and `extra.mcc` for merchant type.
- `category` names in fixtures are the app's own; map whatever the source returns to them.
- B12 rates are quoted against USD: RON per EUR = EUR rate ÷ RON rate (1.1530 ÷ 0.2320 ≈ 4.97).
- Before going live, confirm optional fields of B9/B11 in Salt Edge's reference and switch to signed requests
  (`Expires-at` and `Signature` headers) and HTTPS callbacks.

## Moving from mock to Salt Edge

| Setting | Source |
| --- | --- |
| `BANK_DATA_SOURCE=mock` | Local mock server, Ana's fixtures, works offline |
| `BANK_DATA_SOURCE=saltedge_sandbox` | Salt Edge test account: fake banks such as `fakebank_oauth_xf`, or Ana's CSV through `demo_with_custom_data_client_xf`; up to 10 connections while Pending |
| `BANK_DATA_SOURCE=saltedge` | Partner program or own license, real provider codes from B1 |

Sources: [Salt Edge API v6 reference](https://docs.saltedge.com/v6/api_reference), [Salt Edge v6 docs](https://docs.saltedge.com/v6).
