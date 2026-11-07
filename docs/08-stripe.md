# 08. Stripe: integrarea

> **Totul e în test mode.** Cheile încep cu `sk_test_`. Codul refuză să pornească dacă `STRIPE_SECRET_KEY` nu începe cu `sk_test_`.

## 1. Modelul

| Concept CropCash | Obiect Stripe | Real sau simulat |
|---|---|---|
| Fermierul | **Connected account Accounts v2, configurație `recipient`**, `dashboard=none` (vezi §1b) | Obiect real în test mode. Platforma nu ține banii în contul ei. |
| Contul bancar al fermierului | external account pe connected account (IBAN de test Stripe pentru RO) | simulat |
| Avansul sau soldul APIA | PaymentIntent pe platformă (card de test) + **Transfer** către connected account | simulat (în realitate plătește APIA) |
| Vânzarea recoltei | același mecanism, cu `metadata.kind = crop_sale` | simulat |
| „Salariul” lunar | **Payout manual** din connected account către IBAN, lunar | obiect real în test mode, cu suma din algoritmul de netezire |
| Pensia | **Customer + Subscription** lunară (price în RON, suma aleasă) | simulat (în realitate, contribuție la Pilonul III / CEI) |
| Trecerea timpului | **Test Clock** + ceasul aplicației | vezi secțiunea 4 |

Monedă: `ron`, sume în bani (ca `amount` în Stripe: 1 leu = 100).

## 1c. Implementat (pasul 6)

Codul e în `apps/api/src/stripe/money.ts` (`MoneyService`) și `apps/api/src/routes/money.ts`.

| Ruta | Ce face |
|---|---|
| `POST /api/stripe/setup` | Creează o singură dată contul v2 al fermierului (cu datele de identificare de test), IBAN-ul de test, plățile manuale, **Test Clock-ul** („ceasul demo”, `farmers.demo_now`) și customer-ul cu card de test. Se poate apela de mai multe ori fără efecte duble. |
| `POST /api/demo/income` | „Simulează avansul APIA”: suma din plan (12.652,20 lei pentru Ion), ca destination charge în contul fermierului, la data ceasului demo. |
| `POST /api/pension` | Abonament lunar în RON pe customer-ul de pe Test Clock. Prima contribuție se plătește imediat. |
| `POST /api/demo/advance` | „Dăm timpul înainte” cu 1–12 luni: pentru fiecare lună sărită plătește salariul pe 1 ale lunii (payout = salariul sigur calculat de `computeFarmPlan` în acea zi), simulează încasările care cad în perioadă (scenariul normal, la mijlocul ferestrei, deci mai devreme decât planul prudent), înregistrează cheltuielile fermei planificate (plătite din banca fermierului, fără Stripe), mută Test Clock-ul **în pași de cel mult 2 luni** (limita Stripe cu un abonament lunar) și înregistrează facturile de pensie plătite. |
| `POST /api/webhooks/stripe` | Corp brut, semnătură verificată. `payment_intent.succeeded`, `invoice.paid`, `payout.paid` / `payout.failed`. |

**Toate sumele se înregistrează o singură dată** (`transactions.stripe_object_id` e unic). De aceea fluxul merge și fără `stripe listen`: API-ul înregistrează direct, iar webhook-urile doar confirmă.

**Doar serverul scrie bani** (migrarea 010): fermierul nu poate scrie în `transactions`, `payouts`, `pension_plans` și nu își poate schimba id-urile Stripe sau ceasul demo.

**Lucruri aflate la testare:**
- Un transfer abia făcut devine disponibil în contul fermierului după câteva secunde. Salariul așteaptă până la 10 secunde.
- În test mode, un payout trece pe `paid` aproape instant, uneori **înainte** să fie salvat la noi, deci webhook-ul `payout.paid` poate veni prea devreme. Webhook-ul reîncearcă, iar „dăm timpul înainte” sincronizează la final statusul salariilor direct din Stripe.
- Contribuția de pensie care cade exact pe noua dată a ceasului rămâne factură ciornă: Stripe o finalizează după o oră de timp simulat, deci apare la următoarea mutare.
- Stripe CLI (v1.55) cere evenimentele explicit: vezi comanda de mai jos.

**Ce e simplificat (de spus la demo):**
- Pensia se plătește cu un card de test, nu din soldul fermierului.
- Salariul se plătește din banii ajunși prin Stripe (încasările APIA). Banii pe care fermierul îi avea deja în bancă (soldul de pornire) nu sunt în Stripe. Dacă soldul Stripe nu ajunge, salariul e marcat „nu s-a putut plăti”.
- Salariul se recalculează în fiecare lună, deci poate varia puțin. Pentru Ion: 900–1.400 lei, pentru că banii APIA vin mai devreme decât planul prudent.

**Testat cap-coadă:** `npm run test:stripe` (sandbox + Supabase): configurare, avans, pensie, 6 luni înainte → 6 salarii plătite, 5–6 contribuții, restul APIA în martie.

## 1b. Verificat pe contul de sandbox (7 noiembrie 2026)

Stripe a schimbat regulile pentru platformele noi. Ce merge, testat cap-coadă pe sandbox:

| Pas | Cum merge | Ce nu mai merge |
|---|---|---|
| Contul fermierului | **Accounts v2**: `POST /v2/core/accounts`, header `Stripe-Version: 2026-10-28.endive`, `identity.country=ro`, `entity_type=individual`, `configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested=true`, `dashboard=none`, `defaults.currency=ron`, `responsibilities: fees_collector=application, losses_collector=application` | v1 `accounts.create` cu `type=express` e respins pentru platforme noi |
| Riscul | platforma a confirmat „Negative balance liability” în Platform profile (sandbox) | fără confirmare, Stripe impune risc „managed” și onboarding găzduit de Stripe |
| Datele fermierului (KYC) | le trimite platforma (`requirements_collector=application`) prin `POST /v2/core/accounts/{id}`: nume, data nașterii, adresă, `identity.attestations.terms_of_service.account` (dată + IP), `defaults.profile.business_url`. Valori de test: data nașterii 1901-01-01, `line1=address_full_match` | — |
| Contul bancar | v1 `POST /v1/accounts/{id}/external_accounts`, IBAN de test `RO49AAAA1B31007593840000`, `currency=ron` | — |
| Salarii doar la cerere | v1 `POST /v1/accounts/{id}` cu `settings[payouts][schedule][interval]=manual`. **Obligatoriu:** implicit e `daily` cu întârziere de 7 zile, adică Stripe ar trimite singur tot soldul | — |
| Avansul APIA simulat | `PaymentIntent` cu `amount`, `currency=ron`, `payment_method=pm_card_bypassPending`, `confirm=true`, `automatic_payment_methods[enabled]=true`, `[allow_redirects]=never`, `transfer_data[destination]=acct_…`. Banii sunt disponibili imediat în contul fermierului | `payment_method_types` nu mai e acceptat |
| Salariul | v1 `POST /v1/payouts` cu header `Stripe-Account: acct_…`, `amount`, `currency=ron` → status `pending` | — |
| Închiderea unui cont de test | `POST /v2/core/accounts/{id}/close` cu `applied_configurations=["recipient"]` | — |

Fermierul **nu vede nimic din Stripe**: nici dashboard, nici pagini de onboarding. Datele le introduce în CropCash; în demo folosim valorile de test de mai sus.

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
