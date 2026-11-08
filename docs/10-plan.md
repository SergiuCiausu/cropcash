# 10. Planul de implementare (FAZA 2)

> Începe doar după `START`. După fiecare pas: `npm test` verde → bifează aici → o frază de status.
> **Minimul pentru un demo funcțional: pașii 1, 1b, 2–6, 9, 9b, 9c, 9d și 9e.** Pașii 7, 8, 9f, 10 și 11 sunt bonus.
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
  - **Gata când:** test case-ul de 3.195,00 € / 16.865,77 lei / avans 12.649,32 lei trece, plus testele de limită din `03-subsidies.md` §8. Niciun număr hardcodat în afara JSON-urilor.

- [x] **3. Onboarding** · ~4 h · MINIM
  - **Obiectiv:** ecranele O1–O7 și `POST /api/farmers`.
  - **Fișiere:** `apps/web/src/screens/Onboarding/*`, `i18n/ro.json`, `apps/api/src/routes/farmers.ts`, `supabase/migrations/001_init.sql`.
  - **Gata când:** profilul lui Ion se salvează în Supabase și O7 arată intervalul corect. Merge la 360 px lățime.

- [x] **4. Calendarul** · ~4 h · MINIM
  - **Obiectiv:** ExpectedPayments generate din subvenții + culturi + `calendar-2026.json`, plus axa de timp C1/C2.
  - **Fișiere:** `packages/shared/src/cashflow/timeline.ts` (+ test), `screens/Calendar/*`, `routes/plan.ts`.
  - **Gata când:** axa noiembrie 2026 – septembrie 2027 arată încasările, cheltuielile și termenele, cu golul martie–mai evidențiat.

- [x] **5. Plicuri + algoritmul de netezire + teste** · ~5 h · MINIM
  - **Obiectiv:** `maxSafeSalary`, `bridgeCreditNeeded`, propunerea de alocare și ecranele B1–B3.
  - **Fișiere:** `packages/shared/src/cashflow/smoothing.ts` (+ test), `allocation.ts`, `screens/Bani/*`, `routes/envelopes.ts`.
  - **Gata când:** testul cu exemplul din `07-architecture.md` §4 dă S = 650 lei fără credit și 14.000 lei de credit pentru 2.400 lei/lună. Toate cazurile-limită au teste.

- [x] **6. Stripe: Connect, payouts, subscription, webhooks, Test Clocks** · ~6 h · MINIM
  - **Obiectiv:** flow-ul banilor din `08-stripe.md`, cap-coadă, în test mode.
  - **Fișiere:** `apps/api/src/stripe/*`, `routes/webhooks.ts`, `routes/demo.ts`, `jobs/payoutScheduler.ts`.
  - **Gata când:** „Simulează avansul” → transfer → ecranul B3 → „Dăm timpul înainte 6 luni” → 6 payouts `paid` și 6 facturi `invoice.paid` vizibile în aplicație. Webhooks idempotente.

- [x] **7. Fondul de risc și pensia** · ~3 h · bonus (fondul a fost scos pe 7 nov 2026; a rămas pensia)
  - **Fișiere:** `packages/shared/src/risk/*`, `pension/*` (+ teste), `screens/ImiAjung/Fond*`, `Pensie*`.
  - **Gata când:** simularea dă ≈ 29.450 lei pentru 55 de ani / 200 lei / 4%, ținta fondului pentru Ion e ≈ 20.000 lei, iar butonul „Pornesc” creează subscription-ul.
  - **Făcut:** simularea dă 29.450 lei (test). Ținta fondului pentru Ion e **33.100 lei**, nu 20.000: `riskFundTarget()` include acum vânzarea de porumb și costurile maxime (vezi `07-architecture.md` §5). Ecranele stau în UI-ul echipei: `screens/app/blocks.tsx` (`RiskFundBody`, Î2) și `screens/app/MoneyCards.tsx` (`PensionCard`, Î3, cu slider). Parametrii noi sunt în `plan-params.json` (P19, P20). Offline: simularea și fondul merg fără net; „Pornesc” cere net.

- [x] **8. Prognoza de vânzări și scenariile** · ~4 h · bonus
  - **Fișiere:** `cashflow/scenarios.ts` (+ test), `screens/ImiAjung/Scenarii*`, `Vanzare*`, plus Open-Meteo sau CSV INS, dacă le avem.
  - **Gata când:** toggle-ul bun / mediu / secetă schimbă salariul și calendarul. Prețul de rentabilitate apare pe cultură. Proiecțiile pe trimestre merg pe 3 ani.
  - **Făcut:** `cashflow/scenarios.ts` (salariul pe scenariu, trimestre, vânzarea) + teste. În Prognoză, toggle-ul schimbă graficul, tabelul pe luni, cardul „Salariul sigur” (Ion: 1.900 / 850 / 0 lei fără credit, cu mesajul despre fond la secetă) și proiecția pe trimestre până la finalul lui 2028. În Culturi: prețul la care nu pierzi pe fiecare cultură și cardul „Vânzarea recoltei” cu slider-e (Î4). Componentele sunt în `screens/app/ScenarioCards.tsx`. Open-Meteo și INS nu sunt integrate încă (P21). Offline: totul se calculează pe telefon.

- [x] **8d. Sursele fermierului și paginare în surse.html** · bonus
  - **Făcut:** maximum 25 de rânduri pe pagină în toate cele trei tab-uri, buton „Adaugă o sursă”, `POST/GET/DELETE /api/sources` fără sesiune, cititorul `subventii-monitor/src/read-page.ts` cu `guarded-fetch.ts`, tabelele `watched_pages` și `farmer_sources` (migrația 015), verificarea zilnică în `farmer-pages.ts`.
  - **Rămâne:** mutarea verificării zilnice pe VPS (planul din `progress.md`).
- [x] **8c. Sezoane și prognoză pe 1–10 ani (doar HTML)** · bonus
  - **Făcut:** `cashflow/seasons.ts`, `rollingYears`, `longForecast`, `sowing_month`, `long_forecast` în `plan-params.json`. APIA nu se mai oprește după 3 campanii. În `farm-app/subsidies`: pașii „Ce ai strâns” și „Ce ai acum în pământ” (`seasons.js`), aceleași date în Recolte, cursorul din Prognoză (`#ani`), cardul din Acasă. React rămâne de portat.
- [x] **8b. Vremea (Open-Meteo)** · bonus
  - **Fișiere:** `packages/shared/src/weather/*`, `apps/api/src/weather.ts`, `routes/weather.ts`, `components/WeatherCard.tsx`, `lib/weather.ts`, `lib/weatherCache.ts`, `docs/data/counties.json` (coordonate), `plan-params.json` (`weather`).
  - **Gata când:** tab-ul Culturi arată prognoza pe 7 zile a județului, cu avertizare de îngheț și creditul Open-Meteo. Fără net se vede ultima prognoză salvată. La pasul 9b, copia din `localStorage` trece în cache-ul comun.
  - **Extra:** vremea istorică pentru scenarii rămâne la pasul 8. Instalarea pe VPS e în `open-meteo-vps-setup.md`.

- [x] **9. Polish UX pentru demo + datele lui Ion** · ~4 h · MINIM
  - **Făcut (8 nov 2026):** `demo:rehearse` trece de 3 ori la rând, iar cifrele din `09-demo-pitch.md` sunt cele din aplicație. Deploy: front pe https://cropcash.netlify.app (urcat de pe calculator, vezi `12-deploy.md`), API pe https://cropcash-api.andreitutea.com (VPS, pm2 + Caddy), webhooks Stripe pe două destinații, livrate cu succes. **Rămâne:** testul pe un telefon real.
  - **Fișiere:** `scripts/seed-demo.ts`, `ro.json` (revizuire de limbaj), componente.
  - **Gata când:** `npm run seed:demo` reface starea de start în mai puțin de 30 de secunde. Niciun cuvânt interzis în UI (avem un test care caută în `ro.json`). Scriptul din `09-demo-pitch.md` merge de 3 ori la rând. Deploy-ul funcționează: front pe Netlify, API pe VPS-ul RareCloud cu HTTPS (Caddy), webhooks Stripe pe URL-ul public.
  - **Stare (7 nov 2026):** ✅ `seed:demo` (~20 s, date în `docs/data/demo-ion.json`). ✅ Testul de limbaj: din 8 nov 2026 e `web/lib/language.test.ts` (cuvintele interzise în `web/app`, `web/legacy`, `web/components`), după ce `apps/web` și `ro.json` au fost scoase. ✅ `npm run demo:rehearse` rulează scriptul de 3 ori la rând; pentru asta, salariul e acum fix (scade doar la nevoie) și creditul declarat intră în contul CropCash în demo (P18, P22, migrarea 012); scriptul din 09 §3 are cifrele reale și pensia înainte de salt. ⏳ **Deploy:** fișierele sunt gata (`netlify.toml`, `deploy/`, `docs/12-deploy.md`), lipsesc domeniul API-ului, accesul pe VPS și contul Netlify.

- [x] **9b. Offline + instalare pe telefon** · ~4 h · MINIM
  - **Făcut (8 nov 2026):** offline-ul era gata din W9 (service worker, outbox, `data-needs-net`). Acum are și `web/public/manifest.webmanifest` (pornește pe `/acasa`, ecran întreg) și iconițele din `web/public/icons/` (192, 512, maskable, Apple), legate în `web/app/layout.tsx` și păstrate offline. **Neverificat pe un telefon real:** instalarea și modul avion trebuie încercate după deploy (pe HTTPS).
  - **Obiectiv:** PWA instalabil, cache pentru aplicație și date, outbox și mesajele „Pornește internetul…” (`07-architecture.md` §8).
  - **Fișiere:** `vite.config.ts` (vite-plugin-pwa), `apps/web/src/offline/*`, `components/NeedsInternet.tsx`, `ro.json`.
  - **Gata când:** cu telefonul în modul avion, aplicația instalată se deschide, arată ultimele date, scenariile se calculează, iar butoanele care cer net arată mesajul. O sarcină bifată offline ajunge pe server când revine netul.

- [x] **9c. Asistentul: răspunsuri din cifrele fermei** · ~6 h · MINIM
  - **Făcut (2026-11-08):** `apps/api/src/ai/assistant.ts` (bucla cu unelte din registru), `routes/assistant.ts` (`POST /api/assistant`, limită pe zi), `check_purchase` în `packages/shared`, foaia „Întreabă” în `web/legacy/assistant.js` + `web/public/assistant.css`. **Diferență față de plan, aprobată:** conversația stă în browser (sessionStorage), fără tabelele `assistant_threads` și `assistant_messages`, deci fără migrație. Testul cu 20 de întrebări: `npm run test:assistant` (`tests/assistant/`, pe Claude-ul real, ~20 s, costă bani la fiecare rulare). Trece 20/20 pe `claude-sonnet-5-5` (8 nov 2026). A prins două goluri, reparate: numele culturii în loc de id pe card și lipsa unei funcții cu parcelele fermei (`get_farm`).
  - **Obiectiv:** fermierul întreabă în română și primește răspunsuri din funcțiile din registru. AI-ul nu face calcule singur (`docs/functions.md`, secțiunile 14 și „Assistant rules”).
  - **Fișiere:** `apps/api/src/ai/assistant.ts`, `ai/tools.ts`, `routes/assistant.ts`, foaia „Întreabă” în `apps/web`, `check_purchase` în `packages/shared`, `ro.json`, migrația pentru `assistant_threads` și `assistant_messages`.
  - **Gata când:** 20 de întrebări de test trec: cifre corecte, niciun cuvânt interzis, nicio bancă numită, niciun da sau nu la „Pot să-mi iau…?” și „Să vând…?”. Fără net apare mesajul din `<NeedsInternet>`, iar restul aplicației merge fără `ANTHROPIC_API_KEY`.

- [x] **9d. Asistentul: carduri de confirmare** · ~3 h · MINIM
  - **Făcut (2026-11-08), fără `pending_actions`:** asistentul întoarce funcția și valorile, validate cu aceeași schemă Zod. Cardul arată valorile exacte, iar „Da, salvează” trimite aceeași cerere ca butonul din aplicație (`Live.write`), cu tokenul fermierului. Poate propune doar: `record_sale`, `add_expense`, `complete_task`, `reopen_task`, `add_credit`, `follow_opportunity`. Pensia (Stripe) rămâne doar pe ecranul ei.
  - **Obiectiv:** o vânzare sau o cheltuială spusă asistentului devine un card cu valorile exacte, iar fermierul apasă ca să salveze.
  - **Fișiere:** `apps/api/src/ai/pendingActions.ts`, cardul din foaia „Întreabă”, migrația pentru `pending_actions`.
  - **Depinde de:** ecranele F4 (`docs/f4-screens.md`), pentru „Anulează” și Activitate, și de migrațiile aplicate pe Supabase.
  - **Gata când:** o pagină cu instrucțiuni false nu poate provoca o scriere. Orice scriere cere o apăsare. Acțiunea se execută o singură dată.

- [ ] ~~**9e. Vocea**~~ · **ANULAT (2026-11-08), la cererea echipei.** Rămâne doar asistentul scris. Detaliile de mai jos sunt păstrate pentru istoric.
  - **Obiectiv:** Ion vorbește cu aplicația și o aude (`docs/functions.md` §16). Butonul de microfon e pe fiecare tab și deschide foaia „Întreabă”.
  - **Fișiere:** `components/VoiceButton.tsx`, `lib/speech.ts`, `parse_onboarding_answer` pentru O2–O5, `ro.json`.
  - **Se începe cu testul:** 20 de fraze reale pe un Android ieftin, cu semnal slab și zgomot, inclusiv sume spuse pe litere. Dacă recunoașterea din browser nu trece, ne oprim și întrebăm înainte să alegem un serviciu pe server.
  - **Gata când:** „Cât pot cheltui?”, „Am cheltuit 300 de lei pe motorină” și un onboarding complet merg cu vocea, pe un telefon real. Tastatura rămâne mereu disponibilă. Vorbirea nu confirmă niciodată o scriere.

- [ ] **9f. Notificări** · ~4 h · bonus
  - **Obiectiv:** aplicația vorbește prima (`docs/functions.md` §17): rezumatul de duminică, avertizarea din noiembrie despre aprilie, termenele.
  - **Fișiere:** `apps/api/src/jobs/*`, `routes/notifications.ts`, cardul „Mesaje”, service worker-ul de la 9b, migrația pentru `push_subscriptions` și `inbox_messages`.
  - **Gata când:** avertizarea ajunge pe un telefon real și apare și în „Mesaje”. Sumele exacte nu apar pe ecranul blocat.

- [ ] **10. Extra** · bonus, în ordinea asta
  - a. **Raportul de motorină** (~2 h): FuelLog, totalul pe trimestru, situația printabilă.
  - b. **Extragerea din PDF-ul APIA** (~3 h): Claude API + schemă Zod → prefill la onboarding (O6).
  - c. **Radarul de fonduri** (~4 h): job săptămânal pe AFIR, APIA și MADR → extragere LLM → potrivire pe profil → sarcină în calendar.

- [ ] **11. Golurile din `docs/use-cases.md`** · ~14 h · bonus, în ordinea asta
  - a. **Banii fără nume și APIA care plătește mai puțin** (~3 h): `record_income`, `label_income`, `record_apia_payment`.
  - b. **Cheltuieli care se repetă** (~2 h): `add_recurring_cost` și lista lor, incluse în plan.
  - c. **Corectarea înregistrărilor** (~2 h): `edit_transaction`, `open_record`.
  - d. **Fondul și pensia** (~3 h): `what_if_fund_withdrawal`, `withdraw_from_fund`, `skip_pension_payment`.
  - e. **Siguranță** (~1 h): `check_message` pentru SMS-uri false.
  - f. **Familia** (~1 h): `explain_numbers` și meniul de partajare al telefonului.
  - g. **Actele și costul creditului** (~2 h): `get_required_documents`, `get_credit_cost`. Rămân `null` până avem surse.

**Total MINIM:** ~49 h · **Total cu bonus:** ~83 h

## Interfața: din `apps/web` în `farm-app`, apoi în `web/` (Next.js)

După pașii de mai sus, interfața s-a mutat din `apps/web` în `farm-app`, pas cu pas (W1–W11 în `docs/farm-app-wiring.md`). Pe 8 nov 2026, echipa a mutat paginile `farm-app` într-o aplicație Next.js în `web/` (`docs/web-nextjs-plan.md`), iar `farm-app` și `apps/web` au fost scoase din repo. `npm run dev` și `npm run build` pornesc acum `web/` cu API-ul, iar `netlify.toml` publică `web/out`.
