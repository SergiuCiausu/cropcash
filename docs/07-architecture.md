# 07. Arhitectura

## 1. Stack-ul și de ce

| Strat | Tehnologie | De ce |
|---|---|---|
| Frontend | `web/`: Next.js cu export static, ca PWA. Paginile aplicației sunt componente React (`web/components/pages/`), care citesc ferma din `web/lib/cc` prin hook-uri. Doar landing-ul mai pornește din scripturi (`web/legacy/`, prin `web/lib/boot.ts`). Logica vine din `packages/shared`, importată ca modul | Un singur front-end, servit ca fișiere statice, care merge offline. `farm-app` și `apps/web` (prima interfață, React + Vite) au fost scoase pe 8 nov 2026. |
| Backend | Node.js + Express + TypeScript | Aceeași limbă ca frontend-ul, așa că logica (subvenții, netezire) e partajată. |
| DB și auth | Supabase (Postgres) | Auth și Postgres gata făcute, fără ops, cu un tier gratuit suficient pentru demo. |
| Plăți | Stripe, **doar în test mode** | Connect, payouts, subscriptions și Test Clocks acoperă tot flow-ul banilor (challenge-ul e Stripe). |
| AI | Claude API + Zod | Asistentul din aplicație și extragere structurată din PDF-uri APIA și din paginile AFIR/MADR, validată strict. |
| Notificări | Web Push din API, prin service worker-ul PWA | Aplicația vorbește prima, fără magazin de aplicații. |
| Date externe | Open-Meteo, CSV-uri INS în `docs/data/` | Open-Meteo e gratuit și fără cheie doar pentru uz necomercial; aplicațiile cu abonamente intră la uz comercial, deci la lansare trecem pe plan plătit sau pe instanță proprie (`open-meteo-vps-setup.md`). INS nu are un API comod, așa că pregătim datele offline. |
| Deploy | Netlify (front), **VPS pe RareCloud** (API), Supabase (DB + auth, cloud) | Netlify servește PWA-ul static. Pe VPS rulează un proces Node permanent (webhooks, scheduler, job-uri), sub control complet. |
| Offline | Service worker-ul `web/out/sw.js` + copii în localStorage (fermă, oportunități, outbox) | Aplicația se deschide și arată ultimele date fără net. Detalii în §8. |
| Teste | Vitest | Nativ cu Vite și rapid. Obligatoriu pentru motorul de subvenții și netezire. |

## 2. Structura de foldere (monorepo cu npm workspaces)

```
cropcash/
├── web/                      Next.js PWA (export static în web/out)
│   ├── app/                  o rută pe pagină: acasa, subventii, calendar, recolte, prognoza, salariu, pensie, bani, …
│   ├── legacy/               scripturile landing-ului (shared.js, landing.js, charts.js)
│   ├── lib/                  cc/ (ferma, cadrul, net, outbox), live/ (auth, client API, funcții, service worker), boot.ts (landing)
│   ├── styles/, public/      CSS-ul global, manifest, iconițe, imagini
│   └── scripts/              write-sw.mjs (service worker după build), make-icons.mjs
├── apps/
│   └── api/                  Express
│       └── src/
│           ├── routes/       farmers, plan, records, functions, assistant, documents, money, sources, weather
│           ├── stripe/       Connect, payouts, subscriptions, Test Clocks
│           ├── ai/           assistant (bucla cu unelte), documents (citirea hârtiilor) — Claude + Zod
│           └── db/           client Supabase, queries
│   (jobs/ pentru notificări și radarul de fonduri: pasul 9f și 10c, nefăcute)
├── packages/
│   └── shared/               LOGICĂ PURĂ, fără I/O, testată
│       └── src/
│           ├── data/         loader + tipuri Zod pentru docs/data/*.json
│           ├── money/        tipuri Cents/Bani, rotunjiri
│           ├── subsidies/    motorul de reguli (03-subsidies.md)
│           ├── cashflow/     calendarul banilor, netezirea, scenariile
│           └── pension/      simularea pensiei
├── supabase/migrations/      schema SQL
└── docs/
```

**Regula:** `packages/shared` nu face I/O și nu are cifre hardcodate. Primește datele (JSON-urile din `docs/data/`) ca parametri. Frontend-ul și backend-ul importă aceleași funcții.

## 3. Modelul de date

| Entitate | Câmpuri principale | Relații |
|---|---|---|
| `Farmer` (= o fermă) | id, user_id (proprietarul; `transfer_farm` îl mută), client_id, name, birth_year, county, stripe_account_id, stripe_customer_id, test_clock_id, start_balance_bani, created_at | 1–N FarmMember, Parcel, ExpectedPayment, Envelope, Transaction, Payout, FuelLog; 0–1 PensionPlan |
| `FarmMember` (035, 040) | id, farmer_id, user_id, role (owner, manager, worker, accountant, viewer), employee_id?, created_at | N–1 Farmer, N–1 cont; 0–1 Employee (omul din lista de salarii). **Accesul vine de aici**, nu din `farmers.user_id` (`docs/workspaces-plan.md`) |
| `Profile` (035) | user_id, last_farm_id? | 1–1 cont. Ferma deschisă ultima dată, pentru următoarea intrare |
| `FarmInvite` (028, 040) | id, farmer_id, role, code_hash, invited_by, expires_at | link de invitație pentru orice rol în afară de proprietar |
| `Parcel` | id, farmer_id, crop_id, area_ari (sutimi de ha), is_arable, unproductive_ari | N–1 Farmer, N–1 Crop. De la migrarea 020 e **totalul pe cultură** din anul de recoltă al planului: e mereu suma `PlotSeason` din anul ăla (vezi mai jos) |
| `Plot` (parcelă = o bucată de pământ, 020) | id, farmer_id, name?, county, siruta?, village_siruta?, bloc_fizic?, parcel_no?, lpis_fbid?, land_use?, geometry (GeoJSON)?, shape (desenul)?, centroid, geometry_source (lpis/drawn/coords/approx/none), auto_crop_id?, archived_at? | N–1 Farmer, 1–N PlotSeason, PlotOperation, Transaction |
| `PlotSeason` (020) | plot_id, harvest_year (= anul campaniei APIA), crop_id?, apia_crop_code?, area_ari, sown_on?, harvested_on?, second_crop_id? | N–1 Plot. Istoricul pe ani al aceleiași bucăți de pământ |
| `PlotOperation` (020) | id, plot_id, harvest_year, kind (soil_work, sowing, fertilizing, herbicide, fungicide, insecticide, irrigation, harvest, other), status (done/planned), on_date?, product?, dose?, transaction_id?, template_id? | N–1 Plot, 0–1 Transaction |
| `Crop` | id ('grau', 'porumb', 'floarea-soarelui'), name_ro | date de referință din `crops-reference.json` (nu se ține în DB) |
| `SubsidyScheme` | code, name_ro, unit, amount_eur, fund, ... | din `subsidies-2026.json` (nu se ține în DB) |
| `ExpectedPayment` | id, farmer_id, kind (apia_advance, apia_balance, crop_sale, fuel_refund, credit, other_in, input_cost, rent, loan_repayment, tax, other_out), direction (in/out), amount_min_bani, amount_probable_bani, amount_max_bani, window_start, window_end, scheme_code?, status (planned/received/cancelled) | N–1 Farmer |
| `Envelope` | id, farmer_id, kind (spring_inputs, debts, salary, pension), balance_bani, target_bani? | N–1 Farmer, 1–N Transaction |
| `Transaction` | id, farmer_id, envelope_id?, amount_bani (+/−), occurred_at, source (stripe_transfer, payout, manual, allocation), stripe_object_id?, expected_payment_id? | N–1 Farmer, N–1 Envelope |
| `Payout` | id, farmer_id, amount_bani, scheduled_for (date), stripe_payout_id?, status (scheduled/pending/paid/failed) | N–1 Farmer |
| `PensionPlan` | id, farmer_id, monthly_bani, vehicle (pilon3/cei_s/cei_d), stripe_subscription_id, started_at, status | 1–1 Farmer |
| `FuelLog` | id, farmer_id, date, liters, invoice_no, supplier, parcel_id?, quarter | N–1 Farmer |
| `FarmExciseScheme` (`farm_excise_schemes`, 052) | farmer_id, scheme_id, year, status (interested, acord_filed, approved, left), acord_on?, updated_at | N–1 Farmer. La ce scheme de acciză s-a înscris ferma, pe an. Schemele stau în `excise-schemes.json` (nu în DB). Fără ștergere: „left” ține locul. `acord_on` doar cu acord depus sau primit. Contabilul doar citește (`docs/accize-plan.md`) |
| `source_changes`, `documents` (monitorul) | ce s-a schimbat pe o pagină oficială; pasaje pentru căutare | scrise doar de `subventii-monitor`; aplicația le citește |
| `opportunity_follows` | farmer_id, stable_key | finanțările puse de fermier în calendar |
| `opportunities` (monitorul) | stable_key, kind (afir/mipe/ec), programme, title, status, open_date, deadline, budget_eur, applicants, relevance, confidence, url | scrise doar de `subventii-monitor` cu cheia secretă. Tabelul vechi `funding_opportunities` a fost scos (migrarea 008). |

Banii se țin în **bani, ca numere întregi** (`bigint`), niciodată ca float.

**Parcele și culturi (020, `docs/harta-plan.md`).** Fermierul se gândește pe bucăți de pământ, planul de bani pe culturi. Hectarele unei culturi care nu sunt încă pe hartă stau pe o singură parcelă „fără loc” a culturii (`auto_crop_id`). Când fermierul schimbă hectarele pe cultură (onboarding, „Date plan”), se mută doar hectarele fără loc; un total mai mic decât ce e deja pe hartă e refuzat. Când pune o parcelă pe hartă (`save_plots`), hectarele ei se iau întâi din cele fără loc, iar `parcels` se rescrie din sezoane. Aceleași reguli sunt în `packages/shared/src/plots/totals.ts`, pentru ferma lui Ion și offline. O cheltuială sau o vânzare poate avea `plot_id`; fără el, se împarte pe suprafață între parcelele culturii (sau ale fermei). Cheia `(plot_id, farmer_id)` refuză parcela altei ferme. Parcelele, sezoanele și lucrările nu sunt în `/api/me`: vin din `GET /api/plots`, iar telefonul ține ultimul răspuns (`cropcash-plots`). Ferma lui Ion își face parcelele pe telefon, pe blocurile ei reale din LPIS, cu lucrările de demo din `demo-ion.json` (`plot_work`); `seed:demo` le pune la fel în contul de demo.

**Locuri și blocuri de referință (034, `docs/harta-plan.md` pasul 1b).** Satele și comunele din Teleorman și Constanța (SIRUTA s1 2026 de la INS, punctele satelor din OpenStreetMap) stau în `docs/data/siruta-tr-ct.json`, care vine cu aplicația: fișa parcelei spune „satul Măldăeni, comuna Măldăeni” și fără net. Copia blocurilor din LPIS (`lpis_blocs`, `siruta_units`, PostGIS) e citită de API înaintea APIA (`apps/api/src/lpis/db.ts`); cât timp copia e goală sau migrația nu e aplicată, răspunde APIA. Copia se umple doar cu `npm run geo:import`, deocamdată numai într-o bază de test (întrebarea 1 din plan, condițiile APIA).

**Plățile planificate se calculează, nu se salvează** (decizie la pasul 4). Calendarul (`buildTimeline` din `packages/shared/src/cashflow`) se generează din fermă, subvenții și `docs/data`, direct pe telefon. Așa merge și offline și nu rămâne nimic învechit în baza de date când se schimbă JSON-urile. În `expected_payments` intră doar ce nu se poate calcula: creditul declarat de fermier (pasul 5) și plățile primite efectiv (pasul 6, din webhooks).

**Calendarul pe scurt:** cheltuielile și vânzările se repetă în fiecare an, pe lunile din `crops-reference.json`, pe 15 ale lunii. Plățile APIA folosesc ferestrele din `calendar-2026.json`; pentru anii următori, datele sunt proiectate cu +1 an și marcate „estimat”. „Lunile grele” sunt șirul de luni pe minus care se termină în punctul cel mai de jos al soldului, deci se calculează, nu se scriu de mână. Pentru Ion ies martie – mai.

**Banii înapoi pe motorină (`docs/accize-plan.md`).** Doar acciza pe care statul o dă înapoi e venit; scutirile doar scad o cheltuială. Când ferma are acordul primit (`farm_excise_schemes`, status `approved`), `exciseRefundClaims` (`packages/shared/src/cashflow/excise.ts`) pune în calendar o intrare `excise_refund` pe trimestru, **doar din litrii deja notați** la cheltuieli, cu cota din `fuel-excise.json` din ziua cumpărării și plafonul pe hectar. Plata cade la sfârșitul trimestrului plus `payment_lag_months` (DE-VERIFICAT, deci intrarea e `unverified`). Pentru trimestrele viitoare nu se estimează nimic.

### Schema SQL (Supabase)

```sql
create type payment_kind as enum ('apia_advance','apia_balance','crop_sale','fuel_refund','credit','other_in',
  'input_cost','rent','loan_repayment','tax','other_out');
create type envelope_kind as enum ('spring_inputs','debts','salary','risk_fund','pension');
-- 'risk_fund' a rămas în enum de la fondul pentru ani proști, scos pe 7 nov 2026. Codul nu-l mai folosește.

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

-- RLS (de la 035; schița de mai sus e cea de la început): accesul vine din farm_members.
--   my_farm_ids(roles)   fermele mele, eventual doar cu anumite roluri
--   my_farmer_ids()      fermele unde sunt proprietar sau administrator: ele văd tabelele fermei
--   require_farm_role(p_farm, roles)   prima linie a fiecărei funcții care primește ferma
create policy farmers_team_read on farmers for select using (id in (select my_farmer_ids()));
-- aceeași regulă pe celelalte tabele: farmer_id in (select my_farmer_ids())
-- lucrătorul (042) citește doar parcelele, lucrările și motorina notată de el; contabilul, rapoartele (/contabil)
```

**O persoană, mai multe ferme; o fermă, mai mulți oameni** (`docs/workspaces-plan.md`, pașii 1–8). Nicio funcție și
nicio politică nu mai caută „ferma mea” după `farmers.user_id = auth.uid()` (pasul 8, `043` a scos ultimele
semnături vechi). Ferma vine din cerere: header-ul `X-Farm-Id` în API, `p_farmer_id` în funcțiile SQL. Ce mai citește
`user_id = auth.uid()` e propriul rând al cuiva: `farmers_own` (proprietarul își vede ferma, și o poate crea înainte
să existe rândul lui din `farm_members`), `farm_members_self`, `profiles`, `app_roles`. Fiecare rând din
`transactions`, `fuel_logs`, `farm_events`, `plot_operations` și `task_completions` ține `created_by`, pus de baza
de date, nu de cine scrie (042).

## 4. Algoritmul de netezire (salariul lunar)

### Intrări
- `B0`: soldul de start (în bani);
- `months[1..H]`: lunile de la luna curentă până la orizont. **Orizontul** e luna dinaintea următoarei încasări mari și sigure (de exemplu, următorul avans APIA sau următoarea recoltă principală). Implicit H ≤ 15;
- pentru fiecare lună m: `in[m]` și `out[m]`, din `ExpectedPayment`, în scenariul ales (vezi secțiunea 5);
- `fixed[m]`: alocările planificate (pensia lunară).

### Ieșire
- `S`: salariul lunar maxim, constant, pentru care soldul la sfârșitul fiecărei luni rămâne ≥ 0;
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
| Plata unui salariu într-o lună fără încasări | se plătește suma de luna trecută. Scade doar dacă altfel banii nu ajung |
| Încasarea e mai mică decât minimul | se recalculează imediat și se trimite notificare: „Am scăzut salariul la X lei ca să-ți ajungă până în {lună}.” |
| Salariul deja plătit în luna curentă | e inclus în `out` pentru luna curentă și nu se mai plătește o dată |
| Rotunjirea | `S` se rotunjește în jos la 50 de lei, creditul se rotunjește în sus la 100 de lei |
| H = 0 | `S = 0` și o eroare de configurare (nu ar trebui să se întâmple) |

### Exemplu numeric (Ion, scenariul mediu, orizont noiembrie 2026 – septembrie 2027, H = 11)

**Presupuneri de demo:** exemplul folosește cursul provizoriu de 5,28 lei/€, ca să rămână ușor de urmărit (aplicația folosește 5,2788). Soldul la 1 noiembrie 2026 e de 35.000 lei, după vânzarea porumbului. Cheltuielile sunt costurile medii din `crops-reference.json` (grâu 8 × 4.250 = 34.000 lei, porumb 7 × 5.000 = 35.000 lei), pe lunile de acolo. Pensia e de 200 lei/lună.

| Lună | Intră | Iese | Cumulat (fără salariu) | Plafon = cumulat / m |
|---|---|---|---|---|
| Noi | avans 12.652,20 | 200 | 47.452,20 | 47.452 |
| Dec | — | 200 | 47.252,20 | 23.626 |
| Ian | — | 200 | 47.052,20 | 15.684 |
| Feb | — | 200 | 46.852,20 | 11.713 |
| Mar | sold 4.217,40 | 13.750 + 200 | 37.119,60 | 7.424 |
| Apr | — | 20.850 + 200 | 16.069,60 | 2.678 |
| Mai | — | 5.250 + 200 | 10.619,60 | 1.517 |
| **Iun** | — | 3.500 + 200 | **6.919,60** | **865** ← limitează |
| Iul | grâu 42.000 | 5.100 + 200 | 43.619,60 | 4.847 |
| Aug | — | 200 | 43.419,60 | 4.342 |
| Sep | — | 5.100 + 200 | 38.119,60 | 3.465 |

- **Fără credit:** S = **850 lei/lună**, limitat de iunie.
- **Cu ținta de 2.400 lei/lună:** `bridgeCreditNeeded` dă **12.300 lei**, luați în mai. Asta e sub 90% din subvenția estimată pentru 2027, deci încape în creditul pe adeverință. La sfârșitul lui septembrie rămân ~24.000 lei, care acoperă cheltuielile din octombrie. Creditul se întoarce din avansul următor.
- **Mesajul pentru pitch:** „CropCash nu te scapă de credit. Îți spune din noiembrie de cât credit ai nevoie și când, ca să ai 2.400 lei în fiecare lună.”

### Ce e implementat (pasul 5, `packages/shared/src/cashflow/smoothing.ts`)
- `maxSafeSalary`, `bridgeCreditNeeded` și `suggestCredit` sunt funcții pure, cu teste. Exemplul de mai sus iese exact: **850 lei** fără credit, **12.300 lei** din mai pentru 2.400 lei pe lună.
- **Creditul sugerat (`suggestCredit`)** respectă patru reguli:
  1. e cel mult `max_pct_of_subsidy` (90%) din subvenția probabilă, **minus creditele deja declarate** (aceeași adeverință), inclusiv după rotunjire;
  2. există abia din luna în care se deschide următoarea cerere APIA (martie), pentru că adeverința se eliberează după depunerea cererii;
  3. se propune doar dacă există luni grele și salariul e limitat de o lună de dinaintea finalului planului;
  4. pentru Ion, sugestia automată e 15.100 lei pentru 2.750 lei pe lună în exemplul din docs (orizont de 11 luni, pensie 200 lei).
- **În aplicație** (12 luni, plăți APIA în ultima zi, fără pensie până la pasul 7), Ion are **1.050 lei** fără credit și **2.950 lei** cu un credit de 15.100 lei în aprilie.
- **Fără fond pentru ani proști** (scos pe 7 nov 2026): nimic din încasări nu se mai pune deoparte pentru un an slab, așa că salariul crește cu cât mergea în fond (pentru Ion, cu 200 lei pe lună).
- **Plicurile:** `proposeAllocation` împarte suma în ordinea datorii → pensie și salariu pentru lunile acoperite → restul pentru cheltuielile fermei. Salvarea trece prin funcția SQL `set_envelopes`, care refuză suma dacă depășește banii pe care îi are fermierul.

### Creditul în aplicație (decizie: varianta A + C)
- **A, informativ:** dacă `S < S_target`, UI-ul arată: „Ca să ai {S_target} lei pe lună, o să ai nevoie de ~{amount} lei în {lună}. Fermierii iau de obicei credit pe adeverința APIA.” Fără bănci numite și fără link-uri către oferte. Ținta implicită `S_target` = media surplusului pe orizont (`cum_H / H`), rotunjită în jos la 50 de lei. Fermierul o poate modifica.
- **C, creditul declarat de fermier:** pe ecranul „Îmi ajung?”, butonul „Iau un credit” deschide un formular cu suma, luna și luna rambursării. Creditul devine două `ExpectedPayment`: `credit` (in) și `loan_repayment` (out). Netezirea îl include automat.
- Fără un credit declarat, salariul afișat e întotdeauna cel sigur fără credit (850 lei pentru Ion, cu pensia de 200 lei). Varianta A apare doar ca sugestie.

## 5. Scenariile

| Parametru | An bun | An mediu | An slab (secetă) |
|---|---|---|---|
| Subvenția | max | probabil | min |
| Data soldului APIA | ultima zi | ultima zi | ultima zi |
| Producția (t/ha) | media celor mai buni 3 ani din ultimii 15 în județ | mediana ultimilor 15 ani în județ | media celor mai slabi 3 ani din ultimii 15 în județ |
| Prețul (lei/kg) | mediu | mediu | mediu |
| Costurile | medii | medii | medii |

Un fel de an e definit de recoltă, din istoricul INS al județului (AGR110A, `cashflow/county-yields.ts`, parametrii în `plan-params.json` → `yield_history`). Un județ cu prea puține recolte raportate folosește media pe țară, iar producția notată de fermier devine anul normal, cu același raport pentru anul slab și cel bun. Prețul și costurile nu se schimbă de la un fel de an la altul (P4). Un an slab se simte în primăvara de după: `afterBadHarvest` (24 de luni) arată punctul cel mai de jos și salariul care ține.

**Ce nu ajunge la recoltă** (`docs/crop-loss-plan.md`). Fermierul spune, pe cultură și pe recoltă, câte hectare n-a putut strânge (`harvests.years[].parcels[].lost`, cu motivul și luna). Un răspuns lipsă înseamnă „nu știm”, iar 0 e un răspuns. Vânzarea se socotește pe hectarele recoltate (`semănate × (1 − cota)`), iar costurile rămân pe tot ce s-a semănat. Cota vine, în ordine, din pierderea deja spusă pentru recolta aceea, din procentul scris de fermier în Datele planului (`expected.lossPct`) și din istoric: Σ pierdute ÷ Σ semănate pe ultimele `window_years` recolte cu răspuns, de la `min_years` în sus (`plan-params.json` → `crop_loss`, alegeri de produs). E aceeași în anul slab, normal și bun, pentru că anul slab din INS e deja un an de secetă. Procentul fermierului și istoricul se scad doar când producția e a fermierului: media județului poate număra deja câmpurile pierdute (P33). Producția notată în Recolte e pe hectarul recoltat. Totul e socotit pe telefon (`farm/crop-loss.ts`, `farmLoss` în `cashflow/farm-plan.ts`), deci merge offline.

**Venitul pe cultură** = `ha × producție × 1000 × preț`. Pentru Ion (8 ha grâu, 7 ha porumb):

| | Bun | Mediu | Secetă |
|---|---|---|---|
| Grâu | 8 × 5,026 t × 1,05 = 42.218 | 8 × 4,308 t × 1,05 = 36.187 | 8 × 2,974 t × 1,05 = 24.981 |
| Porumb | 7 × 7,09 t × 0,95 = 47.149 | 7 × 4,005 t × 0,95 = 26.633 | 7 × 1,469 t × 0,95 = 9.769 |
| Subvenție (lei) | ≈ 17.058 | ≈ 16.866 | ≈ 15.179 |
| **Total venit** | 106.425 | 79.686 | 49.929 |

### Anul slab, fără fond
Fondul pentru ani proști a fost scos pe 7 nov 2026, la cererea echipei. Anul slab rămâne doar ca scenariu: Prognoză arată cât intră mai puțin decât într-un an normal și cu cât rămâne fermierul mai puțin la sfârșitul celor 12 luni (pentru Ion, 33.062 lei). Nimic nu se mai pune deoparte pentru el.

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
| POST | `/api/farmers/:id/pension` | creează PensionPlan și subscription-ul (în cod: `POST /api/pension`) |
| PUT | `/api/pension` | altă sumă lunară, de la următoarea plată |
| DELETE | `/api/pension` | oprește pensia; ce s-a plătit rămâne |
| POST | `/api/demo/simulate-apia-advance` | plată de test și transfer către contul conectat |
| POST | `/api/demo/advance` | avansează Test Clock-ul (vezi `08-stripe.md`) |
| GET | `/api/excise` | schemele de acciză ale fermei, pe ani |
| PUT | `/api/excise/:schemeId/:year` | status și `acord_on` pentru o schemă și un an (`set_excise_enrollment`). Refuză o schemă necunoscută (404), o propunere sau un an în afara schemei (409) |
| GET | `/api/weather` | prognoza pe 7 zile pentru județul fermei, din Open-Meteo, păstrată 3 ore pe județ |
| POST | `/api/assistant` | conversația (doar text) către asistent; întoarce răspunsul, sursele, cifrele neconfirmate și acțiunile de confirmat. Confirmarea e apăsarea fermierului, care trimite ruta obișnuită a funcției (§11) |
| POST | `/api/functions/:name` | rulează o funcție `read` din registru pe ferma fermierului |
| POST | `/api/documents/read` | citește o hârtie (poze sau PDF) cu Claude și întoarce câmpurile verificate, fără să salveze nimic. Merge și fără fermă, pentru onboarding |
| POST | `/api/notifications/subscriptions` | (pasul 9f, nefăcut) salvează abonamentul Web Push al telefonului |
| POST | `/api/webhooks/stripe` | webhooks (platformă și Connect) |

Toate rutele în afară de webhooks cer header-ul `Authorization: Bearer <JWT Supabase>`. API-ul verifică token-ul și scoate `user_id` din el. Ferma vine din header-ul `X-Farm-Id` (`pickFarm`, `apps/api/src/middleware/farm.ts`). Fără el, e singura fermă pe care o conduci; dacă ai mai multe, `409 farm_required`. `repo.getFarm(token, farmId)` o citește ca utilizatorul, deci RLS hotărăște dacă ai voie. Rolul îl dă `repo.myRole`, iar `/api/me` răspunde după rol (`farmViewFor`). Lucrătorul are rutele lui: `GET /api/worker`, `POST /api/worker/work/:id/done`, `POST /api/worker/fuel`; proprietarul și administratorii, `GET /api/farm/noted`.

**Hârtiile și datele personale (din 14 nov 2026).** AI-ul copiază doar ce e tipărit, iar codul face restul (`packages/shared/src/documents`). Dintr-o factură, o hârtie de vânzare sau o decizie nu se citesc nume, CNP, cont sau adresă. Din **cererea de plată** se citesc numele (câmpurile 01–02, sau 09–10 la PFA/II/firmă), CNP-ul (03 sau 11) și județul (26, altfel 15). Reguli:
- CNP-ul nu iese din API. `normalizeReading` verifică cifra de control, scoate din el vârsta la ziua citirii (P32) și îl aruncă. `DocumentReading` nu are câmp pentru CNP, iar testele verifică că nu apare în răspuns, în reluarea din `ReplayCache` sau în log.
- IBAN-ul, adresa, telefonul, e-mailul și împuternicitul nu se citesc deloc.
- Culturile se potrivesc după codul APIA din `crops-reference.json` (`apia_codes`). Doar un rând fără cod trece pe potrivirea AI-ului după nume.
- Telefonul primește numele, vârsta și județul și le pune în formular. Ce ajunge pe server e doar ce salvează fermierul, ca la scrisul de mână.

## 8. Offline

**Principiul:** aplicația se deschide și funcționează **fără net, oricât timp**, pentru tot ce se poate calcula pe telefon. Ce depinde de lumea din afară (bani noi, Stripe, AI) cere net, iar UI-ul o spune clar.

### Unde stau datele
- **Supabase e singura sursă de adevăr.** Toate datele fermierului sunt acolo.
- **Telefonul ține doar o copie (cache)** a datelor **fermierului logat**, în IndexedDB, nu ale altora. E același principiu ca la WhatsApp sau la aplicația băncii, care îți arată ultimele mesaje sau ultimul sold fără net.
- **La logout, cache-ul se șterge complet** (IndexedDB + outbox).
- Dacă se pierde copia de pe telefon, nu se pierde nimic: la următoarea conectare se descarcă din nou din Supabase.

### Cum funcționează
1. **Aplicația:** service worker-ul (`web/out/sw.js`, scris de `npm run build` prin `web/scripts/write-sw.mjs`) pune în cache paginile, JS, CSS, fonturile, manifestul, iconițele și **JSON-urile din `docs/data/`**, incluse în bundle. Copia fermei, a oportunităților și outbox-ul stau în localStorage, nu în IndexedDB, iar butoanele care cer net au `data-needs-net`, oprite de `web/legacy/app.js` (în loc de `<NeedsInternet>`). Punctele 2–4 de mai jos descriu planul inițial cu IndexedDB și TanStack Query; principiile (copie pe telefon, calcule locale, outbox, banii nu intră în coadă) sunt aceleași.
2. **Datele fermierului:** fiecare răspuns de la API (profil, plăți așteptate, plicuri, tranzacții, plan) e salvat în IndexedDB, cu TanStack Query persistat și `networkMode: 'offlineFirst'`. La deschidere se afișează imediat ultima versiune, apoi se actualizează dacă e net.
3. **Calculele rulează pe telefon:** motorul de subvenții, netezirea, scenariile și pensia sunt în `packages/shared`, adică funcții pure importate și în frontend. Offline poți schimba scenariul sau slider-ul de pensie și vezi rezultatul imediat.
4. **Scrierile mărunte** (sarcină „Am făcut”, o intrare la motorină) intră într-o **outbox** în IndexedDB și se trimit automat când revine netul. Regula: câștigă ultima scriere. Coada e una pentru toate fermele de pe telefon: fiecare înregistrare își ține ferma și pleacă la ea, oricare fermă e deschisă (`web/lib/live/outbox.ts`). Datele fiecărei ferme stau sub cheile ei, `cropcash-f-<id>-…` (`farmStore`, `web/lib/cc/storage.ts`). Lucrătorul are coada lui, la fel făcută (`cropcash-work-queue`, `web/lib/worker.ts`).
5. **Tot ce mișcă bani** (confirmarea plicurilor, pornirea pensiei, simularea avansului, avansarea timpului) **cere net**. Nu punem bani în coadă. Înregistrarea unei vânzări sau cheltuieli nu mută bani, doar notează ce s-a întâmplat, așa că intră în outbox (`docs/f4-screens.md`).
6. **Harta** (`docs/harta-plan.md`, pasul 11). Parcelele vin din copia de pe telefon (`cropcash-plots`), deci lista, cele două vederi, filtrele și cardurile merg fără net. Lucrările pe parcele (`add_operation`, `update_operation`) și desenul unei parcele (`update_plot`) intră în outbox, pentru că doar notează ce s-a făcut pe pământ. Pagina le arată imediat (`withPendingPlotWrites`), cu „se trimite când ai internet”, iar după trimitere parcelele se cer din nou. O lucrare încă în coadă, marcată apoi „făcut”, se schimbă direct în coadă. O lucrare notată offline odată cu o cheltuială nu e legată de ea, pentru că cheltuiala nu are încă id. Service worker-ul ține ultimele ~300 de bucăți din harta de bază (OpenFreeMap și relieful, cache-first, cele mai vechi pleacă primele; `plots-params.json` → `map_tile_cache_max`), deci zona fermei se vede de obicei și fără net. Stilul hărții vine întâi din rețea, apoi din copie. Satelitul nu se păstrează, ca să nu consume cota MapTiler. Fără bucăți de hartă, parcelele se desenează pe fundal gol, cu „Harta are nevoie de internet”. **Cu harta Google** (`VITE_GOOGLE_MAPS_KEY` + `VITE_GOOGLE_MAP_ID`, `docs/cerere-documents-google-map-plan.md` §8): service worker-ul nu atinge nimic de la Google (scriptul, bucățile de hartă, 3D, imaginile), pentru că termenii Google Maps Platform nu permit păstrarea lor. Pagina deschisă fără net, o cheie refuzată sau un script care nu se încarcă dau harta MapLibre de mai sus, deci parcelele se văd tot pe fundal gol sau pe bucățile OpenFreeMap păstrate.

### Când rețeaua merge prost

Detaliile, pe fiecare caz, sunt în `docs/failure-handling-plan.md`.

- **Timp limită la fiecare apel.** Valorile stau în `docs/data/plan-params.json`, blocul `network`. Clasele sunt citire, scriere, bani, deschiderea contului, butoanele de demo, asistent și hârtii. Un apel care nu primește răspuns se termină cu `timeout`.
- **Coada (outbox).** Are un proprietar, așa că intrarea din nou în același cont o păstrează, iar alt cont nu o trimite. Un 401, 408, 429 sau `busy` nu pierde nimic: se reîncearcă după 30 s, 2 min, 10 min, 30 min, cu o abatere de 20 %, și se respectă `Retry-After`. Un element e pus deoparte abia după 8 încercări și cel puțin 24 de ore.
- **Salvările de plan** (`save_harvests`, `update_farm`) pot aștepta în coadă, iar cea mai nouă o înlocuiește pe cea care așteaptă. Pleacă cu versiunea de pe care au pornit (`If-Match`), așa că nu suprascriu ce a salvat alt telefon. Cele care au expirat în timp nu intră în coadă, pentru că poate au ajuns deja pe server.
- **Bani cu răspuns pierdut.** Nu intră niciodată în coadă. Aplicația citește `/api/me` și vede ce s-a întâmplat: dacă s-a făcut, e gata; dacă nu, spune că nu s-au mutat bani; dacă nu poate citi, spune „Nu știm încă…” și butonul rămâne oprit până la următoarea deschidere.
- **O pagină care nu pornește** se reîncarcă o singură dată dacă îi lipsește codul, apoi arată un mesaj cu „Încearcă din nou”.
- **Service worker-ul** nu mai servește erori de la gazdă când are o copie bună, iar o poză care nu se descarcă nu îl mai oprește din instalare.

### Ce merge și ce nu

| Feature | Offline | Mesajul, când nu merge |
|---|---|---|
| Ecranele Bani, Calendar, Îmi ajung?, De făcut (citire) | ✅ cu ultimele date | banner: „Fără internet. Datele sunt din {data}.” |
| Scenarii, toggle-ul de secetă, slider-ul de pensie, prognoza | ✅ calculate local | — |
| Subvenția recalculată după o schimbare de hectare | ✅ calculată local; salvarea merge în outbox | — |
| Sarcini „Am făcut”, intrări la motorină | ✅ prin outbox | „Se trimite când ai internet.” |
| Vânzări și cheltuieli înregistrate, schimbarea datelor fermei și a planului | ✅ prin outbox; salariul apare „provizoriu” până se trimit | „Se trimite când ai internet.” |
| Harta (`/harta`, mini-harta): lista, vederile, filtrele, cardurile | ✅ din copia parcelelor de pe telefon; harta de bază din bucățile păstrate, altfel fundal gol | „Fără internet. Arătăm parcelele așa cum erau pe {data}.” / „Harta are nevoie de internet.” |
| Lucrări pe parcelă („Marchează făcut”, „Adaugă lucrare”, tratamentul de la o cheltuială) și desenul unei parcele | ✅ prin outbox, arătate imediat pe card | „se trimite când ai internet” |
| Satelitul, blocurile APIA pe hartă, căutarea blocului, citirea cererii APIA, salvarea parcelelor din cerere | ❌ (`NetButton`) | „Satelitul are nevoie de internet.” / „Blocurile APIA au nevoie de internet.” / „Fără internet nu putem căuta blocul…” |
| Login (prima dată) | ❌ | „Pornește internetul ca să intri în cont.” |
| O pagină a fermei, cu sesiune dar fără copia fermei pe telefon | ❌ | „Pornește internetul o dată.” Pagina pornește singură când revine netul. |
| Rapoartele PDF (`/rapoarte`) | ✅ făcute pe telefon din copia fermei; codul PDF și fontul sunt în service worker | — |
| Invitațiile (`/rapoarte` → „Cine mai vede rapoartele”, `/invitatie`) | ❌ cer internet (`NetButton`); nimic nu intră în coadă | — |
| Rapoartele contabilului (`/contabil`) | ✅ din ultima copie a fermei adusă pe telefonul lui (`cropcash-member-farm-<id>`) | lista fermelor și copia nouă cer internet |
| Ferma lui Ion (`/ferma-lui-ion/*`) | ✅ toată, calculată pe telefon. Ce schimbi rămâne doar pe acest dispozitiv | — |
| Skeletonul de încărcare | ✅ e în HTML-ul static, salvat de service worker | — |
| Confirmarea împărțirii pe plicuri | ❌ | „Pornește internetul ca să muți banii.” |
| Pornirea sau modificarea pensiei | ❌ | „Pornește internetul ca să pornești pensia.” |
| Încărcarea PDF-ului APIA (AI) | ❌ | „Pornește internetul ca să citim hârtia de la APIA.” |
| Radarul de fonduri, actualizarea prețurilor | ❌ (se arată ultima versiune) | „Pornește internetul ca să vezi ce e nou.” |
| Asistentul „Întreabă” | ❌ | „Pornește internetul ca să întrebi.” |
| Notificările | ✅ cardul „Mesaje” arată ultima listă salvată; mesajele noi cer net | — |
| Vremea | ✅ ultima prognoză salvată pe telefon, doar zilele rămase. Nu schimbă niciodată cifrele din plan | „Date din {data}. Pornește internetul ca să vezi ce e nou.” |
| Demo: simularea avansului, „Dăm timpul înainte” | ❌ | — |

Componenta `<NeedsInternet feature="...">` înfășoară butoanele care cer net: le dezactivează și arată mesajul din `ro.json`. Starea online combină `navigator.onLine` cu un ping eșuat la `/api/health`. `navigator.onLine` singur minte, de exemplu când telefonul e conectat la WiFi fără internet.

### Cât timp poate merge offline? (răspunsul pentru juriu)
- **Nelimitat, pentru citire și calcule.** Aplicația, regulile și datele fermierului sunt pe telefon.
- **Sesiunea de login nu expiră offline.** Token-ul Supabase (JWT) expiră după ~1 h, dar offline nu îl invalidăm, ci păstrăm sesiunea locală. Când revine netul, supabase-js îl reîmprospătează cu refresh token-ul. Dacă nici refresh-ul nu mai e valid, utilizatorul trebuie să se logheze din nou.
- **Ce se învechește sunt datele din afară:** banii intrați între timp, plățile APIA și sumele confirmate. După **7 zile** fără sincronizare, banner-ul devine galben: „Datele au mai mult de o săptămână. Cifrele pot fi depășite.”
- **Riscul ca telefonul să șteargă cache-ul:** cerem `navigator.storage.persist()`. O aplicație instalată pe ecranul principal e păstrată de browser. În tab-ul de browser, iOS poate șterge datele după 7 zile de nefolosire. Dacă se întâmplă, la următoarea conectare totul se descarcă din nou din Supabase, deci nu se pierde nimic.
- **Securitatea:** datele stau pe telefon, deci cine are telefonul deblocat le vede. Un PIN în aplicație e în roadmap.

## 9. Login și aplicația pe telefon

- **Verificarea în API:** token-urile Supabase sunt semnate ES256. API-ul le verifică local, cu cheile publice ale proiectului (JWKS, puse în cache de `jose`), fără un apel la Supabase pentru fiecare cerere. Apoi interoghează baza **ca utilizatorul respectiv** (cheia publică + token-ul lui), ca să se aplice RLS. Cheia secretă (`admin()`) e doar pentru webhooks, job-uri și seed.
- **RLS** e testat pe proiectul real cu `npm run test:integration`: doi utilizatori, izolare la citire și scriere, plus un token falsificat.
- **Auth:** Supabase Auth cu **email + parolă**. Magic link-ul e incomod în PWA, pentru că linkul se deschide în browser, nu în aplicația instalată. Login-ul cu telefon (SMS OTP) e mai potrivit pentru fermieri, dar cere un furnizor de SMS plătit. E în roadmap.
- **Pe telefon:** PWA instalabil („Adaugă pe ecranul principal”), cu manifest (`web/public/manifest.webmanifest`, pornește pe `/acasa`) și iconițe (`web/public/icons/`, făcute de `web/scripts/make-icons.mjs`). Merge pe Android și iOS fără magazin de aplicații. Dacă vrem în Play Store sau App Store, același cod se împachetează cu Capacitor (vezi open questions).
- **Contul demo:** `DEMO_EMAIL` din `.env` (`ion@cropcash.test` în `.env.example`), creat de `npm run seed:demo`. E contul cu Stripe real (test mode). Nu e același lucru cu ferma lui Ion de mai jos.

### Două locuri: ferma ta și ferma lui Ion
| | Ferma ta | Ferma lui Ion |
|---|---|---|
| **Adresa** | `/acasa`, `/salariu`, … | `/ferma-lui-ion/acasa`, `/ferma-lui-ion/salariu`, … (`/ferma-lui-ion` trimite la `acasa`) |
| **Cont** | obligatoriu | nu e nevoie, și rămâne Ion și pentru cine e logat |
| **Datele** | Supabase, cu copie pe telefon | `docs/data/demo-ion.json`, fără niciun apel la API |
| **Ce salvează** | cheile `cropcash-*` | cheile `cropcash-demo-*`, doar pe acest dispozitiv. „Pornește din nou” le șterge |
| **Bani** | Stripe (test mode) | exemplu calculat din planul lui Ion (`web/lib/demo-account.ts`). Nu se mută bani |

- **Un singur corp de pagină:** ecranele stau în `web/screens/<nume>.tsx`, iar `web/components/Screen.tsx` le desenează. `web/app/<nume>/page.tsx` și `web/app/ferma-lui-ion/[page]/page.tsx` doar aleg ecranul, ca cele două adrese să nu se despartă.
- **Modul se citește din adresă** (`web/lib/paths.ts`). Link-urile între pagini trec prin `appHref`, iar cheile salvate prin `storageKey`. O scanare din `web/lib/paths.test.ts` oprește un link care nu trece pe acolo.
- **Prima pagină** e pentru vizitatori: „Fă-ți cont”, „Intră în cont” și „Vezi ferma lui Ion”. Cine are deja sesiune pe telefon vede „Mergi la ferma ta”.

### Mai multe ferme și oamenii fermei
Un cont poate fi pe mai multe ferme, cu câte un rol pe fiecare (`docs/workspaces-plan.md`). Ferma deschisă stă în `cropcash-active-farm` și pleacă în `X-Farm-Id` la fiecare apel. Unde ajungi după login hotărăște `pickLanding` (`web/lib/live/farms.ts`):

| Contul | Unde ajunge |
|---|---|
| conduce o singură fermă (proprietar sau administrator), sau cea deschisă pe telefon e încă a lui | ferma, pe `/acasa` |
| conduce mai multe și nu e clar care | `/ferme`, alege |
| e doar lucrător | `/lucru`: ce e de făcut, „Am terminat”, motorina în litri. Fără bani. Merge offline cu ultima listă și cu coada lui |
| e doar contabil sau „doar vede” | `/contabil`, rapoartele |
| nu e pe nicio fermă | onboarding |

`/ferme`, `/lucru`, `/contabil` și `/invitatie` sunt pagini de cont: nu sunt în `SCREENS`, nu au geamăn pe ferma lui Ion și nu cer copia fermei. Proprietarul și administratorul invită pe `/oameni` („Cine folosește aplicația”), cu un link pentru WhatsApp; tot acolo văd „Ce au notat oamenii”.

### Paza de la intrare
`guardTarget` (`web/lib/live/auth.ts`) e o funcție pură, cu teste, care decide **înainte să pornească pagina**. O folosește `web/components/app/Guard.tsx`. Citește sesiunea și copia fermei din `localStorage`, deci merge și fără net.

| Situația | Ce se întâmplă |
|---|---|
| Ferma lui Ion, prima pagină, `/login` | se deschid pentru oricine |
| Fără sesiune | `/login?next=<pagina>`, iar după login te întoarce acolo. De pe `/onboarding`, simplu `/login` |
| Sesiune și copia fermei pe telefon | pagina pornește, și offline |
| Sesiune, fără copie, cu net | aduce ferma deschisă de la `/api/me`; dacă nu ai fermă încă, mergi la onboarding; dacă ai mai multe sau alt rol, unde spune tabelul de mai sus |
| Sesiune, fără copie, fără net | ecranul „Pornește internetul o dată” |
| Ferma nu se poate aduce | „Nu am putut aduce ferma”, cu „Încearcă din nou” |

Paza nu e securitate. Datele sunt apărate de API și RLS. Ea doar nu lasă o pagină să pornească fără fermă.

### Stările de încărcare
`loading.tsx` din Next nu ajută la un export static, pentru că nimic nu așteaptă pe server. Așa că:
- **Skeletonul** e în HTML-ul static (`web/components/skeleton/`, câte unul pe ecran în `screens.tsx`), deci apare înainte de orice script. Doar forme, fără cifre. Folosește clasele reale ale paginii, ca să nu sară nimic când dispare. Login-ul nu are, pentru că formularul lui e deja în HTML.
- **`markReady()`** (`web/lib/ui/ready.ts`) pune `data-ready` pe `<html>`, iar skeletonul dispare în 120 ms. Îl cheamă ecranul când ajunge ferma și paza când arată un card. Până atunci, skeletonul rămâne, inclusiv cât timp paza aduce ferma.
- **Dacă pagina nu pornește:** `web/app/error.tsx` arată „Pagina nu a pornit”, cu „Încearcă din nou” (`web/components/PageFailed.tsx`). Fără net, cardul spune că pagina nu e încă salvată pe telefon.
- **Înăuntrul paginii:** vremea și graficele își țin locul până vin. Fiecare se termină cu conținut sau cu un mesaj. Reîmprospătarea din fundal nu are skeleton, pentru că pe ecran e deja copia salvată.
- **Fără JavaScript** skeletonul nu apare, iar la „mișcare redusă” nu strălucește.

## 10. Deploy

| Componentă | Unde | Detalii |
|---|---|---|
| Frontend (PWA) | Netlify | build din `web/` (Next.js, export static în `web/out`, câte un `.html` pe pagină, fără SPA fallback), variabile `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `VITE_DEMO_MODE` |
| API | VPS RareCloud | Node 20+ sub `pm2` (sau Docker), **Caddy** ca reverse proxy cu HTTPS automat (Let's Encrypt), pe un (sub)domeniu, de exemplu `api.cropcash.ro` |
| DB + Auth | Supabase cloud | migrațiile din `supabase/migrations/` |

**De ce HTTPS pe VPS e obligatoriu:** Netlify servește pe HTTPS, iar browserul blochează apelurile de la o pagină HTTPS către un API HTTP (mixed content). Și webhooks-urile Stripe cer un endpoint HTTPS. Avem nevoie de un domeniu sau subdomeniu care să pointeze spre IP-ul VPS-ului.

**CORS:** API-ul acceptă doar originea Netlify și `localhost:5173`–`5178` (`npm run dev` ia primul port liber din interval, vezi `web/scripts/dev.mjs`).

## 11. Asistentul și notificările

Asistentul (pașii 9c–9d) e făcut. Vocea (9e) a fost scoasă pe 8 noiembrie 2026. Notificările sunt pasul 9f. Detaliile sunt în `docs/functions.md`, secțiunile 14 și 17.

**Asistentul** (`apps/api/src/ai/assistant.ts`, `routes/assistant.ts`, foaia `web/components/app/Assistant.tsx`)
- Rulează pe API, cu modelul din `ANTHROPIC_MODEL` (implicit `claude-sonnet-5-5`). Fără `ANTHROPIC_API_KEY`, doar asistentul și citirea hârtiilor sunt oprite (503).
- Uneltele vin din registrul de funcții, așa că butoanele și AI-ul dau aceleași cifre. AI-ul nu face calcule singur.
- O funcție `read` rulează direct, pe planul fermierului. O funcție `confirm` din lista permisă (`ASSISTANT_WRITES`) nu rulează: asistentul întoarce funcția și valorile, validate cu schema Zod, iar foaia arată un card. Apăsarea „Da, salvează” trimite aceeași cerere ca butonul din aplicație (`Live.write`), cu token-ul fermierului. O funcție `user` nu e unealtă. Pensia (Stripe) nu e în listă.
- **Decizie (8 nov 2026):** conversația stă în browser (sessionStorage) și ajunge la API doar ca text, la fiecare mesaj. Nu există tabelele `assistant_threads`, `assistant_messages` și `pending_actions`: nimic nu se execută pe server fără cererea normală a fermierului.
- Textul din pagini, PDF-uri și mesaje e date, nu instrucțiuni.
- Uneltele rulează cu token-ul fermierului, deci RLS se aplică și aici. Limită pe zi pentru fiecare fermier (`ASSISTANT_DAILY_LIMIT`, în memorie).

**Notificările**
- Job-urile rulează pe VPS, lângă `payoutScheduler`.
- Fiecare mesaj ajunge și în cardul „Mesaje”, ca să nu se piardă dacă Web Push e refuzat sau nu merge pe telefon.
- Sumele exacte nu apar pe ecranul blocat.

## 12. Panoul de administrare (`/admin`)

Planul și starea pașilor sunt în `docs/admin-panel-plan.md`. Pe scurt:

**Ce se poate schimba.**
- Doar cifrele din `EDITABLE_FACTORS` (`packages/shared/src/data/factors.ts`), cam 160:
  - costuri, producții și prețuri pe culturi;
  - cuantumuri și condiții APIA, cursul și istoricul subvențiilor;
  - anul slab/normal/bun și cât de departe se uită planul;
  - rotunjiri, credit, pensie, calendar și pragul de îngheț.
- Legile, datele oficiale și ce ține de fermier (suprafețe, vânzări) nu se schimbă de aici.
- Fiecare cifră se alege printr-o cale, de exemplu `crops.crops[id=grau].price_lei_per_kg.mean`. `[cheie=valoare]` alege elementul după câmpurile lui, nu după poziție, așa că o reordonare a JSON-ului nu mută schimbările.

**Excepție de la „cifrele vin doar din `docs/data`”.** Fișierele rămân sursa și baza.
- Peste ele se pune versiunea publicată din Supabase:
  - `prediction_versions`: istoricul;
  - `prediction_overrides`: cifra, valoarea și motivul, obligatoriu;
  - migrația `025`.
- O versiune e setul întreg de schimbări, nu o diferență, și se publică atomic prin `publish_prediction_version`.
- Versiunile nu se rescriu: „Înapoi la asta” publică o versiune nouă cu setul vechi.
- `applyOverrides` validează setul cu Zod și cu verificări între cifre (min ≤ medie ≤ max, cheltuielile pe luni adună 100% etc.) înainte de orice publicare.

**Cine vede ce.**
- **Fermele cu cont:**
  - API-ul ține versiunea în vigoare în memorie (`predictions/source.ts`) și o dă tuturor rutelor prin `liveData`, deci și salariului plătit prin Stripe și asistentului.
  - Telefonul o citește din `/api/prediction-data` și păstrează o copie (`cropcash-prediction-data`), deci ecranele dau aceleași cifre ca API-ul și offline.
  - Fără copie, telefonul folosește fișierele.
- **Ferma lui Ion fără cont (`/ferma-lui-ion`):** rămâne mereu pe fișiere și nu cheamă API-ul.

**Cine e administrator.**
- Cine are rândul `admin` în tabelul `app_roles` din Supabase (migrația 035). Fără Clerk și fără liste în `.env`.
- Postgres decide: `has_role()` / `is_admin()` sunt aceeași verificare în politicile RLS și în API. API-ul o cere cu token-ul utilizatorului la fiecare apel (`requireRole`, `middleware/admin.ts`) și ține răspunsul un minut.
- Nimeni nu își dă singur un rol: utilizatorul își citește doar rândurile lui, iar rândurile se scriu din dashboard, din SQL sau cu cheia de serviciu.
- Telefonul arată linkul „Administrare” doar când `/api/prediction-data` spune `admin: true`.
- Rolul `catalogue_editor` poate adăuga îngrășăminte în catalog fără să fie administrator. Administratorii îl au și pe acesta.

**Offline.**
- Cifrele și ciorna (`cropcash-admin-draft`) merg fără net. Previzualizarea „Acum / Cu ciorna”, pe ferma ta sau a lui Ion, se calculează pe telefon cu aceeași funcție ca API-ul.
- Publicarea și istoricul cer net (`NetButton`) și nu intră niciodată în coadă.
- Dacă altcineva a publicat între timp, API-ul răspunde 409. Ciorna rămâne, iar cifrele se reîncarcă.
