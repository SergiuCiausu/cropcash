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
| `POST /api/pension` | Abonament lunar în RON pe customer-ul de pe Test Clock. Prima contribuție se plătește imediat. Merge și după o pensie oprită. |
| `PUT /api/pension` | Altă sumă lunară: un preț nou pe același abonament, fără proration, deci contribuția deja plătită rămâne cum e și noua sumă se ia de la următoarea factură. |
| `DELETE /api/pension` | Oprește abonamentul acum (`prorate: false`): ce s-a plătit rămâne, nu se mai ia nimic. Planul devine `stopped`. |
| `POST /api/demo/advance` | „Dăm timpul înainte” cu 1–12 luni: pentru fiecare lună sărită plătește salariul pe 1 ale lunii (payout = salariul sigur calculat de `computeFarmPlan` în acea zi), simulează încasările care cad în perioadă (scenariul normal, la mijlocul ferestrei, deci mai devreme decât planul prudent), înregistrează cheltuielile fermei planificate (plătite din banca fermierului, fără Stripe), mută Test Clock-ul **în pași de cel mult 2 luni** (limita Stripe cu un abonament lunar) și înregistrează facturile de pensie plătite. |
| `POST /api/webhooks/stripe` | Corp brut, semnătură verificată. `payment_intent.succeeded`, `invoice.paid`, `payout.paid` / `payout.failed`. |

**Toate sumele se înregistrează o singură dată** (`transactions.stripe_object_id` e unic). De aceea fluxul merge și fără `stripe listen`: API-ul înregistrează direct, iar webhook-urile doar confirmă.

**Doar serverul scrie bani** (migrarea 010): fermierul nu poate scrie în `transactions`, `payouts`, `pension_plans` și nu își poate schimba id-urile Stripe sau ceasul demo.

**Lucruri aflate la testare:**
- Un transfer abia făcut devine disponibil în contul fermierului după câteva secunde. Salariul așteaptă până la 10 secunde.
- În test mode, un payout trece pe `paid` aproape instant, uneori **înainte** să fie salvat la noi, deci webhook-ul `payout.paid` poate veni prea devreme. Webhook-ul reîncearcă, iar „dăm timpul înainte” sincronizează la final statusul salariilor direct din Stripe.
- Contribuția de pensie care cade exact pe noua dată a ceasului rămâne factură ciornă: Stripe o finalizează după o oră de timp simulat, deci apare la următoarea mutare. Dacă suma se schimbă între timp, factura ciornă rămâne la suma veche.
- Stripe CLI (v1.55) cere evenimentele explicit: vezi comanda de mai jos.

**Ce e simplificat (de spus la demo):**
- Pensia se plătește cu un card de test, nu din soldul fermierului.
- Salariul se plătește din banii ajunși prin Stripe: încasările APIA și, în demo, **creditul declarat** (intră în contul CropCash în luna lui, ca o plată APIA; rata se înregistrează din banca fermierului când trece data). Soldul de pornire nu e în Stripe. Dacă soldul Stripe nu ajunge, salariul e marcat „nu s-a putut plăti”.
- **Salariul e fix** (pasul 9, migrarea 012): se fixează la salariul sigur din acel moment când fermierul apasă „Bine așa” la împărțire, declară/șterge un credit sau pornește, schimbă ori oprește pensia (`farmers.salary_bani`). În fiecare lună se plătește `min(fix, salariul sigur recalculat)`: nu crește singur, dar scade dacă banii n-ar ajunge. Pentru Ion cu credit: 2.850 lei din decembrie până în aprilie, 1.550 lei în mai (planul vede rambursarea din noiembrie).
- O încasare simulată așteaptă (până la 30 s) să apară banii în soldul fermierului, ca salariul plătit imediat după să-i găsească.

**Testat cap-coadă:** `npm run test:stripe` (sandbox + Supabase): configurare, avans, pensie, 6 luni înainte → 6 salarii plătite, 5–6 contribuții, restul APIA în martie; apoi pensia trece la 300 lei, apoi se oprește.

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

Verificat tot pe sandbox: transferul ajunge în cont după ~3 secunde, nu imediat, iar `pm_card_visa` plătește facturile clientului legat de Test Clock.

## 2. Ordinea în care creăm obiectele

**Prima dată când se mișcă bani, nu la onboarding:** înscrierea trebuie să meargă și când Stripe e lent, iar fermierul nu vede oricum obiectele astea (`ensureStripe` din `routes/demo.ts`).
1. Contul conectat, datele de test, IBAN-ul de test și payout-urile manuale, ca în secțiunea 1b. Payout-urile manuale înseamnă că salariul e controlat de aplicație.
3. `testHelpers.testClocks.create({ frozen_time: <1 nov 2026> })`, salvat în `farmers.test_clock_id`.
4. `customers.create({ test_clock, metadata: { farmer_id } })` pentru subscription-ul de pensie.

**Când intră o încasare (demo: butonul „Simulează avansul APIA”):**
5. `paymentIntents.create({ amount: 1264932, currency: 'ron', payment_method: 'pm_card_bypassPending', confirm: true, transfer_data: { destination: acct }, metadata: { kind: 'apia_advance' } })`. Cardul de test `bypassPending` face fondurile disponibile imediat.
6. Ruta salvează `Transaction` pe loc și deschide ecranul „Au intrat bani!” cu propunerea de plicuri. Webhook-ul `payment_intent.succeeded` face același lucru pentru încasările din `payoutScheduler`. Dublura e sigură: cheia e id-ul plății.

**Lunar:**
7. `payouts.create({ amount: S, currency: 'ron' }, { stripeAccount: acct })`, unde S vine din algoritmul de netezire.
8. Webhook-ul `payout.paid` trece `Payout.status` pe `paid` și scade plicul „Salariu”.

**Pensia:**
9. `prices.create({ unit_amount: monthly, currency: 'ron', recurring: { interval: 'month' }, product })`, apoi `subscriptions.create({ customer, items: [{ price }] })`.
10. Webhook-ul `invoice.paid` adaugă o `Transaction` și crește plicul „Bătrânețe”.

## 3. Webhooks

| Eveniment | Vine de la | Ce face în aplicație |
|---|---|---|
| `payment_intent.succeeded` | platformă | creează Transaction și scoate încasarea din prognoză. **Nu `transfer.created`:** transferul unei plăți destination nu are metadata, verificat pe sandbox |
| `payout.paid` | **connected account** (Connect) | Payout → `paid`, scade plicul „Salariu” |
| `payout.failed` | connected account | Payout → `failed`, notificare |
| `invoice.paid` | platformă | crește plicul „Bătrânețe” |

- **Idempotență:** `transactions.stripe_object_id` e `unique`, deci un eveniment trimis de două ori nu dublează banii.
- **Verificarea semnăturii** se face cu `STRIPE_WEBHOOK_SECRET`, pe raw body (`express.raw()` doar pe ruta de webhooks).

### Comanda de dezvoltare
```bash
stripe listen \
  --events payment_intent.succeeded,invoice.paid,payout.paid,payout.failed \
  --forward-to localhost:3001/api/webhooks/stripe \
  --forward-connect-to localhost:3001/api/webhooks/stripe
```
`--forward-connect-to` e necesar pentru `payout.*`, care sunt evenimente pe connected account.

## 4. Test Clocks în demo: o limitare importantă

**Test Clocks avansează doar obiectele de billing** (customers, subscriptions, invoices). **Nu** declanșează payouts și nu mișcă timpul pentru connected accounts.

**Soluția:**
- „Ceasul aplicației” = `frozen_time` al Test Clock-ului fermierului, nu `Date.now()`, în modul demo.
- `POST /api/demo/advance { months: 6 }` mută ceasul, pas cu pas.
- **Limita Stripe:** cu o subscription lunară, ceasul avansează cel mult 2 luni odată (verificat pe sandbox: un salt de 6 luni e refuzat). `advanceFarm` merge deci câte 2 luni și așteaptă `ready` după fiecare pas, ~18 secunde, adică ~1 minut pentru 6 luni. Ruta răspunde imediat, iar pagina urmărește datele.
- Stripe generează facturile de pensie pentru lunile sărite și trimite `invoice.paid` real, pentru fiecare lună.
- După fiecare pas, `MoneyService.advance` rulează fiecare lună trecută, în ordine. Ziua de salariu e pe 1. Payout-urile se creează imediat (în test mode trec în `paid` după câteva secunde), dar în UI apar pe luna lor.
- **Salariul** rămâne la fel între încasări, și când fermierul nu l-a fixat încă: se recalculează când intră bani și scade între ele doar dacă altfel banii nu ajung (`salaryToPay`, `07-architecture.md` §4). Un salariu fixat cu „Bine așa” rămâne la suma aceea, mai puțin dacă banii nu ajung.
- Încasările planificate din fereastra sărită (de exemplu, soldul APIA în martie) sunt simulate de același job, prin transferuri de test. Costurile planificate ale lunii se notează ca cheltuieli și ies din plicul de primăvară.
- `payout.paid` ajunge la câteva secunde după payout, deci uneori după ce luna următoare a rulat deja. Un salariu trimis e scăzut din bani încă de la trimitere (`salariesOnTheWay`), altfel luna următoare l-ar număra ca bani de cheltuit.
- **Salariul** rămâne la fel între încasări: se recalculează când intră bani și scade între ele doar dacă altfel banii nu ajung (`07-architecture.md` §4).

**Ce vede juriul:** apăsăm „Dăm timpul înainte 6 luni” și pe ecran apar, lună cu lună: salariul plătit, contribuția la pensie, plicul de primăvară golit în aprilie, soldul APIA venit în martie.

## 5. Ce e real și ce e simulat (de spus juriului)

- **Real (în test mode):** connected accounts, transferuri, payouts, subscriptions, webhooks, Test Clock.
- **Simulat:** sursa banilor (APIA și cumpărătorul recoltei sunt carduri de test), contul bancar (IBAN de test), destinația pensiei (în realitate, un administrator de Pilon III).
- **Limitarea:** în producție, păstrarea și alocarea banilor fermierului necesită un **partener licențiat** (instituție de plată sau bancă) și verificarea KYC completă. CropCash ar fi stratul de planificare peste contul acelui partener.

## 6. Variabile de mediu

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DEMO_MODE`, `VITE_DEMO_MODE` (vezi `.env.example`). Fără cele două chei, API-ul pornește fără rutele care mută bani. Cheia publicabilă nu e necesară în MVP, pentru că nu colectăm carduri în frontend.
