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

- [x] **12. Operațiile cu bani rulate de două ori fac un singur lucru (Must din `docs/idempotency-plan.md`)** · ~6 h · MINIM
  - **Făcut (2026-11-08):** IDEM-01…07. Migrația `018_idempotency.sql` (trebuie aplicată cu `npm run db:migrate` înainte de deploy-ul API-ului): tabela `farm_leases` cu `take_farm_lease` / `release_farm_lease`, statusul `creating` la `payouts`, `pension_plans.start_key`, indexul unic pe `(farmer_id, group_id, kind)` pentru credite, `record_expense` cu lacăt pe `client_id`.
    - IDEM-01 (dăm timpul înainte): telefonul trimite `from`, iar ținta e `from` + luni. Același tap trimis din nou răspunde `already`, o rulare căzută la jumătate continuă, iar un ecran vechi primește `409 stale_clock`. Salariul se rezervă în `payouts` înainte de Stripe, iar plățile și veniturile au chei Stripe fixe.
    - IDEM-02 (pornește pensia): cheie pe dialog (`Idempotency-Key`). Un abonament rămas pornit după o cădere e preluat, nu dublat.
    - IDEM-03 (avansul APIA): a doua cerere răspunde `200 already`, nu 409.
    - IDEM-04 (contul Stripe): chei Stripe pe fermă pentru cont, IBAN, client și card.
    - IDEM-05 (vânzare, cheltuială): Recolte păstrează același `clientId` cât timp înregistrarea e aceeași.
    - IDEM-06 (oprește pensia): starea `stopping`, iar o pensie deja oprită răspunde `204`.
    - IDEM-07 (credit de la asistent): cardul trimite `groupId`.
    - Cheia de intenție e în `web/lib/live/intent.ts` și e folosită și în `web/lib/cc/store.ts` (portarea React).
  - **Teste:** `apps/api/src/idempotency.test.ts`, `web/lib/live/intent.test.ts` și cazuri noi în `webhook.test.ts` și `app.test.ts`. `tests/stripe/flow.test.ts` verifică și reluarea pe sandbox (`npm run test:stripe`).
  - **Diferențe față de plan:**
    - Fără starea `starting` la pensie: abonamentul se caută în Stripe după `metadata.farmer_id`.
    - Fără indexul unic pentru avansul APIA, pentru că ar fi oprit și avansul din anul următor la „Dăm timpul înainte”.
    - Ceasul de test și update-ul contului nu au cheie, pentru că trimit „acum”.

- [x] **13. Restul din `docs/idempotency-plan.md` (Should)** · ~6 h · bonus, în ordinea asta
  - a. **IDEM-08: coada pe mai multe taburi** (~2 h). `navigator.locks` pentru `flushOutbox`, `queue()` și ștergerea din coadă. `clientId` completat pentru înregistrările vechi din coadă înainte de trimitere. Se ține `outboxId → id de pe server` 24 h, ca o ștergere după trimitere să șteargă de pe server.
  - b. **IDEM-09: schimbarea pensiei** (~1 h). Prețul se refolosește după `lookup_key` (`cc-pension-<bani>`). Lacătul și „aceeași sumă nu mai întreabă Stripe” sunt deja făcute la pasul 12.
  - c. **IDEM-10: plățile salariului în ordinea greșită** (~1 h). `setPayoutStatus` nu mai trece din `failed` în `paid`.
  - d. **IDEM-11: „deja făcut” nu e eroare** (~1 h). Un 404 la `undo_transaction`, `reopen_task` și `remove_credit` contează ca reușită în `web/lib/live/functions.ts` (marcaj `repeatSafe: 'gone'` în registru).
  - e. **IDEM-12: recoltele salvate de pe două telefoane** (~1 h). `farmers.harvests_version`; o versiune veche primește `409 changed_elsewhere`, iar pagina aduce cifrele noi.
  - **Gata când:** fiecare are testul din `docs/idempotency-plan.md` (de două ori la rând, de două ori deodată, căzut la jumătate).
  - **Făcut (2026-11-08):** toate cinci, cu migrația `019_harvests_version.sql`. Diferențe față de plan: fără `navigator.locks` (browser vechi, http), lacătul ține ordinea doar în același tab, iar `clientId` rămâne protecția între taburi. La IDEM-12, salvările de recolte nu intră încă în coadă; asta ține de FAIL-14 din `docs/failure-handling-plan.md`.

- [x] **14. Ce a rămas din `docs/idempotency-plan.md` (Later)** · ~2 h · bonus
  - **Făcut (2026-11-08):** IDEM-13…15, fără migrație.
    - IDEM-13: `apps/api/src/replay-cache.ts` ține 10 minute, în memorie, răspunsul la aceeași hârtie și la aceeași întrebare pe aceeași fermă. Repetarea nu mai cere încă un apel la Claude și nu se numără la limita pe zi. Cererile identice care se suprapun folosesc același apel, iar o eroare nu se păstrează. La asistent, ferma face parte din cheie, deci după o salvare răspunsul se calculează din nou. La hârtii se păstrează doar hash-ul fișierelor și câmpurile citite.
    - IDEM-14: două adăugări simultane ale aceluiași link din Surse citesc pagina o singură dată și se numără o singură dată.
    - IDEM-15: în Recolte, fără cont, un al doilea tap înainte de reîncărcare nu mai adaugă înregistrarea de două ori.
  - **Teste:** `apps/api/src/replay-cache.test.ts` și cazuri noi în `assistant.test.ts`, `documents.test.ts`, `sources.test.ts`. IDEM-15 nu are test automat, pentru că `recolte.js` nu rulează în Vitest.

- [x] **15. Erori și rețea slabă (`docs/failure-handling-plan.md`, FAIL-01…15)** · bonus
  - **Făcut (2026-11-08):** timp limită la fiecare apel, coada cu reîncercări și proprietar, salvările de plan fără net, banii cu răspuns pierdut, pagina care nu pornește, service worker-ul. Pe server: IDEM-09, IDEM-10 și IDEM-12 (migrația 019).
  - **Teste:** `npm test` acoperă logica. Nu au rulat încă, pe codul ăsta: `npm run db:migrate`, `test:integration`, `test:stripe`, `demo:rehearse` și verificarea de mână din planul de construcție.

- [x] **16. „An slab” și „an bun” din istoricul INS, pe fiecare județ** · bonus
  - **Făcut (2026-11-08):** producțiile pe județ din AGR110A, prețul și costurile la medie în toți cei trei ani, „după un an slab” pe 24 de luni în Prognoză și la asistent (`docs/an-slab-an-bun-plan.md`).
  - **Rămas:** cifrele din pitch, după `seed:demo` și `demo:rehearse`.

**Total MINIM:** ~49 h · **Total cu bonus:** ~83 h

## Interfața: din `apps/web` în `farm-app`, apoi în `web/` (Next.js)

După pașii de mai sus, interfața s-a mutat din `apps/web` în `farm-app`, pas cu pas (W1–W11 în `docs/farm-app-wiring.md`). Pe 8 nov 2026, echipa a mutat paginile `farm-app` într-o aplicație Next.js în `web/` (`docs/web-nextjs-plan.md`), iar `farm-app` și `apps/web` au fost scoase din repo. `npm run dev` și `npm run build` pornesc acum `web/` cu API-ul, iar `netlify.toml` publică `web/out`.

## Login obligatoriu, ferma lui Ion și încărcarea (8 nov 2026)

Planul pas cu pas e în `docs/13-auth-demo-loading-plan.md`; cum funcționează, în `docs/07-architecture.md` §9.

- **Făcut:** aplicația fermierului cere cont. Ferma lui Ion s-a mutat la `/ferma-lui-ion/[pagină]`, cu datele pe dispozitiv și pagina Bani ca exemplu, fără Stripe. Prima pagină duce la cont sau la ferma lui Ion. Fiecare ecran și onboarding-ul au skeleton, iar o pagină care nu pornește spune asta și oferă o nouă încercare.
- **Rămas:** pasul 9 din plan (verificarea în browser pe telefon și laptop, luminos și întunecat, cu și fără net).

## Rapoarte PDF (14 nov 2026)

Planul e în `docs/rapoarte-pdf-plan.md`.

- **Făcut (faza 1):** ecranul `/rapoarte` (și pe ferma lui Ion), cu „Pentru mine” și „Pentru contabil”. Trei rapoarte: rezumatul fermei, registrul încasărilor și plăților (pe lună, trimestru, an sau recoltă, la ban, cu totaluri pe lună și pe categorie) și situația subvențiilor APIA. PDF-ul se face pe telefon, merge fără net, cu fontul Geist încorporat pentru diacritice. Sumele din `packages/shared/src/reports`, textele și PDF-ul din `web/lib/reports`.
- **Făcut (faza 2):** migrația `027_transaction_documents.sql` (**trebuie aplicată cu `npm run db:migrate` înainte de deploy-ul API-ului**: `/api/me` citește coloanele noi): numărul documentului, partenerul și litrii de motorină pe vânzări și cheltuieli, în Recolte sub „Mai multe detalii”, și în coada offline; cititorul de hârtii ia numărul facturii. Patru rapoarte noi: motorina și acciza de recuperat (cota din `docs/data/fuel-excise.json`, DE-VERIFICAT), registrul tratamentelor, terenul și culturile (de pe hartă) și cât a rămas pe fiecare cultură. Al treilea grup: „Pentru instituții”. Registrul pentru contabil are coloana „Document” când e ceva în ea.
- **Făcut (faza 3):** migrația `028_farm_members.sql` (**de aplicat cu `npm run db:migrate` înainte de deploy-ul API-ului**, după 027). Fermierul invită contabilul sau pe cineva din fermă din `/rapoarte` („Cine mai vede rapoartele”): link pe WhatsApp, și pe e-mail dacă scrie adresa. Contabilul acceptă la `/invitatie` și își face singur rapoartele la `/contabil`, în browserul lui, din copia fermei adusă prin API (doar citire). Fermierul vede cine are acces și îl scoate. De făcut la deploy: Redirect URLs și șabloanele de e-mail în Supabase (`docs/12-deploy.md`). Testul pe Supabase-ul real: `tests/integration/members.test.ts` (nerulat: cere migrațiile 027 și 028).
- **Rămas:** scurtăturile din `/bani` și `/subventii`; exportul CSV (amânat).

## Ferme de peste 100 ha: oameni, arendă, demo doar pe contul demo (14 nov 2026)

Planul e în `docs/employees-arenda-plan.md` (pașii din §8, deciziile D1–D8 din §9). Ținta: ferme de la 100 ha, lansare cu maximum 1 000 ha.

- [x] **Pasul 1. Costul oamenilor, funcții pure** · `packages/shared/src/payroll`
  - **Făcut (2026-11-14):** `EmployeeInputSchema` (permanent, sezonier, zilier; costul total, pe lună sau pe zi), `employeeRow`, `workMonthCost` (lună întreagă, zile parțiale rotunjite în jos la ban, lunile de lucru, zilele zilierului), `payrollMonth` / `payrollMonths` (ce pleacă în fiecare lună: pe lună, la ziua de plată din luna următoare; pe zi, în aceeași lună) și `payrollYear`. Fără cote de impozit (D2). 31 de teste.
- [x] **Pasul 2. Oamenii în baza de date și în API**
  - **Făcut (2026-11-14):** migrația `026_employees.sql` (**trebuie aplicată cu `npm run db:migrate` înainte de deploy-ul API-ului**: `/api/me` citește tabela nouă): tabela `employees` cu RLS, fără ștergere (oamenii se arhivează), `transactions.employee_id` doar pe cheltuieli `salaries`, `record_expense` cu `p_employee_id`. API: `POST /api/employees`, `PUT /api/employees/:id`, `POST /api/employees/:id/archive`; în registru `add_employee`, `update_employee`, `archive_employee` (doar fermierul, nu asistentul). Categoria „Salarii” la cheltuieli, cu omul pe ea. Oamenii vin cu ferma în `/api/me`, ca planul să-i aibă și pe telefon. Teste: `apps/api/src/employees.test.ts` și un test RLS în `tests/integration/rls.test.ts` (nerulat: cere migrația pe Supabase). **Diferență față de plan:** plicul `payroll` trece la pasul 3.
- [x] **Pasul 3. Salariile oamenilor în plan**
  - **Făcut (2026-11-14):** plata fiecărui om intră în plan ca bani care ies, pe ziua de plată, aceeași în orice fel de an, deci oamenii sunt plătiți înaintea salariului fermierului. O cheltuială „Salarii” cu omul pe ea ia plata lui din luna ei; fără om, vine peste plan. Avertismentul „nu ajung banii de salariile oamenilor” (`plan.payrollShort`), un rând „Salariile oamenilor” la ce schimbă prognoza, plicul „Salariile oamenilor” (după datorii, înaintea pensiei și a salariului). Întrebarea „Lucrările pe câmp le fac oamenii tăi?”: `PUT /api/farm/own-field-work` și `cropsNeedingOwnCost`. Migrațiile `030_payroll_envelope.sql` și `031_payroll_envelope_rows.sql` (numerotate 028–029 la început; renumerotate, pentru că 028 e și `028_farm_members.sql`) (**de aplicat cu `npm run db:migrate` înainte de deploy**, ca și 026). Ecranele (cardul pe Recolte, avertismentul pe Acasă) vin la pasul 4.
- [x] **Pasul 4. Ecranul „Oameni”**
  - **Făcut (2026-11-14):** pagina `/oameni` (și pe ferma lui Ion, cu o notă că el n-are oameni), în meniu la „Mai mult”, cu skeleton. Lista oamenilor, cât costă fiecare pe lună, cei plecați separat; adaugă, schimbă și „A plecat” (arhivat, nu șters), toate cu internet. „Am plătit salariile pe [luna]”: sumele de plătit (`payToRecord`), care se pot schimba, notate ca cheltuieli „Salarii” cu omul și din plicul „Salariile oamenilor”; merge și fără net (intră în coadă, iar planul nu le mai socotește de plătit nici din coadă). Întrebarea „Lucrările pe câmp le fac oamenii tăi?” pe Oameni, iar cu „Da” un card pe Recolte trimite la costul pe hectar din Datele planului. Avertismentul „nu ajung banii de salariile oamenilor” pe Acasă, Salariu și Oameni. Zilele de plată apar în Calendar, iar pe Recolte cheltuiala arată „Salarii: Nelu”. Asistentul: `what_if_hire` („Îmi permit încă un om?”) și `get_people_cost` („Cât mă costă oamenii pe an?”), cu două întrebări noi în `tests/assistant` (nerulate: costă bani). Întrebările din onboarding vin la pasul 5.
- [x] **Pasul 5. Cum lucrezi pământul**
  - **Făcut (2026-11-15):** onboardingul are patru pași. Primul întreabă întâi „Cum lucrezi pământul?” (pământul meu / iau în arendă; o fermă nouă trebuie să aleagă, una salvată pornește de la ce are). Culturile întreabă „câte hectare sunt în arendă?” (cel mult cât are ferma) și „ai pământ dat în arendă altcuiva?”. Pasul nou „Oamenii”: nume și cost pe lună, tot cu taxe (fiecare cu id-ul telefonului, ca o salvare repetată să nu-i dubleze), plus „Lucrările pe câmp le fac oamenii tăi?”; se poate sări. Cererea APIA: PDF-ul din contul APIA e calea întâi, pozele a doua. Meniul alege taburile după mod (`tabsFor`); deocamdată sunt aceleași, Arendă vine la pasul 7. Migrația `032_farm_mode.sql` (`farmers.farm_mode`, `leased_in_ari`, `leased_out_ari`, `plots.tenure`). Migrațiile pentru salarii au fost renumerotate în 030–031, pentru că 028 e și `028_farm_members.sql`. **De aplicat `npm run db:migrate` înainte de deploy:** fără 032, `/api/me` cade (citește coloanele noi). Rămân: pragul de 100 ha (pasul 0c), „Câți proprietari?” și arenda pe parcelă (pasul 7), tab-ul Echipa (pasul 10).
- [x] **Pasul 6. Arenda: ce spune legea**
  - **Făcut (2026-11-15):** `docs/15-arenda.md`, cu sursele: contractul (Codul civil art. 1836–1850: în scris, înregistrat la primărie de arendaș, se reînnoiește singur dacă nu e refuzat cu un an înainte, subarendarea interzisă), APIA (adeverința din registrul agricol, MO 193 bis/2026), impozitul (Codul fiscal art. 84: 20% cheltuieli, 10% din net, reținut de arendaș, plătit până pe 25 a lunii următoare) și CASS-ul (nu îl calculăm). `docs/data/arenda-prices-2026.json`: prețurile citite din hotărârile pentru Teleorman, Olt, Covasna, Caraș-Severin și Ialomița (din 1 aug), restul `null`. Codul: `packages/shared/src/arenda/prices.ts` (`rentTax`, `inKindPriceBani`). Deschise: docs/11, 21–25.
- [x] **Pasul 7. Proprietarii și contractele de arendă**
  - **Făcut (2026-11-15):** migrația `033_arenda.sql` (`landowners`, `lease_contracts`, `farmers.landowner_count`), fără CNP și fără IBAN (D4). API: `/api/landowners`, `/api/lease-contracts` (adaugă, schimbă, mută la foști/încheiate; nimic nu se șterge), `PUT /api/plots/:id/tenure`, `PUT /api/farm/landowner-count`; toate vin cu ferma în `/api/me`. Ecranul **Arendă** (`/arenda`): pământul în arendă și cât mai e de trecut, arenda pe an (lei, kg pe cultură, în lei la prețul județului, impozitul de reținut), „De făcut” (contractele de refuzat la timp, art. 1848; cele neînregistrate la primărie; parcelele în arendă fără contract), proprietarii grupați pe sat, cu căutare, și al cui e fiecare parcelă. Tab-ul apare la arendași și la fermele care au proprietari sau dau pământ în arendă. La înscriere, arendașul e întrebat „De la câți proprietari?”. Fără internet se vede tot; adăugatul cere internet. **De aplicat `npm run db:migrate` înainte de deploy** (fără 033, `/api/me` cade). Rămân: poza contractului, arenda în plan (pasul 8), ziua arenzii (pasul 9).
- [x] **Pasul 8. Arenda în plan și impozitul reținut**
  - **Făcut (2026-11-15):** fiecare contract plătește o dată pe an, în luna lui (fără lună: arenda în produse în luna recoltei culturii, marcată „estimată”; arenda în bani fără lună nu intră în plan și apare la „De făcut”). Un contract trecut de sfârșit plătește mai departe până e marcat încheiat (se reînnoiește singur, art. 1848). Impozitul se socotește la fiecare plată, pe bani plus produse la prețul județului, și se împarte proporțional: proprietarul primește 92% din fiecare, ferma plătește 8% statului pe 25 a lunii de după (`rent_tax`, în calendar). Arenda în bani iese în luna plății (`rent`); cea în produse pe care ferma le cultivă scade vânzarea acelei culturi (întâi vânzarea dinainte de plată); dacă ferma nu cultivă produsul, e de cumpărat (`rent`). Arenda primită (D5): bani după reținere sau produse de vândut (`rent_in`). O cheltuială „Arendă” înregistrată ia arenda planificată din luna ei. Pe Arendă: arenda fiecărui proprietar pe anul curent (brut, reținut, primește) și „Lista pentru contabil” (CSV, cu coloana CNP goală, merge și fără internet). Prețurile pe județ sunt acum în datele aplicației (`data.arenda`), deci și salariul calculat pe server ține cont de arendă. Fără migrație. Rămân: ziua arenzii, cu chitanțe (pasul 9), `lease_contract_id` pe tranzacții.
- [ ] Pasul 0a și următorii: vezi `docs/employees-arenda-plan.md` §8.

## Facturi: Oblio și e-Factura, cu simulator până la legarea API-urilor (17 nov 2026)

Planul e în `docs/facturi-plan.md` (pașii din §7, deciziile D1–D4 din §1, hotărâte pe 2026-11-17). Până la conturile reale de Oblio și ANAF, totul merge pe simulator, marcat „Simulare”.

- [x] **Pasul 1.** Modelul facturii, funcții pure · `packages/shared/src/invoices`
  - **Făcut (2026-11-17):** CIF (cifra de control) și IBAN, datele firmei, cumpărătorul, rândurile facturii (cantități în miimi, prețuri în bani, cota în puncte de bază, fără cote reale în cod), totalurile cu TVA pe grupă de cotă (regula BR-CO-17, nu pe rând), seriile (cele simulate încep cu `SIM-`, cele reale niciodată cu `SIM`), stările și verificările dinainte de număr (doar coduri; textele vin la pasul 5). 25 de teste.
- [x] **Pasul 2.** XML-ul e-Factura (UBL / CIUS-RO): construit, citit, factura primită → cheltuială propusă
  - **Făcut (2026-11-17):** cititor XML propriu, fără dependențe (refuză DOCTYPE, deci fără XXE); `buildUbl` scrie factura în ordinea cerută de schemă, iar cele simulate au „SIMULARE” chiar în XML; `parseUbl` citește facturi și note de credit, oricum ar fi prefixele, cu sumele întregi direct din text; o factură primită devine cheltuială propusă (categoria din cuvintele de pe rânduri, litrii de motorină, notele de credit și stornările sărite, cheia pentru dubluri). Două reguli noi: motivul pe rândurile scutite (E) și sectorul la adresele din București. 20 de teste. De verificat pe validatorul ANAF: în `docs/facturi-plan.md` §8.
- [x] **Pasul 3.** Migrația 041 și datele (`einvoice-sim.json`, `einvoice-inbox-demo.json`, `vat-2026.json`)
  - **Făcut (2026-11-17):** migrația `041_invoices.sql` (040 era luată de `040_people_on_the_farm.sql`; **de aplicat cu `npm run db:migrate` înainte de deploy-ul API-ului de la pasul 4**): datele firmei, seriile, facturile în ambele sensuri, rândurile, istoricul stărilor, legăturile (credențialele nu pot fi citite de utilizatori) și `issue_invoice()` (numărul și factura într-o singură tranzacție; pot emite proprietarul, managerul și contabilul). Ce s-a emis nu se mai schimbă, iar stările se mută doar pe drumurile din `model.ts` (un test citește SQL-ul). Ciornele stau pe telefon. `vat-2026.json`: 21% și 11% (Legea 141/2025, din presă), inputurile la 11% DE-VERIFICAT, taxarea inversă la cereale până pe 31 dec 2026; întrebările 26–30 în `docs/11-open-questions.md`. Facturile demo de la furnizori iau suma din plan (costul pe ha × ponderea lunii × hectarele lui Ion), cu furnizori inventați. 14 teste. Nerulat pe Supabase.
- [x] **Pasul 4.** Simulatorul și API-ul
  - **Făcut (2026-11-17):** rutele `/api/invoicing` (datele firmei, seriile, legăturile), `/api/invoices` (emite, listă, una cu istoricul, XML-ul, trimite din nou, anulează prin stornare) și `/api/einvoice/inbox` (aduce facturile primite, le leagă de cheltuiala salvată, „Nu e a fermei” și înapoi). Contabilul trimite ferma în X-Farm-Id. Simulatorul nu are nevoie de o rulare în fundal: starea se socotește la fiecare citire, după ceasul fermei (data demo sau ora reală, care a mers mai departe), așa că „Dăm timpul înainte” mută și facturile fără schimbări în `routes/money.ts`. Facturile simulate de la furnizori apar doar pe fermele cu ceas demo. 23 de teste. **De aplicat migrația 041 înainte de deploy**; nerulat pe Supabase.
- [x] **Pasul 5.** Ecranele: `/facturi` (Primite, Emise), „Fă factura”, „Datele firmei”, „Legături”, `/contabil`
  - **Făcut (2026-11-17):** pagina `/facturi` (și `/ferma-lui-ion/facturi`), în meniu la „Mai mult”, cu skeleton. „Primite”: facturile de la furnizori, cu cheltuiala propusă; „Notează cheltuiala” cere confirmarea categoriei și a datei, salvează cheltuiala și o leagă de factură (cu internet). „Emise”: starea pe înțeles, istoricul, „Trimite din nou”, „Anulează (stornare)”. „Fă o factură” din antet sau de la o vânzare din Recolte („Fă factura”). „Datele firmei” și seriile (toate SIM- până la legare). Cardul „Legătura cu ANAF” spune că e simulare. Pe ferma lui Ion, facturile primite se fac pe telefon din fișierele demo, fără API; el e persoană fizică, deci fără „Emise”. Contabilul vede „Facturile fermei” în `/contabil`. Rapoartele nu s-au schimbat: o factură notată e o cheltuială obișnuită. 11 teste noi. Rămân PDF-ul cu „SIMULARE” și descărcarea XML pentru contabil.
- [x] **Pasul 6.** Demo: `seed:demo` și `demo:rehearse`
  - **Făcut (2026-11-17):** pe contul demo Ion e PFA (`einvoice-demo-issued.json`, decis cu utilizatorul), cu trei facturi de porumb date deja: una respinsă și retrimisă, una primită, una anulată prin stornare. Ferma lui Ion fără cont rămâne persoană fizică. Fără facturi de motorină: nu avem un preț pe litru în docs/data. `seed:demo` le trece prin API, mutând ceasul demo pe fiecare zi și punându-l apoi la loc. `demo:rehearse` face o factură înainte de „6 luni înainte” și verifică după salt că e „Primită de ANAF”, apoi notează la final prima factură primită ca cheltuială. 7 teste noi. **Nerulat pe Supabase:** întâi migrația 041, apoi `seed:demo` și `demo:rehearse`.
- [x] **Pasul 7.** Oblio (când e cont)
  - **Făcut (2026-11-17), fără cont Oblio încă:** clientul Oblio după documentația publică (token, factură, trimiterea în SPV, starea e-Factura, stornarea), cu limitele de cereri și erorile pe înțeles. Decis cu utilizatorul: o fermă legată dă facturi fiscale din prima, din seriile adevărate, prin Oblio în SPV; cardul spune asta înainte de legare. Seria adevărată e una din Oblio și pornește de la numărul următor din Oblio. Cheile se țin sigilate cu `INVOICING_KEY` (de pus în `.env` pe VPS). `npm run test:oblio` verifică pe un cont de probă. 30 de teste noi. **Nerulat pe Oblio-ul real:** întrebarea 31.
- [x] **Pasul 8.** ANAF e-Factura (când e certificat / contabil)
  - **Făcut (2026-11-17), fără aplicația înregistrată la ANAF încă:** „Conectează SPV” din Contabil (și din Facturi), cu certificatul, pe sistemul de probă al ANAF până la pasul 9. Facturile primite vin de la ANAF pentru fermele legate, fiecare descărcată o dată, în limitele ANAF. În calendar apare „Leagă din nou SPV” înainte să expire legătura. „PDF de la ANAF” pe facturile adevărate. Verificat pe validatorul public ANAF: vânzarea, stornarea și rândul scutit trec; scadența lipsă și cumpărătorul fără CIF pe factură cu TVA sunt acum prinse. `npm run test:efactura`. **Nerulat cu logarea ANAF:** întrebarea 32.
- [x] **Pasul 9.** Trecerea pe producție
  - **Făcut (2026-11-18):** fără `INVOICING_ALLOW_PROD=true` pe server nicio fermă nu ajunge la ANAF-ul adevărat. Cu el, o fermă trece pe producție doar după o probă reușită pe sistemul de probă ANAF (o factură de 1 leu, din card: „Fă proba la ANAF”, apoi „Treci pe facturile adevărate”). Oblio rămâne fără comutator (decis la pasul 7). Poller-ul merge în procesul API-ului (decis cu utilizatorul), ca tokenurile ANAF să nu fie reînnoite de două ori. Pașii de deploy în `docs/12-deploy.md` §7. **Nerulat pe ANAF-ul real:** cere aplicația înregistrată la ANAF (întrebarea 32).

## Contractele fermei: termene, ce faci la final, taxe la stat, bani pe fermă și pe toate fermele (18 nov 2026)

Planul e în `docs/contracts-plan.md` (pașii din §8, deciziile C1–C7 din §9, luate pe 18 nov 2026 după recomandări).

- [x] **Pasul 1.** Legea pentru tipurile de contract și datele
  - **Făcut (2026-11-18):** `docs/16-contracts-law.md` (Codul civil pentru denunțare, reînnoire, vânzare, asigurare, comodat; OG 51/1997 pentru leasing; Codul fiscal citit integral din forma ANAF actualizată prin Legea 204/2026: TVA 21% / 11%, taxarea inversă la cereale până pe 31.12.2026, regimul special pentru agricultori cu 8% compensație, scutirea la credite și asigurări, D300 pe 25, micro 1% pe trimestru, impozitul pe teren în două rate). Datele: `docs/data/contract-types.json` (sfârșitul, preavizul și acțiunile pe tip) și `docs/data/contract-taxes-2026.json` (fără cifre repetate din `vat-2026.json` și `arenda-prices-2026.json`). Întrebările 42–49 și presupunerile P-C1–P-C3 în `docs/11-open-questions.md`; #26 și #29 completate. Fără cod: fișierele noi nu sunt încă citite de `packages/shared`.
- [x] **Pasul 2.** Modelul pur: `packages/shared/src/contracts/` (Zod, plăți, `EndPlan`, vederea comună)
  - **Făcut (2026-11-18):** `types.ts` (citește `contract-types.json`, intră în `data.contractTypes`), `model.ts` (Zod pentru partea cealaltă, contract și plăți; rândurile iau din tip ce n-a scris fermierul; `decisionsFor`), `schedule.ts` (plățile în date: lunar, trimestrial, anual, de N ori, pe ha; nu trec de ziua în care contractul se oprește; valoarea reziduală la leasingul cumpărat), `end.ts` (termenele cu reînnoiri, decizia pe termenul ei, `runsUntil`, `endPlan` cu `actBy`, aducerea aminte și starea, pe fiecare tip), `view.ts` (`fromContract`, `fromLease` peste `refuseRenewalBy` și `rentPayments`). `addMonthsToDate` și `addDaysToDate` în `cashflow/dates.ts`. Teste: ziua de 31, 29 februarie, fără sfârșit, reînnoit de două ori. Față de schița SQL din plan, contractul are în plus `area_ari` (hectarele pentru plățile pe ha): intră în migrația 048 la pasul 4. Taxele vin la pasul 3.
- [x] **Pasul 3.** Taxele la stat: `packages/shared/src/contracts/taxes.ts`
  - **Făcut (2026-11-18):** `contract-taxes-2026.json` intră în `data.contractTaxes`. Pe fiecare contract, liniile de taxă (`TaxLine`: ce taxă, cui, formularul, baza, cota, suma, ziua, cine plătește): arenda luată, impozitul reținut (prin `rentTax`); arenda dată, cel reținut de arendaș (arătat, nu socotit; nimic la SRL); vânzarea, TVA după starea fermei (taxare inversă la cereale, oleaginoase și sfeclă de zahăr până pe 31.12.2026, cu cumpărătorul plătitor de TVA după CUI-ul cu RO; nimic în regimul special sau neînregistrat; compensația de 8% e un ajutor separat, `flatRateCompensation`) și impozitul micro de 1% pe trimestru la SRL (nimic pe vânzare la PF/PFA/II pe normă); cumpărare, servicii, leasing, alt contract, TVA de pe factură (deductibil la plătitor, cost la ceilalți; 21% implicit la servicii și leasing, la cumpărare cota din contract); asigurare, credit, comodat: nimic. Impozitul pe teren, în două rate, doar din suma scrisă de fermier (`landTaxLines`). Fără cotă citită sau fără un fapt despre fermă (forma, TVA, micro), suma e `null`, niciodată 0. `taxTotals` și `taxMonths` pentru tab-ul Taxe. `ContractView` are acum `taxes`; `fromContract` primește partea cealaltă (nume, tip, CUI), iar ambele primesc `TaxProfile`. Lista provizorie de culturi cu taxare inversă e în date, `DE-VERIFICAT` (#47). Rămân: CASS-ul proprietarului (nu-l socotim, docs/15 §4), taxele pe salarii (C3).
- [x] **Pasul 4.** Baza de date și API-ul
  - **Făcut (2026-11-18):** migrația `048_contracts.sql` (aplicată pe Supabase): `parties` (firmă cu CUI sau persoană, fără CNP și IBAN), `contracts` (cu `area_ari` și decizia), `contract_payments` (în ordinea scrisă, înlocuite întregi prin `replace_contract_payments`), `decision` + `decided_on` pe `lease_contracts`, `transactions.contract_id`. Cheile străine sunt pe (id, farmer_id), deci nimic nu trece de la o fermă la alta. Proprietarul și managerul scriu, contabilul doar citește, muncitorul nu vede nimic; nimeni nu șterge o parte sau un contract. API: `POST/PUT /api/parties`, `/api/parties/:id/archive` (arhivează și contractele ei), `POST/PUT /api/contracts`, `/api/contracts/:id/archive`, `/api/contracts/:id/decide` (contract sau arendă, doar deciziile care se potrivesc tipului; `null` o retrage). Adăugatul e o singură dată pe `clientId`, iar trimis din nou rescrie plățile. Contractele vin cu ferma în `/api/me`. Teste: `apps/api/src/contracts.test.ts`, `tests/integration/contracts.test.ts` (10, verzi). Restul suitei de integrare are aceleași 45 de teste roșii ca la commit-ul `227d6aa`, fără legătură cu contractele (API-ul restaurat e în urma bazei: `getMyFarm` pe o singură fermă, `set_envelopes`, rutele cu `X-Farm-Id`).
- [x] **Pasul 5.** Contractele în plan
  - **Făcut (2026-11-18):** planul are intrări noi: `contract_in`, `contract_out` (banii cu partea cealaltă, în zilele lor, cât timp contractul merge: reînnoiri, decizii, arhivare) și `contract_tax` (TVA-ul care merge cu factura, decontul 300 pe 25, impozitul micro). Tonele unei vânzări cu preț ies din vânzarea la piață a recoltei lor; o livrare fără preț rămâne în prognoză la prețul pieței. Grâul dat în natură scade vânzarea culturii, ca arenda în natură; ce nu acoperă vânzarea e de cumpărat. O vânzare sau o cheltuială înregistrată cu `contractId` (`/api/sales`, `/api/expenses`, verificat înainte de salvare: `unknown_contract`) ia banii planificați ai contractului din luna ei. Forma fermei și TVA-ul nu vin încă cu ferma (`tax_profile`): până atunci, TVA-ul pe ce plătește ferma intră ca un cost (partea sigură), iar TVA-ul pe vânzări și impozitul micro nu intră în plan. `contractImpact` (`contracts/impact.ts`): pe anul agricol (bani intrați, ieșiți, taxe, partea din banii fermei), salariul cu și fără contract, ce mai e de plătit până la sfârșit (în plan) și, la arenda luată, ce rămâne pe hectar după arendă și impozit. Migrația 048 dă voie să se scrie doar `contract_id` pe o tranzacție (reaplicată). Merge fără internet: totul e pur, din fermă.
- [x] **Pasul 7.** Contractele pe toate fermele
  - **Făcut (2026-11-19), varianta mică:** codul de acum ține o singură fermă pe telefon (fără `/ferme`, `farmStore`, `X-Farm-Id`), așa că totalurile vin doar de pe server. Pur: `packages/shared/src/contracts/farm.ts` (vederile, „De hotărât”, capul paginii, mutate din `web/lib/cc/contracts.ts`) și `totals.ts` (`farmContractsSummary`: în vigoare, bani primiți și plătiți în lunile planului, bani la stat, ha luate și date în arendă, proprietari, de hotărât în 90 de zile, taxele pe luni; `sumFarms`; un proprietar pe două ferme se numără de două ori, C5). API: `GET /api/farms/contracts-summary` peste `my_farms()`, fără muncitori; contabilul vede contractele, dar nu arenda și forma fermei (`arenda: false`); o fermă care nu se poate citi apare în `missing`. Web: pe Contracte, „Doar ferma asta / Toate fermele”, doar cu 2+ ferme și cu internet (`AllFarms.tsx`); totalul spune că taxele sunt pe fiecare fermă (C7). Migrația 049 aplicată pe 19 nov. Rămân: secțiunea de pe `/ferme` și totalul fără internet, după ce revine stocarea pe fermă.
- [x] **Pasul 8.** Contractul din poză
  - **Făcut (2026-11-19), varianta mică:** pe Contracte, „Adaugă un contract” → „Citește-l din poză” (aceleași poze pagină cu pagină, același acord și aceeași limită pe zi ca la celelalte hârtii). `POST /api/documents/read-contract` (`apps/api/src/ai/contract.ts`) citește felul, părțile cu rolul lor, datele, reînnoirea, preavizul, plățile (cine plătește), cultura și tonele; `normalizeContractPaper` (`contracts/paper.ts`) verifică fiecare valoare și scoate CNP-ul și IBAN-ul. Fermierul spune care parte e ferma lui, iar de aici vin sensul banilor și cealaltă parte (găsită printre cele salvate după CUI sau nume). Fiecare câmp citit e marcat și trebuie confirmat („E bine”) sau schimbat înainte de „Adaugă contractul”. Sumele pe hectar se înmulțesc cu hectarele de pe hârtie, banii se rotunjesc la leu, iar fermierul vede o notă pentru fiecare. O hârtie de arendă e trimisă la Arendă. Poza nu se păstrează și nu se scrie nimic în `document_proposals`. Fără internet butonul e oprit (`PAPER_OFFLINE`).
- [x] **Pasul 9.** Contractele în „Întreabă”
  - **Făcut (2026-11-19):** asistentul are patru unelte noi de citit. `list_contracts` arată ce contracte ai și când se termină fiecare („ce expiră anul ăsta”). `get_contract_taxes` arată taxele din contracte pe luni. `get_contract_impact` arată ce face un contract pe an și cum schimbă salariul. `get_contracts_all_farms` adună toate fermele, pe server, cu tokenul fermierului, deci RLS decide ce vede. Arenda plătită pe toate fermele apare în lei (`rentOutBani`) și în kg pe cultură (`rentOutKg`); nu transformăm boabele în lei. Asistentul poate propune ca un card de confirmat doar „Am hotărât” (`decide_contract`) și mutarea la contractele încheiate (`archive_contract`). Cardul arată felul contractului și cealaltă parte. Contractele noi sau schimbate rămân pe ecranul Contracte, unde le poți citi și din poză. 5 întrebări noi în `test:assistant`, cu un leasing și o asigurare pe ferma lui Ion, **nerulate încă**, pentru că testul costă bani. Fără internet asistentul nu merge oricum. Cele trei unelte pentru o singură fermă rulează și pe telefon.
- [ ] Pasul 6: testele de ecran; vezi `docs/contracts-plan.md` §8.

## De raportat: ce depui la APIA pe trimestru și când (19 nov 2026)

Cifrele și termenele stau doar în JSON (`docs/data/fuel-excise.json`, `docs/data/calendar-2026.json`), fără tabel nou. Detalii în `docs/04-farmer-reports.md` §1.

- [x] Cercetarea: acciza la motorină pe date (HG 1174/2014), plafoanele pe ha, termenele pe trimestru, actele, celelalte obligații (GeoFoto, registrul agricol, deconturile pentru animale, notificările). Ce rămâne nesigur: întrebările 15 și 50–54 din `docs/11-open-questions.md`.
- [x] Cota pe ziua cumpărării în raportul de motorină (`packages/shared/src/reports/fuel.ts`), plafonul pe an, termenele în plan (`repeat_until`, `applies_to`).
- [x] `packages/shared/src/obligations/` + teste.
- [x] Ecranul `/de-raportat` (și pe ferma lui Ion), cardul de pe Acasă, intrarea din „Mai mult”.
- [x] Monitorul: 7 surse noi în `subventii-surse.md`, secțiunea „Obligații de re-verificat” în raportul zilnic.
- [ ] `npm run seed -w subventii-monitor` pe calculatorul cu `.env`-ul monitorului.
