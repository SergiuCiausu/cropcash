# 10. Planul de implementare (FAZA 2)

> Începe doar după `START`. După fiecare pas: `npm test` verde → commit → bifează aici → o frază de status.
> **Minimul pentru un demo funcțional: pașii 1, 1b, 2–6, 9 și 9b.** Pașii 7, 8 și 10 sunt bonus.
> Estimările sunt în ore de lucru ale unei persoane.

## Pași

- [x] **1. Setup proiect** · ~2 h · MINIM
  - **Obiectiv:** un monorepo care rulează, cu verificare de tipuri (`npm run typecheck`) și teste.
  - **Fișiere:** `package.json` (workspaces), `apps/web` (Vite + React + TS + Tailwind + PWA), `apps/api` (Express + TS), `packages/shared`, `vitest.config.ts`, `.gitignore`, `git init`.
  - **Gata când:** `npm run dev` pornește web (5173) și api (3001), `npm test` rulează un test trivial, iar `npm run build` trece.

- [x] **1b. Login (Supabase Auth)** · ~2 h · MINIM
  - **Obiectiv:** login și înregistrare cu email + parolă; API-ul verifică JWT-ul Supabase; RLS activ.
  - **Fișiere:** `apps/web/src/auth/*`, `apps/api/src/middleware/auth.ts`, `supabase/migrations/001_init.sql`.
  - **Gata când:** fără login nu se vede nimic, iar un user nu poate citi datele altui user (test pe RLS).

- [x] **2. JSON-uri de date + motorul de subvenții + teste** · ~4 h · MINIM
  - **Obiectiv:** `computeSubsidies(profile)` → interval, tranșe, motive.
  - **Fișiere:** `packages/shared/src/data/*` (loader și scheme Zod pentru `docs/data/*.json`), `money/`, `subsidies/`, `subsidies.test.ts`.
  - **Gata când:** test case-ul de 3.195,00 € / 16.869,60 lei / avans 12.652,20 lei trece, plus testele de limită din `03-subsidies.md` §8. Niciun număr hardcodat în afara JSON-urilor.

- [x] **3. Onboarding** · ~4 h · MINIM
  - **Obiectiv:** ecranele O1–O7 și `POST /api/farmers`.
  - **Fișiere:** `apps/web/src/screens/Onboarding/*`, `i18n/ro.json`, `apps/api/src/routes/farmers.ts`, `supabase/migrations/001_init.sql`.
  - **Gata când:** profilul lui Ion se salvează în Supabase și O7 arată intervalul corect. Merge la 360 px lățime.

- [x] **4. Calendarul** · ~4 h · MINIM
  - **Obiectiv:** ExpectedPayments generate din subvenții + culturi + `calendar-2026.json`, plus axa de timp C1/C2.
  - **Fișiere:** `packages/shared/src/cashflow/timeline.ts` (+ test), `screens/Calendar/*`, `routes/plan.ts`.
  - **Gata când:** axa noiembrie 2026 – septembrie 2027 arată încasările, cheltuielile și termenele, cu golul februarie–mai evidențiat.

- [x] **5. Plicuri + algoritmul de netezire + teste** · ~5 h · MINIM
  - **Obiectiv:** `maxSafeSalary`, `bridgeCreditNeeded`, propunerea de alocare și ecranele B1–B3.
  - **Fișiere:** `packages/shared/src/cashflow/smoothing.ts` (+ test), `allocation.ts`, `screens/Bani/*`, `routes/envelopes.ts`.
  - **Gata când:** testul cu exemplul din `07-architecture.md` §4 dă S = 650 lei fără credit și 14.000 lei de credit pentru 2.400 lei/lună. Toate cazurile-limită au teste.

- [x] **6. Stripe: Connect, payouts, subscription, webhooks, Test Clocks** · ~6 h · MINIM
  - **Obiectiv:** flow-ul banilor din `08-stripe.md`, cap-coadă, în test mode.
  - **Fișiere:** `apps/api/src/stripe/*`, `routes/webhooks.ts`, `routes/demo.ts`, `jobs/payoutScheduler.ts`.
  - **Gata când:** „Simulează avansul” → transfer → ecranul B3 → „Dăm timpul înainte 6 luni” → 6 payouts `paid` și 6 facturi `invoice.paid` vizibile în aplicație. Webhooks idempotente.

- [ ] **7. Fondul de risc și pensia** · ~3 h · bonus
  - **Fișiere:** `packages/shared/src/risk/*`, `pension/*` (+ teste), `screens/ImiAjung/Fond*`, `Pensie*`.
  - **Gata când:** simularea dă ≈ 29.450 lei pentru 55 de ani / 200 lei / 4%, ținta fondului pentru Ion e ≈ 20.000 lei, iar butonul „Pornesc” creează subscription-ul.

- [ ] **8. Prognoza de vânzări și scenariile** · ~4 h · bonus
  - **Fișiere:** `cashflow/scenarios.ts` (+ test), `screens/ImiAjung/Scenarii*`, `Vanzare*`, plus Open-Meteo sau CSV INS, dacă le avem.
  - **Gata când:** toggle-ul bun / mediu / secetă schimbă salariul și calendarul. Prețul de rentabilitate apare pe cultură. Proiecțiile pe trimestre merg pe 3 ani.

- [ ] **9. Polish UX pentru demo + datele lui Ion** · ~4 h · MINIM
  - **Fișiere:** `scripts/seed-demo.ts`, `ro.json` (revizuire de limbaj), componente.
  - **Gata când:** `npm run seed:demo` reface starea de start în mai puțin de 30 de secunde. Niciun cuvânt interzis în UI (avem un test care caută în `ro.json`). Scriptul din `09-demo-pitch.md` merge de 3 ori la rând. Deploy-ul funcționează: front pe Netlify, API pe VPS-ul RareCloud cu HTTPS (Caddy), webhooks Stripe pe URL-ul public.

- [ ] **9b. Offline + instalare pe telefon** · ~4 h · MINIM
  - **Obiectiv:** PWA instalabil, cache pentru aplicație și date, outbox și mesajele „Pornește internetul…” (`07-architecture.md` §8).
  - **Fișiere:** `vite.config.ts` (vite-plugin-pwa), `apps/web/src/offline/*`, `components/NeedsInternet.tsx`, `ro.json`.
  - **Gata când:** cu telefonul în modul avion, aplicația instalată se deschide, arată ultimele date, scenariile se calculează, iar butoanele care cer net arată mesajul. O sarcină bifată offline ajunge pe server când revine netul.

- [ ] **10. Extra** · bonus, în ordinea asta
  - a. **Raportul de motorină** (~2 h): FuelLog, totalul pe trimestru, situația printabilă.
  - b. **Extragerea din PDF-ul APIA** (~3 h): Claude API + schemă Zod → prefill la onboarding (O6).
  - c. **Radarul de fonduri** (~4 h): job săptămânal pe AFIR, APIA și MADR → extragere LLM → potrivire pe profil → sarcină în calendar.

**Total MINIM:** ~35 h · **Total cu bonus:** ~51 h
