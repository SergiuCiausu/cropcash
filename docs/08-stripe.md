# 08. Stripe: integrarea

> **Totul e în test mode.** Cheile încep cu `sk_test_`. Codul refuză să pornească dacă `STRIPE_SECRET_KEY` nu începe cu `sk_test_`.

## 1. Modelul

| Concept CropCash | Obiect Stripe | Real sau simulat |
|---|---|---|
| Fermierul | **Connected account de tip Express** (country `RO`, capability `transfers`) | Obiect real în test mode. Platforma nu ține banii în contul ei. |
| Contul bancar al fermierului | external account pe connected account (IBAN de test Stripe pentru RO) | simulat |
| Avansul sau soldul APIA | PaymentIntent pe platformă (card de test) + **Transfer** către connected account | simulat (în realitate plătește APIA) |
| Vânzarea recoltei | același mecanism, cu `metadata.kind = crop_sale` | simulat |
| „Salariul” lunar | **Payout manual** din connected account către IBAN, lunar | obiect real în test mode, cu suma din algoritmul de netezire |
| Pensia | **Customer + Subscription** lunară (price în RON, suma aleasă) | simulat (în realitate, contribuție la Pilonul III / CEI) |
| Trecerea timpului | **Test Clock** + ceasul aplicației | vezi secțiunea 4 |

Monedă: `ron`, sume în bani (ca `amount` în Stripe: 1 leu = 100).

## 2. Ordinea în care creăm obiectele

**La onboarding:**
1. `accounts.create({ type: 'express', country: 'RO', capabilities: { transfers: { requested: true } }, settings: { payouts: { schedule: { interval: 'manual' } } } })`. Payout-urile manuale înseamnă că salariul e controlat de aplicație.
2. Contul de test e completat cu datele de test (onboarding link sau prefill în test mode), plus external account cu IBAN-ul de test RO.
3. `testHelpers.testClocks.create({ frozen_time: <1 nov 2026> })`, salvat în `farmers.test_clock_id`.
4. `customers.create({ test_clock, metadata: { farmer_id } })` pentru subscription-ul de pensie.

**Când intră o încasare (demo: butonul „Simulează avansul APIA”):**
5. `paymentIntents.create({ amount: 1265220, currency: 'ron', payment_method: 'pm_card_bypassPending', confirm: true, transfer_data: { destination: acct }, metadata: { kind: 'apia_advance' } })`. Cardul de test `bypassPending` face fondurile disponibile imediat.
6. Webhook-ul `transfer.created` creează o `Transaction` și deschide ecranul „Au intrat bani!” cu propunerea de plicuri.

**Lunar:**
7. `payouts.create({ amount: S, currency: 'ron' }, { stripeAccount: acct })`, unde S vine din algoritmul de netezire.
8. Webhook-ul `payout.paid` trece `Payout.status` pe `paid` și scade plicul „Salariu”.

**Pensia:**
9. `prices.create({ unit_amount: monthly, currency: 'ron', recurring: { interval: 'month' }, product })`, apoi `subscriptions.create({ customer, items: [{ price }] })`.
10. Webhook-ul `invoice.paid` adaugă o `Transaction` și crește plicul „Bătrânețe”.

## 3. Webhooks

| Eveniment | Vine de la | Ce face în aplicație |
|---|---|---|
| `transfer.created` | platformă | marchează ExpectedPayment ca `received`, creează Transaction, recalculează salariul |
| `payout.paid` | **connected account** (Connect) | Payout → `paid`, scade plicul „Salariu” |
| `payout.failed` | connected account | Payout → `failed`, notificare |
| `invoice.paid` | platformă | crește plicul „Bătrânețe” |
| `test_helpers.test_clock.ready` | platformă | rulează `payoutScheduler` pentru lunile sărite (secțiunea 4) |

- **Idempotență:** `transactions.stripe_object_id` e `unique`, deci un eveniment trimis de două ori nu dublează banii.
- **Verificarea semnăturii** se face cu `STRIPE_WEBHOOK_SECRET`, pe raw body (`express.raw()` doar pe ruta de webhooks).

### Comanda de dezvoltare
```bash
stripe listen \
  --forward-to localhost:3001/api/webhooks/stripe \
  --forward-connect-to localhost:3001/api/webhooks/stripe
```
`--forward-connect-to` e necesar pentru `payout.*`, care sunt evenimente pe connected account.

## 4. Test Clocks în demo: o limitare importantă

**Test Clocks avansează doar obiectele de billing** (customers, subscriptions, invoices). **Nu** declanșează payouts și nu mișcă timpul pentru connected accounts.

**Soluția:**
- „Ceasul aplicației” = `frozen_time` al Test Clock-ului fermierului, nu `Date.now()`, în modul demo.
- `POST /api/demo/advance-clock { months: 6 }` face `testClocks.advance({ frozen_time: +6 luni })`.
- Stripe generează facturile de pensie pentru lunile sărite și trimite `invoice.paid` real, pentru fiecare lună.
- La `test_helpers.test_clock.ready`, `payoutScheduler` vede că între vechiul și noul timp au trecut 6 „zile de salariu”. Creează câte un payout pentru fiecare lună, în ordine, și le marchează cu `metadata.month`. Payout-urile se creează imediat (în test mode trec în `paid` după scurt timp), dar în UI apar pe luna lor.
- Încasările planificate din fereastra sărită (de exemplu, soldul APIA în martie) sunt simulate de același job, prin transferuri de test, ca să se vadă bugetul mișcându-se.

**Ce vede juriul:** apăsăm „Dăm timpul înainte 6 luni” și pe ecran apar, lună cu lună: salariul plătit, contribuția la pensie, plicul de primăvară golit în aprilie, soldul APIA venit în martie.

## 5. Ce e real și ce e simulat (de spus juriului)

- **Real (în test mode):** connected accounts, transferuri, payouts, subscriptions, webhooks, Test Clock.
- **Simulat:** sursa banilor (APIA și cumpărătorul recoltei sunt carduri de test), contul bancar (IBAN de test), destinația pensiei (în realitate, un administrator de Pilon III).
- **Limitarea:** în producție, păstrarea și alocarea banilor fermierului necesită un **partener licențiat** (instituție de plată sau bancă) și verificarea KYC completă. CropCash ar fi stratul de planificare peste contul acelui partener.

## 6. Variabile de mediu

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (vezi `.env.example`). Cheia publicabilă nu e necesară în MVP, pentru că nu colectăm carduri în frontend.
