# 11. Întrebări deschise

## A. Cifre DE-VERIFICAT

| # | Ce | Valoarea folosită acum | Unde se verifică | Impact |
|---|---|---|---|---|
| 1 | Cursul 2026: FEGA e 5,2788 (BCE, 30 sept 2026); lipsesc FEADR și confirmarea din anunțul APIA | FEADR: parametru 5,2788 | anunțul APIA | sumele FEADR |
| 2 | Pragul CRISS (1–50 ha, la 51 ha se pierde tot) | aplicat | textul PS PAC 2023–2027 | eligibilitatea PD-02 |
| 3 | PD-05: cuantumul de 100 €, avansul de 75 €, plafonul de 10 ha (al fermei sau al suprafeței plătite?) | ferma ≤ 10 ha | PS PAC / APIA 2026 | fermele mici |
| 4 | PD-28: cuantumul 2026 | exclus din calcul | APIA 2026 | — |
| 5 | Cuplat: vaci de lapte 347,81 €/cap, vită de carne 244,72 €/cap, condiții | aplicat dacă are animale | APIA 2026 | fermele cu animale |
| 6 | PD-03: condițiile complete (prima instalare, plafon de ha) | doar vârsta < 40 | PS PAC | tinerii fermieri |
| 7 | BISS: ferma minimă de 1 ha și parcela de 0,3 ha | aplicat | PS PAC | — |
| 8 | PD-04 peste 30 ha: condițiile de diversificare | fără condiție suplimentară | PS PAC / agrointel | fermele de 30–50 ha |
| 9 | Fondul FEGA pentru toate schemele din Pilonul I | FEGA | PS PAC | cursul aplicat |
| 10 | Cursurile 2025 (5,0806 / 4,9743): sursa URL | fără URL | APIA | — |
| 11 | Istoricul cuantumurilor PD-02–PD-05 | se folosesc factorii BISS | APIA, anii 2023–2025 | lățimea intervalului |
| 12 | BISS 2023 (97,57): sursa URL | din brief | APIA | intervalul |
| 13 | Norma de venit pentru Teleorman, cereale (Vrancea 237 lei/ha e doar exemplu) | — | DGRFP / hotărârea Consiliului Județean | impozitul lui Ion |
| 14 | Pragurile de scutire de la norma de venit și CASS pe venitul agricol | ignorate | Codul fiscal 2026 | impozitul |
| 15 | Acciza la motorină: 2,213 lei/l, trimestrial, acord prealabil până la 20 decembrie, cantitatea maximă pe ha | din brief | APIA, HG pentru motorină | raportul de motorină |
| 16 | Registrul fitosanitar 3 ani: temeiul legal | din brief | ANF | doar pitch |
| 17 | Mecanismul creditului pe adeverință pentru campania curentă (luat în aprilie pe cererea din 2027) | presupus posibil | comunicatul APIA din 27 mai 2026, ofertele băncilor | exemplul de credit de punte |
| 18 | Valoarea ROBOR 6M (pentru costul creditului) | parametru, fără valoare | BNR | costul creditului de punte |
| 19 | ~~Istoricul pe județ (INS) și „3 din 10 ani proști la porumb” în Teleorman~~ | **Nu mai e nevoie (7 nov 2026):** fondul pentru ani proști a fost scos | — | — |
| 20 | Pilonul III: plafonul de deductibilitate; CEI: plafoanele | neafișate | ASF, Legea 202/2026 | ecranul de pensie |
| 21 | Lunile de cheltuieli și ponderile pe cultură | presupuse (`crops-reference.json`) | un agronom / fermieri reali | forma calendarului |
| 22 | ~~Stripe: conturi conectate RO, payouts în RON, IBAN de test RO~~ | **Rezolvat (7 nov 2026):** merge cu Accounts v2 (recipient, `dashboard=none`, riscul la platformă, confirmat în Platform profile). Detalii în `08-stripe.md` §1b | — | — |
| 23 | Minimul lunar la Pilonul III: AZT Moderato (50 lei, sursă neoficială), Raiffeisen Acumulare (100 lei, pagina n-a putut fi deschisă), Pensia Mea (50 sau 60 lei) | `DE-VERIFICAT` în `pension-funds.json`; 50 lei implicit dacă lipsește | prospectul fiecărui fond, ASF | suma minimă pe ecranul de pensie |
| 24 | CAS opțional prin Declarația Unică după 1 iulie 2026: rămâne 12.150 lei/an? | pitch-ul spune „peste 12.000 lei”; pe `pensie.html` apare cu „de verificat” | ANAF, Casa de Pensii | pitch și „De ce nu Casa de Pensii?” |

## B. Presupuneri de produs (decizii luate de noi, editabile)

| # | Presupunerea | De ce |
|---|---|---|
| P1 | Schemele fără istoric folosesc factorii de interval de la BISS (0,900 / 1,011) | E singurul istoric complet. Fără el n-am avea interval. |
| P2 | Avansul e sigur, iar incertitudinea stă doar în sold | Avansul se plătește pe cuantumul de referință deja anunțat. |
| P3 | Data plății pe scenarii: pesimist = ultima zi a ferestrei, mediu = mijlocul, optimist = prima zi | Planul trebuie să țină și în cel mai rău caz. |
| P4 | Anul de secetă: producție minimă, preț mediu, costuri maxime | Prețul tinde să nu scadă când scade producția. |
| P5 | ~~Fondul de risc: 10% din fiecare încasare până la țintă~~ | **Scos pe 7 nov 2026.** Salariul nu mai pune nimic deoparte pentru un an slab. |
| P6 | Randamentele pentru pensie: 2% / 4% / 6% | Doar ilustrativ; spunem explicit că nu e consultanță. |
| P7 | Contribuția de pensie sugerată: 5% din salariu, rotunjită în jos la 50 lei, dar cel puțin minimul fondului ales (50 lei fără fond) | Ca să nu sperie, dar nici să nu sugereze 0 sau o sumă pe care fondul o refuză. |
| P8 | Salariul se rotunjește în jos la 50 lei, creditul în sus la 100 lei | Sume ușor de reținut. |
| P9 | Persona Ion: 8 ha grâu + 7 ha porumb, sold de 35.000 lei la 1 noiembrie 2026 | 2 culturi îl fac eligibil PD-04 și dau un exemplu realist. |
| P10 | „Medie” în `crops-reference.json` = mijlocul intervalului din sursă | Sursa dă doar intervale. |
| P11 | Cheltuielile și vânzările se pun pe 15 ale lunii | Nu avem date pe zile. |
| P12 | Termenele APIA pentru 2027 = cele din 2026 + 1 an, marcate „estimat” | Nu sunt anunțate. |
| P13 | Calendarul folosește implicit sume „an normal” și plăți APIA în ultima zi a ferestrei | Planul trebuie să țină și dacă banii vin târziu. |
| P14 | Creditul pe adeverință e disponibil din luna în care se deschide următoarea cerere APIA (martie) | Adeverința se eliberează după depunerea cererii. DE-VERIFICAT cu băncile. |
| P15 | Dobânda creditului nu intră încă în calcul; rambursarea = suma luată | ROBOR 6M lipsește (#18). |
| P17 | La „dăm timpul înainte”, realitatea e simulată cu anul normal și plăți la mijlocul ferestrei (mai devreme decât planul prudent) | Arată că planul ține și când banii vin altfel decât socotit. |
| P18 | Pensia din demo se plătește cu card de test, nu din soldul fermierului; salariul doar din banii ajunși prin Stripe (APIA și, din pasul 9, creditul declarat, simulat ca plată în contul CropCash) | Simplificări de demo, vezi 08-stripe.md §1c. În realitate creditul intră în banca fermierului. |
| P22 | Salariul se fixează când fermierul acceptă planul („Bine așa” sau un credit) și se plătește `min(fix, salariul sigur)` | Un salariu care urcă singur lună de lună (fereastra de 12 luni prinde avansul de anul viitor) ar fi derutant; scăderea rămâne, ca să nu rămână fără bani. |
| P16 | ~~Cota pentru fondul de risc se ia doar din venituri~~ | **Scos pe 7 nov 2026**, odată cu fondul. |
| P19 | Pensia: vârsta țintă 65 de ani; suma de la 65 de ani se arată împărțită pe 10 ani („vreo 245 lei pe lună”); slider 50–500 lei, pas 10 lei | Ilustrare simplă, nu o anuitate reală (05 §4). Toate în `plan-params.json` → `pension`. |
| P20 | ~~„X din 10 ani proști” din istoricul INS~~ | **Scos pe 7 nov 2026**, odată cu fondul. |
| P21 | Proiecția pe 3 ani (trimestre) și cursorul de 1–10 ani din Prognoză repetă prețurile, costurile și subvențiile de acum în fiecare an, iar scenariul ales (bun / normal / secetă) se aplică tuturor anilor | Nu avem prognoze de preț sau cuantumuri pentru 2027–2028. Istoricul INS și Open-Meteo nu sunt încă integrate (#19). |
| P22 | Ion e persoană fizică, nu PFA | Persona nu spune. Contează la finanțări: DR-12 și DR-14 nu acceptă persoane fizice. |
| P23 | Lunile grele se calculează din plan: pentru Ion, martie–mai 2027, cu cel mai jos sold cam 7.800 lei în mai | Costurile din `crops-reference.json` încep în martie, iar soldul pornește de la 35.000 lei (P9), deci Ion nu ajunge pe minus. Fără salariul din plan. |
| P24 | Paginile statice din `farm-app/subsidies` socotesc cu pensia de 200 lei/lună din exemplul din `07-architecture.md` | Așa ies 650 lei salariu sigur și 2.400 lei cu 14.000 lei credit. O fermă autentificată nu folosește exemplul: `buildFarmPlan` ține pensia la 0 până pornește planul de pensie, ca ecranul să arate exact ce plătește Stripe. |
| P25 | Recoltele de după 2027 refolosesc sumele și datele din 2026, iar Recolta 2026 din paginile statice are cifre ilustrative | Avem doar `subsidies-2026.json` și `calendar-2026.json`. Paginile arată „de verificat”, respectiv „date ilustrative”. |
| P26 | Producția și prețul notate de fermier devin anul normal pentru toți anii următori, iar anul bun și cel slab se scalează cu același raport. Costurile rămân mediile | Un singur an notat poate fi neobișnuit. Fermierul îl poate schimba în Recolte. |
| P27 | `sowing_month` din `crops-reference.json` vine din lunile de semănat din `expense_months` (grâu oct., porumb și floarea-soarelui apr.). Timpul până la recoltă se schimbă doar după cultură, nu după soi sau vreme. Un semănat întârziat mută recolta cu aceleași luni | Calendar agricol general, `months_status: DE-VERIFICAT`. |
| P29 | Producția și prețul așteptate, scrise de fermier în „Datele planului”, au prioritate față de cele notate în Recolte și față de medii. Anul bun și cel slab se scalează cu același raport (ca la P26), iar costurile rămân mediile. Data plăților APIA rămâne ultima zi a ferestrei și nu se poate schimba (P13) | Fermierul își cunoaște pământul mai bine decât media. Planul trebuie să țină și dacă banii vin târziu. |
| P30 | O cultură adăugată de fermier („Altă cultură” în Recolte) folosește doar cifrele lui: producția, prețul și cheltuielile pe hectar pentru un an normal. Prețul și cheltuielile nu se schimbă de la un an la altul, anul bun e cel normal, iar anul slab e cel scris de fermier sau, dacă lipsește, tot cel normal. Cheltuielile „până la recoltă” se împart egal pe lunile dintre semănat și recoltă, iar vânzarea e în luna recoltei. La APIA o socotim teren arabil | Nu avem date din surse pentru alte culturi, iar fermierul își cunoaște ferma. Formularul rămâne scurt. |
| P28 | Grâul din hambar se socotește vândut în prima lună a planului, la prețul notat sau la medie | Nu întrebăm luna vânzării, ca formularul să rămână scurt. Vânzările notate în altă lună decât cea obișnuită scad din hambar. |
| P29 | Limitele pentru sursele fermierilor din `plan-params.json` → `sources`: 25 de surse de fermier, 10 adăugări pe zi, 30 pe adresă IP, 2.000 de pagini în total, 10 MB | Sunt alegeri ale noastre, ca să nu poată fi abuzat serverul. Fără cont, limita pe IP e principala protecție, iar contorul se golește la repornirea API-ului. |
| P30 | Fără cont, lista de surse aparține unei chei din browser. Pe alt aparat nu se vede, iar dacă se șterg datele browserului, lista se pierde | Sign-in-ul a fost lăsat pe mai târziu. Când revine, cheia se poate lega de cont. |

## C. Contradicții găsite

| # | Contradicția | Rezolvare |
|---|---|---|
| C1 | Brief-ul vechi: „~800.000 de cereri” vs. 671.334 (economedia, 2026) | Folosim 671.334. |
| C2 | Promptul spune `data/subsidies-2026.json` în §4 și `docs/data/` în §7 | Folosim `docs/data/`. |
| C3 | Lista de status-uri (`confirmat-2026`, `din-2025`, `din-2024`, `DE-VERIFICAT`) nu acoperă datele din 2020 și din brief | Am adăugat `din-2020` și `din-brief`. |
| C4 | Promptul spune „Test Clocks: arătăm live cum se execută salariile”, dar Test Clocks nu declanșează payouts | Folosim un scheduler propriu, declanșat de `test_clock.ready` (vezi `08-stripe.md` §4). **Cer confirmare.** |
| C5 | `docs/source/` nu există, deci n-am putut compara cu PDF-ul challenge-ului și cu brief-urile | De verificat când sunt adăugate. |

## D. Decizii

### Luate
- **Deploy:** front pe Netlify, API pe un VPS RareCloud, DB și auth în Supabase. Fără Railway.
- **Login:** obligatoriu la demo. Folosim email + parolă (Supabase).
- **Telefon:** PWA instalabil.
- **Offline:** merge pentru tot ce se poate; ce cere net arată un mesaj (`07-architecture.md` §8).
- **Durata și echipa:** nu influențează documentația.

- **Test Clocks (C4):** confirmat. Salariile le trimite scheduler-ul nostru, care citește data de pe Test Clock.
- **Animalele:** scoase din MVP (onboarding și calcul). Schemele cuplate rămân în JSON cu `enabled: false`, ca plan de viitor. Coloanele `dairy_cows` / `beef_cattle` rămân în DB, cu valoarea implicită 0.
- **Stripe rămâne** (juriul dă puncte în plus pentru folosirea Stripe). Fluxul din `08-stripe.md` e o simulare de demo. Limitarea „APIA nu plătește prin Stripe” e spusă deschis în pitch. Open banking (Salt Edge) e pasul de producție, doar în pitch.
- **Creditul de punte:** varianta A + C. Aplicația spune informativ cât credit îi trebuie și când, fără să numească vreo bancă (A). Fermierul poate introduce și singur un credit pe care îl ia oricum, iar aplicația îl include în plan (C). Riscul legal de intermediere de credit, dacă am numi bănci, e DE-VERIFICAT; de aceea nu numim.

- **Asistentul și vocea intră în demo** (7 noiembrie 2026): pașii 9c–9e sunt în minimul din `10-plan.md`. Asistentul se deschide de la un buton de microfon de pe fiecare tab, iar navigația rămâne la 4 taburi. Decizia vine după ce fermierul vede cifrele: AI-ul nu spune da sau nu și nu refuză.
- **Numele funcțiilor din `use-cases.md`** se mapează pe cele din `functions.md`, ca fiecare funcție să aibă o singură definiție.

### Deschise
1. **Domeniul pentru API:** ce (sub)domeniu pointăm spre VPS? E necesar pentru HTTPS.
2. **Magazinele de aplicații:** e suficient PWA-ul sau vrem și Play Store / App Store (prin Capacitor, ~0,5–1 zi în plus)?
3. **Vremea, vântul pentru stropit:** `weather.spray_wind_max_kmh` e `null` (DE-VERIFICAT) în `plan-params.json`, până avem o sursă. Până atunci, avertizarea de vânt e oprită.
4. **Vremea, pragul de îngheț:** `weather.frost_min_c` e 0 °C la 2 m, presupunere de produs. Pragul real diferă pe cultură și pe stadiu.
5. **Vremea, licența la lansare:** termenii Open-Meteo trec aplicațiile cu abonamente la uz comercial. Alegem plan plătit sau instanță proprie? Prețurile planurilor nu apar pe pagina de prețuri. Tot de confirmat: dacă putem stoca datele și dacă modelul regional acoperă România.
6. **Lista completă de use case-uri:** `docs/use-cases.md` e un rezumat. Fără cele 50 de cazuri, acoperirea s-a verificat pe grupe, iar etichetele MVP / Should / Later nu se pot compara cu planul.
7. **Vocea, recunoașterea:** merge româna din browser pe un telefon ieftin, cu semnal slab și zgomot? Dacă nu, ce serviciu pe server alegem și cu ce cost?
8. **Vocea, citirea cu voce tare:** ce telefoane au voce românească? Ce facem pe celelalte, în afară de text?
9. **Notificările:** câte pe săptămână și în ce ore? Merg pe telefoanele fermierilor și pe iPhone, fără instalare? Valorile merg în `plan-params.json`, ca presupuneri.
10. **Asistentul, costul:** câte mesaje pe zi pentru un fermier? Limita merge în configurație.
11. **Actele necesare:** lista pentru fiecare termen cere o sursă oficială. Până atunci, `documents_ro` e `null` (DE-VERIFICAT).
12. **Vânzarea mai târziu:** lipsesc prețurile pe luni și costul depozitării. Până atunci, răspunsul arată doar când vin banii.
13. **Pensia sărită o lună:** merge așa la Pilonul III sau la CEI? În demo e o simulare.
14. **Hârtiile APIA:** n-am avut o cerere unică sau o decizie de plată reală. Câmpurile citite (hectarele pe cultură, suma totală, anul campaniei) sunt presupuneri. Trebuie testat pe hârtii reale, mai ales o decizie care arată doar avansul.
