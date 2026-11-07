# 07. Arhitectura

## 1. Stack-ul și de ce

| Strat | Tehnologie | De ce |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind, ca PWA | Build rapid, mobile-first ușor, instalabil pe telefon fără magazin de aplicații. |
| Backend | Node.js + Express + TypeScript | Aceeași limbă ca frontend-ul, așa că logica (subvenții, netezire) e partajată. |
| DB și auth | Supabase (Postgres) | Auth și Postgres gata făcute, fără ops, cu un tier gratuit suficient pentru demo. |
| Plăți | Stripe, **doar în test mode** | Connect, payouts, subscriptions și Test Clocks acoperă tot flow-ul banilor (challenge-ul e Stripe). |
| AI | Claude API + Zod | Extragere structurată din PDF-uri APIA și din paginile AFIR/MADR, validată strict. |
| Date externe | Open-Meteo, CSV-uri INS în `docs/data/` | Open-Meteo e gratuit și fără cheie. INS nu are un API comod, așa că pregătim datele offline. |
| Deploy | Netlify (front), **VPS pe RareCloud** (API), Supabase (DB + auth, cloud) | Netlify servește PWA-ul static. Pe VPS rulează un proces Node permanent (webhooks, scheduler, job-uri), sub control complet. |
| Offline | `vite-plugin-pwa` (Workbox) + IndexedDB (TanStack Query persistat) | Aplicația se deschide și arată ultimele date fără net. Detalii în §8. |
| Teste | Vitest | Nativ cu Vite și rapid. Obligatoriu pentru motorul de subvenții și netezire. |

## 2. Structura de foldere (monorepo cu npm workspaces)

```
cropcash/
├── apps/
│   ├── web/                  React PWA
│   │   └── src/
│   │       ├── i18n/ro.json  TOATE textele de UI
│   │       ├── screens/      Onboarding, Bani, Calendar, ImiAjung, DeFacut
│   │       ├── components/   BigNumber, EnvelopeBar, Timeline, ScenarioToggle, NeedsInternet
│   │       ├── offline/      starea online/offline, cache persistat, outbox
│   │       ├── auth/         login Supabase, sesiune
│   │       └── api/          client fetch către apps/api
│   └── api/                  Express
│       └── src/
│           ├── routes/       farmers, subsidies, plan, envelopes, stripe, webhooks
│           ├── stripe/       connect, payouts, subscriptions, testClock
│           ├── jobs/         payoutScheduler, fundingRadar (Could)
│           ├── ai/           pdfExtract, fundingExtract (Claude + Zod)
│           └── db/           client Supabase, queries
├── packages/
│   └── shared/               LOGICĂ PURĂ, fără I/O, testată
│       └── src/
│           ├── data/         loader + tipuri Zod pentru docs/data/*.json
│           ├── money/        tipuri Cents/Bani, rotunjiri
│           ├── subsidies/    motorul de reguli (03-subsidies.md)
│           ├── cashflow/     calendarul banilor, netezirea, scenariile
│           ├── risk/         fondul de risc
│           └── pension/      simularea pensiei
├── supabase/migrations/      schema SQL
└── docs/
```

**Regula:** `packages/shared` nu face I/O și nu are cifre hardcodate. Primește datele (JSON-urile din `docs/data/`) ca parametri. Frontend-ul și backend-ul importă aceleași funcții.

## 3. Modelul de date

| Entitate | Câmpuri principale | Relații |
|---|---|---|
| `Farmer` | id, user_id (auth), name, birth_year, county, stripe_account_id, stripe_customer_id, test_clock_id, start_balance_bani, created_at | 1–N Parcel, ExpectedPayment, Envelope, Transaction, Payout, FuelLog; 0–1 PensionPlan |
| `Parcel` | id, farmer_id, crop_id, area_ari (sutimi de ha), is_arable, unproductive_ari | N–1 Farmer, N–1 Crop |
| `Crop` | id ('grau', 'porumb', 'floarea-soarelui'), name_ro | date de referință din `crops-reference.json` (nu se ține în DB) |
| `SubsidyScheme` | code, name_ro, unit, amount_eur, fund, ... | din `subsidies-2026.json` (nu se ține în DB) |
| `ExpectedPayment` | id, farmer_id, kind (apia_advance, apia_balance, crop_sale, fuel_refund, credit, other_in, input_cost, rent, loan_repayment, tax, other_out), direction (in/out), amount_min_bani, amount_probable_bani, amount_max_bani, window_start, window_end, scheme_code?, status (planned/received/cancelled) | N–1 Farmer |
| `Envelope` | id, farmer_id, kind (spring_inputs, debts, salary, risk_fund, pension), balance_bani, target_bani? | N–1 Farmer, 1–N Transaction |
| `Transaction` | id, farmer_id, envelope_id?, amount_bani (+/−), occurred_at, source (stripe_transfer, payout, manual, allocation), stripe_object_id?, expected_payment_id? | N–1 Farmer, N–1 Envelope |
| `Payout` | id, farmer_id, amount_bani, scheduled_for (date), stripe_payout_id?, status (scheduled/pending/paid/failed) | N–1 Farmer |
| `PensionPlan` | id, farmer_id, monthly_bani, vehicle (pilon3/cei_s/cei_d), stripe_subscription_id, started_at, status | 1–1 Farmer |
| `FuelLog` | id, farmer_id, date, liters, invoice_no, supplier, parcel_id?, quarter | N–1 Farmer |
| `FundingOpportunity` | id, source (afir/apia/madr), url, title, deadline, eligibility_json, extracted_at, match_score, farmer_id? | N–1 Farmer (potrivirea) |

Banii se țin în **bani, ca numere întregi** (`bigint`), niciodată ca float.

### Schema SQL (Supabase)

```sql
create type payment_kind as enum ('apia_advance','apia_balance','crop_sale','fuel_refund','credit','other_in',
  'input_cost','rent','loan_repayment','tax','other_out');
create type envelope_kind as enum ('spring_inputs','debts','salary','risk_fund','pension');

create table farmers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  birth_year int not null check (birth_year between 1920 and 2010),
  county text not null,
  start_balance_bani bigint not null default 0,
  stripe_account_id text,
  stripe_customer_id text,
  test_clock_id text,
  created_at timestamptz not null default now()
);

create table parcels (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  crop_id text not null,
  area_ari int not null check (area_ari > 0),
  is_arable boolean not null default true,
  unproductive_ari int not null default 0
);

create table expected_payments (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  kind payment_kind not null,
  direction text not null check (direction in ('in','out')),
  amount_min_bani bigint not null,
  amount_probable_bani bigint not null,
  amount_max_bani bigint not null,
  window_start date not null,
  window_end date not null,
  scheme_code text,
  status text not null default 'planned' check (status in ('planned','received','cancelled')),
  check (amount_min_bani <= amount_probable_bani and amount_probable_bani <= amount_max_bani),
  check (window_start <= window_end)
);

create table envelopes (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  kind envelope_kind not null,
  balance_bani bigint not null default 0,
  target_bani bigint,
  unique (farmer_id, kind)
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  envelope_id uuid references envelopes(id),
  amount_bani bigint not null,
  occurred_at timestamptz not null,
  source text not null check (source in ('stripe_transfer','payout','manual','allocation','subscription')),
  stripe_object_id text unique,           -- idempotență pentru webhooks
  expected_payment_id uuid references expected_payments(id)
);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  amount_bani bigint not null check (amount_bani > 0),
  scheduled_for date not null,
  stripe_payout_id text unique,
  status text not null default 'scheduled' check (status in ('scheduled','pending','paid','failed')),
  unique (farmer_id, scheduled_for)       -- un singur salariu pe lună
);

create table pension_plans (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null unique references farmers(id) on delete cascade,
  monthly_bani bigint not null check (monthly_bani > 0),
  vehicle text not null check (vehicle in ('pilon3','cei_s','cei_d')),
  stripe_subscription_id text,
  started_at date not null,
  status text not null default 'active'
);

create table fuel_logs (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  date date not null,
  liters numeric(10,2) not null check (liters > 0),
  invoice_no text not null,
  supplier text,
  parcel_id uuid references parcels(id)
);

create table funding_opportunities (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('afir','apia','madr')),
  url text not null unique,
  title text not null,
  deadline date,
  eligibility_json jsonb not null,
  extracted_at timestamptz not null default now()
);

-- RLS: fiecare fermier își vede doar datele lui
alter table farmers enable row level security;
create policy own_farmer on farmers for all using (user_id = auth.uid());
-- aceeași politică pe celelalte tabele, prin farmer_id in (select id from farmers where user_id = auth.uid())
```

## 4. Algoritmul de netezire (salariul lunar)

### Intrări
- `B0`: soldul de start (în bani);
- `months[1..H]`: lunile de la luna curentă până la orizont. **Orizontul** e luna dinaintea următoarei încasări mari și sigure (de exemplu, următorul avans APIA sau următoarea recoltă principală). Implicit H ≤ 15;
- pentru fiecare lună m: `in[m]` și `out[m]`, din `ExpectedPayment`, în scenariul ales (vezi secțiunea 5);
- `fixed[m]`: alocările planificate (pensia lunară, contribuția la fondul de risc);
- `reserve`: soldul minim care trebuie păstrat (implicit 0, configurabil).

### Ieșire
- `S`: salariul lunar maxim, constant, pentru care soldul la sfârșitul fiecărei luni rămâne ≥ `reserve`;
- `bindingMonth`: luna care limitează salariul (pentru explicația din UI: „din cauza lui iunie”);
- `gap`: dacă `S` e sub ținta fermierului, cât credit de punte trebuie și în ce lună.

### Pseudocod

```
function maxSafeSalary(B0, months, scenario, reserve = 0):
    cum = B0
    best = +∞ ; binding = null
    for m in 1..H:
        cum += in[m] − out[m] − fixed[m]       // fără salariu
        // condiția: cum − m·S ≥ reserve  ⇔  S ≤ (cum − reserve) / m
        cap = (cum − reserve) / m
        if cap < best: best = cap ; binding = m
    S = floorTo(max(best, 0), 50 lei)
    return { S, binding, deficit: best < 0 }

function bridgeCreditNeeded(B0, months, S_target, reserve = 0):
    // cât credit, luat înainte de prima lună cu problemă, ar permite S_target
    cum = B0 ; need = 0 ; firstMonth = null
    for m in 1..H:
        cum += in[m] − out[m] − fixed[m]
        short = m·S_target + reserve − cum
        if short > 0:
            need = max(need, short)
            firstMonth = firstMonth ?? m
    return { amount: ceilTo(need, 100 lei), takeInMonth: firstMonth }
```

Complexitate O(H). E o funcție pură, deci testabilă cu tabele de date.

### Cazuri-limită
| Caz | Comportament |
|---|---|
| `best < 0` (banii se termină chiar și fără salariu) | `S = 0`, `deficit = true`. UI-ul spune: „În {lună} îți lipsesc X lei. Îți propunem un credit pe adeverință de Y lei.” |
| Nicio încasare în orizont | orizontul se limitează la 12 luni; salariul vine doar din `B0` |
| Încasarea are fereastră (sold APIA 1 dec – 30 iun) | data se alege după scenariu: pesimist = ultima zi, mediu = mijlocul, optimist = prima zi |
| Încasarea vine mai devreme decât în plan | la fiecare încasare reală se **recalculează** (rolling), iar salariul poate doar să crească sau să rămână la fel în luna curentă |
| Încasarea e mai mică decât minimul | se recalculează imediat și se trimite notificare: „Am scăzut salariul la X lei ca să-ți ajungă până în {lună}.” |
| Salariul deja plătit în luna curentă | e inclus în `out` pentru luna curentă și nu se mai plătește o dată |
| Rotunjirea | `S` se rotunjește în jos la 50 de lei, creditul se rotunjește în sus la 100 de lei |
| H = 0 | `S = 0` și o eroare de configurare (nu ar trebui să se întâmple) |

### Exemplu numeric (Ion, scenariul mediu, orizont noiembrie 2026 – septembrie 2027, H = 11)

**Presupuneri de demo:** soldul la 1 noiembrie 2026 e de 35.000 lei, după vânzarea porumbului. Cheltuielile sunt costurile medii din `crops-reference.json` (grâu 8 × 4.250 = 34.000 lei, porumb 7 × 5.000 = 35.000 lei), pe lunile de acolo. Pensia e de 200 lei/lună, iar fondul de risc primește 10% din fiecare încasare.

| Lună | Intră | Iese | Cumulat (fără salariu) | Plafon = cumulat / m |
|---|---|---|---|---|
| Noi | avans 12.652,20 | 200 + 1.265,22 | 46.186,98 | 46.187 |
| Dec | — | 200 | 45.986,98 | 22.993 |
| Ian | — | 200 | 45.786,98 | 15.262 |
| Feb | — | 200 | 45.586,98 | 11.397 |
| Mar | sold 4.217,40 | 13.750 + 200 + 421,74 | 35.432,64 | 7.087 |
| Apr | — | 20.850 + 200 | 14.382,64 | 2.397 |
| Mai | — | 5.250 + 200 | 8.932,64 | 1.276 |
| **Iun** | — | 3.500 + 200 | **5.232,64** | **654** ← limitează |
| Iul | grâu 42.000 | 5.100 + 200 + 4.200 | 37.732,64 | 4.190 |
| Aug | — | 200 | 37.532,64 | 3.753 |
| Sep | — | 5.100 + 200 | 32.232,64 | 2.930 |

- **Fără credit:** S = **650 lei/lună**, limitat de iunie.
- **Cu ținta de 2.400 lei/lună:** `bridgeCreditNeeded` dă **14.000 lei**, luați în aprilie. Asta e sub 90% din subvenția estimată pentru 2027, deci încape în creditul pe adeverință. La sfârșitul lui septembrie rămân ~19.800 lei, care acoperă cheltuielile din octombrie. Creditul se întoarce din avansul următor.
- **Mesajul pentru pitch:** „CropCash nu te scapă de credit. Îți spune din noiembrie de cât credit ai nevoie și când, ca să ai 2.400 lei în fiecare lună.”

### Creditul în aplicație (decizie: varianta A + C)
- **A, informativ:** dacă `S < S_target`, UI-ul arată: „Ca să ai {S_target} lei pe lună, o să ai nevoie de ~{amount} lei în {lună}. Fermierii iau de obicei credit pe adeverința APIA.” Fără bănci numite și fără link-uri către oferte. Ținta implicită `S_target` = media surplusului pe orizont (`cum_H / H`), rotunjită în jos la 50 de lei. Fermierul o poate modifica.
- **C, creditul declarat de fermier:** pe ecranul „Îmi ajung?”, butonul „Iau un credit” deschide un formular cu suma, luna și luna rambursării. Creditul devine două `ExpectedPayment`: `credit` (in) și `loan_repayment` (out). Netezirea îl include automat.
- Fără un credit declarat, salariul afișat e întotdeauna cel sigur fără credit (650 lei pentru Ion). Varianta A apare doar ca sugestie.

## 5. Scenariile

| Parametru | An bun | An mediu | An slab (secetă) |
|---|---|---|---|
| Subvenția | max | probabil | min |
| Data soldului APIA | 1 dec | mijlocul ferestrei | 30 iun |
| Producția (t/ha) | max | medie | min (sau media celor mai slabi ani din județ, când avem date INS) |
| Prețul (lei/kg) | max | mediu | mediu |
| Costurile | min | medii | max |

Prețul în anul de secetă rămâne „mediu”, nu „min”. Când producția scade la nivel național, prețul tinde să nu scadă. E o presupunere, notată în open questions.

**Venitul pe cultură** = `ha × producție × 1000 × preț`. Pentru Ion (8 ha grâu, 7 ha porumb):

| | Bun | Mediu | Secetă |
|---|---|---|---|
| Grâu | 8 × 6 t × 1,20 = 57.600 | 8 × 5 t × 1,05 = 42.000 | 8 × 4 t × 1,05 = 33.600 |
| Porumb | 7 × 8 t × 1,10 = 61.600 | 7 × 6,5 t × 0,95 = 43.225 | 7 × 5 t × 0,95 = 33.250 |
| Subvenție (lei) | ≈ 17.060 | 16.869,60 | ≈ 15.180 |
| **Total venit** | ≈ 136.260 | 102.094,60 | ≈ 82.030 |

### Fondul de risc
```
țintă_fond = venit_mediu − venit_secetă      // pentru Ion ≈ 20.000 lei
contribuție = 10% din fiecare încasare, până se atinge ținta   (presupunere de produs, editabilă)
p_an_prost = ani_proști / ani_istoric        // din INS pe județ și cultură; DE-VERIFICAT
an_prost  ⇔ producția județului < 80% din media pe 10 ani   (prag = presupunere)
```

Mesajul din UI: „În Teleorman, la porumb, {k} din 10 ani au fost proști. Ca să treci de un an prost, îți trebuie cam 20.000 lei deoparte.”

## 6. Motorul de reguli pentru subvenții

- Datele (scheme, cuantumuri, reguli) stau **doar** în `docs/data/subsidies-2026.json`, validate la încărcare cu Zod.
- Eligibilitatea e formată din funcții pure: `evaluateRule(rule, profile)`, `checkEligibility(scheme, profile)`. Regulile declarative sunt `{field, op, value}` și `{if, then}`.
- Fiecare rezultat poartă `unverified[]` (regulile cu status `DE-VERIFICAT` pe care le-a folosit), ca UI-ul să poată fi cinstit.
- Detaliile sunt în `03-subsidies.md`.

## 7. Endpoint-uri API (schiță)

| Metodă | Ruta | Ce face |
|---|---|---|
| POST | `/api/farmers` | onboarding: creează Farmer, Parcels, contul Stripe conectat și ExpectedPayments |
| GET | `/api/farmers/:id/subsidies` | intervalul de subvenție |
| GET | `/api/farmers/:id/plan?scenario=medium` | calendarul, salariul, `bindingMonth` și creditul de punte |
| POST | `/api/farmers/:id/allocations` | confirmă împărțirea unei încasări pe plicuri |
| POST | `/api/farmers/:id/pension` | creează PensionPlan și subscription-ul |
| POST | `/api/demo/simulate-apia-advance` | plată de test și transfer către contul conectat |
| POST | `/api/demo/advance-clock` | avansează Test Clock-ul (vezi `08-stripe.md`) |
| POST | `/api/webhooks/stripe` | webhooks (platformă și Connect) |

Toate rutele în afară de webhooks cer header-ul `Authorization: Bearer <JWT Supabase>`. API-ul verifică token-ul și scoate `user_id` din el.

## 8. Offline

**Principiul:** aplicația se deschide și funcționează **fără net, oricât timp**, pentru tot ce se poate calcula pe telefon. Ce depinde de lumea din afară (bani noi, Stripe, AI) cere net, iar UI-ul o spune clar.

### Unde stau datele
- **Supabase e singura sursă de adevăr.** Toate datele fermierului sunt acolo.
- **Telefonul ține doar o copie (cache)** a datelor **fermierului logat**, în IndexedDB, nu ale altora. E același principiu ca la WhatsApp sau la aplicația băncii, care îți arată ultimele mesaje sau ultimul sold fără net.
- **La logout, cache-ul se șterge complet** (IndexedDB + outbox).
- Dacă se pierde copia de pe telefon, nu se pierde nimic: la următoarea conectare se descarcă din nou din Supabase.

### Cum funcționează
1. **Aplicația:** service worker-ul (`vite-plugin-pwa`) pune în cache HTML, JS, CSS, fonturile, iconițele și **JSON-urile din `docs/data/`**, care sunt incluse în build.
2. **Datele fermierului:** fiecare răspuns de la API (profil, plăți așteptate, plicuri, tranzacții, plan) e salvat în IndexedDB, cu TanStack Query persistat și `networkMode: 'offlineFirst'`. La deschidere se afișează imediat ultima versiune, apoi se actualizează dacă e net.
3. **Calculele rulează pe telefon:** motorul de subvenții, netezirea, scenariile și pensia sunt în `packages/shared`, adică funcții pure importate și în frontend. Offline poți schimba scenariul sau slider-ul de pensie și vezi rezultatul imediat.
4. **Scrierile mărunte** (sarcină „Am făcut”, o intrare la motorină) intră într-o **outbox** în IndexedDB și se trimit automat când revine netul. Există un singur utilizator pe cont, deci nu apar conflicte reale. Regula: câștigă ultima scriere.
5. **Tot ce mișcă bani** (confirmarea plicurilor, pornirea pensiei, simularea avansului, avansarea timpului) **cere net**. Nu punem bani în coadă.

### Ce merge și ce nu

| Feature | Offline | Mesajul, când nu merge |
|---|---|---|
| Ecranele Bani, Calendar, Îmi ajung?, De făcut (citire) | ✅ cu ultimele date | banner: „Fără internet. Datele sunt din {data}.” |
| Scenarii, toggle-ul de secetă, slider-ul de pensie, prognoza | ✅ calculate local | — |
| Subvenția recalculată după o schimbare de hectare | ✅ calculată local; salvarea merge în outbox | — |
| Sarcini „Am făcut”, intrări la motorină | ✅ prin outbox | „Se trimite când ai internet.” |
| Login (prima dată) | ❌ | „Pornește internetul ca să intri în cont.” |
| Confirmarea împărțirii pe plicuri | ❌ | „Pornește internetul ca să muți banii.” |
| Pornirea sau modificarea pensiei | ❌ | „Pornește internetul ca să pornești pensia.” |
| Încărcarea PDF-ului APIA (AI) | ❌ | „Pornește internetul ca să citim hârtia de la APIA.” |
| Radarul de fonduri, vremea, actualizarea prețurilor | ❌ (se arată ultima versiune) | „Pornește internetul ca să vezi ce e nou.” |
| Demo: simularea avansului, „Dăm timpul înainte” | ❌ | — |

Componenta `<NeedsInternet feature="...">` înfășoară butoanele care cer net: le dezactivează și arată mesajul din `ro.json`. Starea online combină `navigator.onLine` cu un ping eșuat la `/api/health`. `navigator.onLine` singur minte, de exemplu când telefonul e conectat la WiFi fără internet.

### Cât timp poate merge offline? (răspunsul pentru juriu)
- **Nelimitat, pentru citire și calcule.** Aplicația, regulile și datele fermierului sunt pe telefon.
- **Sesiunea de login nu expiră offline.** Token-ul Supabase (JWT) expiră după ~1 h, dar offline nu îl invalidăm, ci păstrăm sesiunea locală. Când revine netul, supabase-js îl reîmprospătează cu refresh token-ul. Dacă nici refresh-ul nu mai e valid, utilizatorul trebuie să se logheze din nou.
- **Ce se învechește sunt datele din afară:** banii intrați între timp, plățile APIA și sumele confirmate. După **7 zile** fără sincronizare, banner-ul devine galben: „Datele au mai mult de o săptămână. Cifrele pot fi depășite.”
- **Riscul ca telefonul să șteargă cache-ul:** cerem `navigator.storage.persist()`. O aplicație instalată pe ecranul principal e păstrată de browser. În tab-ul de browser, iOS poate șterge datele după 7 zile de nefolosire. Dacă se întâmplă, la următoarea conectare totul se descarcă din nou din Supabase, deci nu se pierde nimic.
- **Securitatea:** datele stau pe telefon, deci cine are telefonul deblocat le vede. Un PIN în aplicație e în roadmap.

## 9. Login și aplicația pe telefon

- **Auth:** Supabase Auth cu **email + parolă**. Magic link-ul e incomod în PWA, pentru că linkul se deschide în browser, nu în aplicația instalată. Login-ul cu telefon (SMS OTP) e mai potrivit pentru fermieri, dar cere un furnizor de SMS plătit. E în roadmap.
- **Pe telefon:** PWA instalabil („Adaugă pe ecranul principal”), cu manifest, iconițe și ecran de pornire. Merge pe Android și iOS fără magazin de aplicații. Dacă vrem în Play Store sau App Store, același cod se împachetează cu Capacitor (vezi open questions).
- **Contul demo:** `ion@cropcash.demo`, creat de `npm run seed:demo`.

## 10. Deploy

| Componentă | Unde | Detalii |
|---|---|---|
| Frontend (PWA) | Netlify | build din `apps/web`, SPA fallback (`/* /index.html 200`), variabile `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` |
| API | VPS RareCloud | Node 20+ sub `pm2` (sau Docker), **Caddy** ca reverse proxy cu HTTPS automat (Let's Encrypt), pe un (sub)domeniu, de exemplu `api.cropcash.ro` |
| DB + Auth | Supabase cloud | migrațiile din `supabase/migrations/` |

**De ce HTTPS pe VPS e obligatoriu:** Netlify servește pe HTTPS, iar browserul blochează apelurile de la o pagină HTTPS către un API HTTP (mixed content). Și webhooks-urile Stripe cer un endpoint HTTPS. Avem nevoie de un domeniu sau subdomeniu care să pointeze spre IP-ul VPS-ului.

**CORS:** API-ul acceptă doar originea Netlify și `localhost:5173`.
