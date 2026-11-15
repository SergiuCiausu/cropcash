# Rapoarte PDF (fermier, contabil, administratori)

> Status: **fazele 1, 2 și 3 făcute (14 nov 2026).** Toate deciziile din §9 sunt luate (vezi acolo). Exportul CSV rămâne pentru mai târziu.
> Extinde `docs/04-farmer-reports.md` (care avea doar motorina în plan) și pasul 10a din `docs/10-plan.md`.

## 1. Ce vrem

Un buton „Descarcă raportul” care face un **PDF** din datele fermei și îl salvează pe telefon (sau îl dă mai departe prin meniul de partajare). Rapoartele sunt pentru trei cititori:

| Cititor | Ce îi trebuie | Ton |
|---|---|---|
| **Fermierul** | ce a intrat, ce a ieșit, ce urmează, cât îi rămâne, pe înțelesul lui | limbaj simplu, cifre rotunde, fără jargon |
| **Contabilul** | liste complete și exacte: fiecare vânzare și cheltuială cu dată, categorie, document, totaluri pe lună/trimestru/an, subvenții încasate | tabele dense, sume la ban, fără explicații |
| **Alți administratori** (asociat, bancă la credit, APIA/primărie, consultant) | rezumate oficiale: suprafețe pe cultură, registre obligatorii, situația pentru credit | formal, cu antet și semnătură |

## 2. Catalogul de rapoarte

Fiecare raport = un **id**, un **cititor**, o **perioadă** și o funcție pură care construiește modelul lui.

| Id | Raport | Cititor | Date din | Faza |
|---|---|---|---|---|
| `farm-summary` | Rezumatul fermei pe an / pe sezon: intrări, ieșiri, rămas, salariu plătit, pensie, plăți APIA așteptate | fermier | `transactions`, `payouts`, plan (`buildFarmPlan`), `envelopes`, `pension_plans` | 1 |
| `ledger` | Registrul încasărilor și plăților (toate vânzările + cheltuielile, pe lună, cu totaluri pe categorie) | contabil | `transactions` (`kind`, `category`, `crop_id`, `plot_id`, `note`, `harvest_year`) | 1 |
| `subsidies-received` | Subvenții APIA încasate vs. așteptate, pe schemă | contabil, fermier | `transactions` cu `expected_payment_id`, `expected_payments`, `apia_decision` | 1 |
| `crop-margins` | Costuri și venituri pe cultură / pe parcelă (lei/ha) | fermier, consultant | `transactions` + `plot_seasons` (împărțirea pe suprafață din `packages/shared/src/plots`) | 2 |
| `fuel-excise` | Situația centralizatoare a accizei la motorină, pe trimestru (vezi 04 §1) | contabil, APIA | `fuel_logs` (tabelul există, nu e folosit încă) | 2 |
| `phyto-register` | Registrul de tratamente fitosanitare (04 §2) | inspecție / APIA | `plot_operations` (herbicide, fungicide, insecticide) | 2 |
| `land-summary` | Suprafețe pe cultură și pe parcelă, pentru registrul agricol (04 §4) | primărie | `plots`, `plot_seasons` | 2 |
| `credit-file` | Situația pentru bancă: venituri pe 3 ani, plăți APIA viitoare, credite | bancă | plan + istoric | 3 |

Faza 1 = ce cer toți (fermier + contabil). Faza 2 = registrele din 04. Faza 3 = după ce avem roluri (§6).

## 3. Arhitectura (recomandare)

**PDF-ul se face pe telefon, nu pe server.**

De ce:
- Merge **offline** și pe **ferma lui Ion** (`/ferma-lui-ion/*` nu cheamă API-ul). Regula din 07 §8: tot ce se poate calcula pe telefon, se calculează pe telefon.
- Datele sunt deja pe telefon (`readFarmState` / `farmView` în `web/lib/cc`).
- Fără Chrome/Puppeteer pe VPS-ul RareCloud (greu, ~300 MB RAM pe raport).

Straturile:

```
packages/shared/src/reports/          PUR, testat, fără texte
  period.ts         perioade: lună, trimestru, an calendaristic, an de recoltă (campanie APIA)
  ledger.ts         recordsInPeriod, ledgerOf (totaluri pe lună și pe categorie), subsidiesOf
web/lib/reports/
  build.ts          REPORTS (catalogul) și textele: ledgerReport, subsidiesReport, farmSummaryReport → ReportModel
  model.ts          ReportModel: antet, secțiuni (tabel | rânduri cheie-valoare), note, filigran
  inputs.ts         din FarmState + FarmView (aceleași cifre ca paginile) → makeReport, periodChoices
  pdf.tsx           ReportModel → PDF, încărcat cu import() doar la apăsare; Geist din web/public/fonts
web/lib/ui/share.ts saveFile: meniul de partajare pe telefon, altfel descărcare
web/components/pages/Rapoarte.tsx   ecranul /rapoarte
```

**Regulile proiectului, aplicate:**
- `build/*` primește ferma și `AppData` ca parametri; **nicio cifră hardcodată**, sumele vin în bani (întregi) și se formatează doar la randare, cu `web/lib/cc/format.ts`.
- Un `ReportModel` nu știe de PDF. Același model poate da mai târziu CSV/Excel pentru contabil (cer des asta; vezi §9.4) fără să rescriem logica.
- Cifrele `DE-VERIFICAT` (ex. 2,213 lei/l la motorină) apar în PDF cu mențiunea „sumă estimată, de verificat”, nu ca valori sigure.
- Rapoartele pentru autorități au în subsol: „Document generat de CropCash, nu înlocuiește formularul oficial.” (04 §1: formatul oficial e DE-VERIFICAT.)

**Server (opțional, faza 3):** un `GET /api/reports/:id?period=…` care construiește același `ReportModel` din `packages/shared` (pentru contabil, fără telefonul fermierului). Randarea PDF pe server se face cu aceeași librărie doar dacă e una care merge în Node (§9.1).

## 4. Interfața

- **Unde:** o intrare nouă „Rapoarte” în meniul „Mai mult” (lângă Calendar, Prognoză, Pensie) → ecran nou `/rapoarte`. Plus scurtături contextuale: pe `/bani` „Descarcă registrul”, pe `/subventii` „Descarcă situația subvențiilor”.
- **Ecranul nou** intră în `SCREENS` (`web/screens/index.ts`), primește skeleton în `web/components/skeleton/screens.tsx`, rută în `web/app/rapoarte/` și în `/ferma-lui-ion/rapoarte`. Link-urile prin `appHref`.
- **Flow:** 1) „Pentru cine?” (Pentru mine / Pentru contabil / Pentru alte instituții), 2) raportul, 3) perioada (implicit: anul curent; contabilul: trimestrul trecut), 4) „Descarcă PDF”. Butonul arată „Se pregătește…” (randarea durează 0,5–2 s pe un telefon slab).
- **Offline:** butonul **nu** e `NetButton`, merge fără net. Dacă datele de pe telefon sunt mai vechi de 7 zile, PDF-ul scrie în antet „Date din {data}”, la fel ca bannerul.
- **Ferma lui Ion:** merge, cu un filigran „Exemplu, nu o fermă reală”.
- Texte în română, simple: „Registrul banilor”, nu „Jurnal de încasări și plăți”, pe ecran; titlul din PDF-ul pentru contabil poate fi termenul tehnic.

## 5. Ce date lipsesc pentru contabil

Contabilul are nevoie de **documentul justificativ** pentru fiecare rând. Azi `transactions` are `category`, `note`, `crop_id`, `plot_id`, dar nu are:
- `doc_no` (numărul facturii/bonului),
- `counterparty` (cui ai plătit / cui ai vândut, CUI opțional),
- tipul documentului (factură, bon, contract, chitanță).

Propunere: migrarea `025_transaction_documents.sql` adaugă trei coloane opționale, `ExpenseInputSchema` / `SaleInputSchema` primesc câmpurile opționale, formularul de cheltuială le arată sub „Mai multe detalii”, iar cititorul de hârtii (`ai/documents.ts`) le completează din factura pozată (deja extrage suma și data). Rândurile vechi apar în PDF cu „—”.

## 6. Contabilul și administratorii ca utilizatori (faza 3)

Azi **nu există roluri**: un cont = o fermă (`farmers.user_id`, RLS `farmers_own`). Fazele 1–2 nu au nevoie de asta: fermierul descarcă PDF-ul și îl trimite (WhatsApp, e-mail) prin meniul de partajare.

Dacă vrem ca un contabil să intre singur și să descarce rapoartele mai multor ferme:
- tabel `farm_members (farmer_id, user_id, role in ('accountant','viewer','admin'), invited_by, created_at)`;
- invitație: fermierul scrie e-mailul contabilului → link de invitație (Supabase `inviteUserByEmail` din API, cu cheia de serviciu);
- RLS: politici **doar de citire** pe `transactions`, `plots`, `plot_seasons`, `plot_operations`, `fuel_logs`, `expected_payments` pentru membri; niciun drept pe bani (Stripe, plicuri, pensie);
- un ecran `/contabil` cu lista fermelor și aceleași rapoarte (generate pe server din §3, pentru că telefonul contabilului nu are copia fermei);
- fermierul vede cine are acces și îl poate scoate.

„Administratori” poate însemna și **adminii CropCash** (ex. `CATALOGUE_EDITORS` din `routes/fertilizers.ts`, care așteaptă „un panou de admin cu roluri”). Atunci rapoartele lor sunt agregate pe toate fermele (anonimizate) și țin de acel panou, nu de planul ăsta. De lămurit (§9.3).

## 7. Pași

**Faza 1 (făcută)** — Textele stau în `web/lib/reports`, nu în `packages/shared` (regula din `CLAUDE.md`). Scurtăturile din `/bani` și `/subventii` (pasul 5) nu s-au făcut încă.
1. `packages/shared/src/reports`: `model.ts`, `period.ts`, `catalog.ts` + teste (perioade, an de recoltă vs. an calendaristic, luni fără date).
2. `buildLedger`, `buildFarmSummary`, `buildSubsidiesReceived` + teste pe datele lui Ion (`docs/data/demo-ion.json`): totalurile din PDF = totalurile din `/bani` (test care compară cu `farmView`).
3. Librăria PDF + fontul cu diacritice; `render-pdf.tsx` cu un test care randează fiecare model și verifică că PDF-ul începe cu `%PDF` și conține „ș” în textul extras.
4. `download.ts` (Blob, `navigator.share` cu fallback la `<a download>`); numele fișierului: `cropcash-registru-2026-T3.pdf`.
5. Ecranul `/rapoarte` + skeleton + intrarea din „Mai mult” + scurtăturile din `/bani` și `/subventii`.
6. `sw.js` pune în cache chunk-ul PDF și fontul (verificat offline în avion).
7. Actualizat 04, 07 §8 (tabelul „Ce merge offline”) și `docs/10-plan.md`.

**Faza 2 (făcută)**
8. Migrarea **027** (025 și 026 erau luate): `doc_no`, `counterparty`, `fuel_liters_cl` (litri × 100, întreg) pe `transactions`, doar pe vânzări și cheltuieli. `record_expense` a rămas ca în 024: API-ul scrie câmpurile pe rândul abia creat. În Recolte stau sub „Mai multe detalii” (litrii doar la motorină); merg și în coada offline. Cititorul de hârtii ia doar numărul facturii (`doc_no`); numele firmei nu, pentru că promptul interzice nume în afara solicitantului APIA.
9. `fuel-excise`, `phyto-register`, `land-summary`, `crop-margins`, cu un al treilea grup „Pentru instituții”. **Abatere de la 04:** litrii vin din cheltuielile pe motorină, nu dintr-un ecran separat pe `fuel_logs` (tabelul rămâne nefolosit). Cota stă în `docs/data/fuel-excise.json`, DE-VERIFICAT (întrebarea 15). Tratamentele și parcelele vin de pe hartă (`usePlots`, cu copia de pe telefon); fără parcele pe hartă, raportul de teren arată doar hectarele pe cultură.

**Faza 3 (făcută)**
10. Migrația `028_farm_members.sql`: `farm_members` (rolurile `accountant` și `viewer`) și `farm_invites` (linkuri de o folosință, 7 zile, se ține doar SHA-256 al codului). Intrarea e doar prin `accept_farm_invite`. **Diferență față de §6:** membrii **nu** primesc politici de citire pe tabelele fermei (cu cheia publică ar fi citit toate coloanele, și Stripe); API-ul verifică apartenența ca utilizatorul, apoi citește ferma cu cheia de serviciu (`GET /api/memberships/:id`), fără `stripe_account_id`; „Cineva din fermă” nu vede nici numele oamenilor plătiți. `my_farmer_ids()` a rămas doar a proprietarului, deci toate rutele care scriu îi refuză pe membri. **PDF-ul se face în browserul contabilului** (decizia 2 din nou), din aceeași copie pe care o are telefonul fermierului, cu același cod: cifrele ies la fel (test în `web/lib/members.test.ts`). Invitația pleacă pe WhatsApp (link) și, dacă fermierul scrie adresa, și pe e-mail (Supabase: „Invite user” pentru cont nou, „Magic link” pentru cont existent). Ecranele: „Cine mai vede rapoartele” în `/rapoarte`, `/invitatie?cod=…` și `/contabil` (fără meniul fermierului, merge și fără net din ultima copie). Verificat pe un Postgres local: toate migrațiile, apoi regulile ca proprietar, contabil și străin.
11. Export CSV/XLSX: **amânat** (decizia 4).

## 8. Riscuri

- **Diacriticele:** fonturile standard din PDF (Helvetica) nu au „ș/ț”. Fontul trebuie încorporat (TTF), altfel ies semne de întrebare. Test obligatoriu.
- **Mărimea bundle-ului:** librăriile PDF au 200–600 KB. Se încarcă doar la apăsare (`import()`), nu în paginile obișnuite.
- **Telefoane slabe / iOS:** descărcarea Blob în PWA-ul instalat pe iOS deschide uneori o previzualizare în loc să salveze; `navigator.share({ files })` e calea sigură acolo.
- **Cifre care nu bat cu ecranul:** rapoartele refolosesc exact funcțiile din `packages/shared`, nu recalculează; testul de la pasul 2 păzește asta.
- **Date personale:** registrul zilierilor (04 §3) ar conține CNP-uri; nu intră în plan până nu decidem cum le păstrăm.

## 9. Decizii de luat

1. **Librăria PDF.** Recomandare: `@react-pdf/renderer` (componente React, layout cu flexbox, fonturi încorporate, merge și în Node pentru faza 3). Alternativa ușoară: `pdf-lib` (mai mic, dar tabelele se desenează de mână). Fereastra de print a browserului e exclusă: nu dă un fișier pe Android/iOS în mod sigur.
2. **Pe telefon sau pe server?** Recomandare: pe telefon (offline, ferma lui Ion, zero cost pe VPS).
3. **Cine sunt „alți administratori”?** ✅ Oamenii fermei (asociați, familie, banca): rolul `viewer`, vede rapoartele fermierului. Panoul adminilor CropCash rămâne separat.
4. **Contabilul vrea și Excel/CSV?** ✅ Nu acum: doar PDF.
5. **Faza 3** ✅ Intră acum. Invitația: și link pe WhatsApp, și e-mail. PDF-ul: în browserul contabilului.
