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
| 15 | Acciza la motorină: 2,213 lei/l, trimestrial, acord prealabil până la 20 decembrie, cantitatea maximă pe ha | din brief | APIA, HG pentru motorină | raportul de motorină (`docs/data/fuel-excise.json`, `refund_bani_per_10_l`) |
| 16 | Registrul fitosanitar 3 ani: temeiul legal | din brief | ANF | doar pitch |
| 17 | Mecanismul creditului pe adeverință pentru campania curentă (luat în aprilie pe cererea din 2027) | presupus posibil | comunicatul APIA din 27 mai 2026, ofertele băncilor | exemplul de credit de punte |
| 18 | Valoarea ROBOR 6M (pentru costul creditului) | parametru, fără valoare | BNR | costul creditului de punte |
| 19 | ~~Istoricul pe județ (INS) și „3 din 10 ani proști la porumb” în Teleorman~~ | **Nu mai e nevoie (7 nov 2026):** fondul pentru ani proști a fost scos | — | — |
| 20 | Pilonul III: plafonul de deductibilitate; CEI: plafoanele | neafișate | ASF, Legea 202/2026 | ecranul de pensie |
| 21 | Lunile de cheltuieli și ponderile pe cultură | presupuse (`crops-reference.json`) | un agronom / fermieri reali | forma calendarului |
| 22 | ~~Stripe: conturi conectate RO, payouts în RON, IBAN de test RO~~ | **Rezolvat (7 nov 2026):** merge cu Accounts v2 (recipient, `dashboard=none`, riscul la platformă, confirmat în Platform profile). Detalii în `08-stripe.md` §1b | — | — |
| 23 | Minimul lunar la Pilonul III: AZT Moderato (50 lei, sursă neoficială), Raiffeisen Acumulare (100 lei, pagina n-a putut fi deschisă), Pensia Mea (50 sau 60 lei) | `DE-VERIFICAT` în `pension-funds.json`; 50 lei implicit dacă lipsește | prospectul fiecărui fond, ASF | suma minimă pe ecranul de pensie |
| 24 | CAS opțional prin Declarația Unică după 1 iulie 2026: rămâne 12.150 lei/an? | pitch-ul spune „peste 12.000 lei”; pe `pensie.html` apare cu „de verificat” | ANAF, Casa de Pensii | pitch și „De ce nu Casa de Pensii?” |
| 25 | Îngrășăminte `DE-VERIFICAT` în `fertilizers.json`: YaraRega NK 9-36 („36 % K” e ambiguu: K sau K₂O?) și Timac SynerTech Tomis 1 (fișa dă 17 % N total, dar 17 % N ureic + 0,2 % N nitric; am lăsat doar totalul) | doar N total e folosit la kg N/ha | fișele tehnice de la producător | catalogul și kg N/ha |
| 26 | Limitele de azot sunt doar pentru fermele **fără** studiu agrochimic și pantă ≤ 12 % (Ordinul 333/165/2021, art. 9). Nu știm panta parcelei și dacă fermierul are studiu; culturile din afara tabelului n-au limită | verdict „nu știm” în loc de „ok” când lipsește limita | fermierul (studiu, pantă), APIA/LPIS (panta blocului fizic) | verdictul de pe kg N/ha |
| 27 | Analizele Yara vin de pe paginile din UK/DE/ES (yara.ro nu le publică), iar 13 produse au `sold_in_ro: null` | pot diferi de sacii vânduți în România | Yara România, distribuitori | catalogul |

## B. Presupuneri de produs (decizii luate de noi, editabile)

| # | Presupunerea | De ce |
|---|---|---|
| P1 | Schemele fără istoric folosesc factorii de interval de la BISS (0,900 / 1,011) | E singurul istoric complet. Fără el n-am avea interval. |
| P2 | Avansul e sigur, iar incertitudinea stă doar în sold | Avansul se plătește pe cuantumul de referință deja anunțat. |
| P3 | Data plății pe scenarii: pesimist = ultima zi a ferestrei, mediu = mijlocul, optimist = prima zi | Planul trebuie să țină și în cel mai rău caz. |
| P4 | Un fel de an e definit de recoltă: producția din istoricul INS al județului (ultimele 15 recolte: mediana, media celor mai slabi 3, media celor mai buni 3). Prețul și costurile rămân medii în toți cei trei ani | Între 2011 și 2025, prețurile INS la poarta fermei aproape nu urmează producția pe țară (corelație −0,11 la grâu, −0,31 la porumb, −0,27 la floarea-soarelui, 14 schimbări pe an). Costurile se plătesc înainte să se știe recolta. Mediile sunt de la nivel de județ, deci o fermă poate avea un an mult mai slab. |
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
| P24 | Paginile fără cont (`web/legacy`, fostele pagini din `farm-app/subsidies`) socotesc cu pensia de 200 lei/lună din exemplul din `07-architecture.md` | Așa ies 650 lei salariu sigur și 2.400 lei cu 14.000 lei credit. O fermă autentificată nu folosește exemplul: `buildFarmPlan` ține pensia la 0 până pornește planul de pensie, ca ecranul să arate exact ce plătește Stripe. |
| P25 | Recoltele de după 2027 refolosesc sumele și datele din 2026, iar Recolta 2026 din paginile statice are cifre ilustrative | Avem doar `subsidies-2026.json` și `calendar-2026.json`. Paginile arată „de verificat”, respectiv „date ilustrative”. |
| P26 | Producția și prețul notate de fermier devin anul normal pentru toți anii următori, iar anul bun și cel slab se scalează cu același raport. Costurile rămân mediile | Un singur an notat poate fi neobișnuit. Fermierul îl poate schimba în Recolte. |
| P27 | `sowing_month` din `crops-reference.json` vine din lunile de semănat din `expense_months` (grâu oct., porumb și floarea-soarelui apr.). Timpul până la recoltă se schimbă doar după cultură, nu după soi sau vreme. Un semănat întârziat mută recolta cu aceleași luni | Calendar agricol general, `months_status: DE-VERIFICAT`. |
| P29 | Producția și prețul așteptate, scrise de fermier în „Datele planului”, au prioritate față de cele notate în Recolte și față de medii. Anul bun și cel slab se scalează cu același raport (ca la P26). Costurile pe hectar se pot scrie tot acolo (P31) și sunt aceleași în toți anii. Data plăților APIA rămâne ultima zi a ferestrei și nu se poate schimba (P13) | Fermierul își cunoaște pământul mai bine decât media. Planul trebuie să țină și dacă banii vin târziu. |
| P30 | O cultură adăugată de fermier („Altă cultură” în Recolte) folosește doar cifrele lui: producția, prețul și cheltuielile pe hectar pentru un an normal. Prețul și cheltuielile nu se schimbă de la un an la altul, anul bun e cel normal, iar anul slab e cel scris de fermier sau, dacă lipsește, tot cel normal. Cheltuielile „până la recoltă” se împart egal pe lunile dintre semănat și recoltă, iar vânzarea e în luna recoltei. La APIA o socotim teren arabil | Nu avem date din surse pentru alte culturi, iar fermierul își cunoaște ferma. Formularul rămâne scurt. |
| P31 | Costul pe hectar scris de fermier ține locul mediei, pe tot sezonul, iar împărțirea pe luni rămâne cea din `crops-reference.json`. Costul „din cheltuielile tale” vine din ultima recoltă încheiată și ia doar sămânță, îngrășăminte, tratamente, motorină și lucrări. Cheltuielile pentru toată ferma se împart după hectare. O cheltuială pe o cultură, fără recoltă aleasă, intră la următoarea recoltă a culturii. Un cost mai mic nu mărește un salariu deja stabilit, iar unul mai mare îl scade doar dacă banii n-ar ajunge | Aceste categorii sunt cele care înlocuiesc costul planificat, deci arenda sau reparațiile s-ar număra de două ori. Un sezon neterminat ar arăta un cost prea mic. O cifră estimată nu trebuie să mărească plățile reale. |
| P28 | Grâul din hambar se socotește vândut în prima lună a planului, la prețul notat sau la medie | Nu întrebăm luna vânzării, ca formularul să rămână scurt. Vânzările notate în altă lună decât cea obișnuită scad din hambar. |
| P29 | Limitele pentru sursele fermierilor din `plan-params.json` → `sources`: 25 de surse de fermier, 10 adăugări pe zi, 30 pe adresă IP, 2.000 de pagini în total, 10 MB | Sunt alegeri ale noastre, ca să nu poată fi abuzat serverul. Fără cont, limita pe IP e principala protecție, iar contorul se golește la repornirea API-ului. |
| P30 | Fără cont, lista de surse aparține unei chei din browser. Pe alt aparat nu se vede, iar dacă se șterg datele browserului, lista se pierde | Sign-in-ul a fost lăsat pe mai târziu. Când revine, cheia se poate lega de cont. |
| P31 | Alarma unui termen pus în calendarul telefonului sună cu 7 zile înainte, la 9:00 (`plan-params.json` → `calendar_reminder_days`, `calendar_reminder_hour`). Dacă termenul e mai aproape, sună în ziua de dinainte | Alegere de produs, ca să ajungă fermierul la APIA la timp. N-am întrebat fermieri câte zile le trebuie. |
| P32 | Vârsta citită din CNP-ul de pe cererea de plată se socotește la ziua citirii, nu la o dată de referință a campaniei | Nu am găsit în 03-subsidies.md sau în ghidul APIA la ce dată se verifică „sub 40 de ani” pentru PD-03. DE-VERIFICAT. |
| P33 | Pierderile notate de fermier (hectare nestrânse) se scad din plan doar când producția e a lui (notată în Recolte sau scrisă în Datele planului). Pe producția medie a județului din INS (AGR110A) nu scădem nici procentul lui obișnuit, nici istoricul. O pierdere deja spusă pentru o recoltă se scade mereu, pentru că acele hectare nu mai există | Nu știm dacă „producția medie la hectar” din AGR110A e împărțită la suprafața cultivată (deci include câmpurile pierdute) sau la cea recoltată. DE-VERIFICAT în metodologia INS. Dacă e pe suprafața recoltată, cota se poate scădea peste tot. |
| P-EV1 | Evenimentele lui Ion din `demo-ion.json` → `calendar_events` (rata de 1.500 lei pe lună, revizia combinei de 2.500 lei) sunt exemple de demo | Sunt sume pe care le scrie fermierul, nu cifre oficiale. Le-am ales ca să se vadă cum o sumă din calendar scade salariul. |
| P-EV2 | O sumă din calendar a cărei zi a trecut fără răspuns rămâne în plan, în luna curentă, cel mult 45 de zile (`plan-params.json` → `farmer_events.carry_days`) | Ca să nu dispară o plată doar pentru că fermierul n-a apucat să bifeze. După 45 de zile o socotim uitată. |
| P-EV3 | „E toată recolta” ia locul vânzării estimate a culturii aflate la cel mult 6 luni de ea și e bifat singur când suma e la ±30% de estimare (`farmer_events.whole_harvest_window_months`, `whole_harvest_match_pct`) | Alegere de produs, ca vânzarea fermierului să nu se adune peste cea estimată. |
| P-H1 | Lucrările lui Ion pe parcele (`demo-ion.json` → `plot_work`): arat, semănat pe 10 oct. 2026, erbicid pe 5 nov., insecticid planificat pe 20 nov., azot planificat pe 5 mar. 2027 la grâu; arat pe 10 nov. 2026 și semănat planificat pe 15 apr. 2027 la porumb | Exemple de demo, fără produse și fără sume, ca să se vadă cardul, harta și mementourile. Ziua semănatului e aleasă în luna din `planted_month`. Nu sunt recomandări agronomice. |
| P-H2 | Telefonul ține ultimele 300 de bucăți din harta de bază (`plots-params.json` → `map_tile_cache_max`) | Alegere de spațiu, nu cifră de bani. Ajunge pentru zona unei ferme la câteva niveluri de zoom. De verificat pe un telefon real cât ocupă. |
| P-H3 | O lucrare notată offline odată cu o cheltuială (tratamentul) nu e legată de cheltuială | Cheltuiala are id abia după ce se trimite. Banii pe parcelă se socotesc oricum din `plot_id`, deci cifrele nu se schimbă; lipsește doar legătura de pe card. |
| P-EV4 | „Ce schimbă cel mai mult prognoza” măsoară fiecare sumă scoțând-o din plan și refăcând salariul sigur și punctul cel mai de jos | Arată corect că o sumă venită după luna cea mai grea schimbă puțin salariul. Nu e o sumă a efectelor: rândurile nu se adună. |

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
- **Deploy (făcut pe 8 nov 2026):** front pe Netlify (https://cropcash.netlify.app), API pe VPS-ul Ubuntu, la https://cropcash-api.andreitutea.com (pm2 + Caddy), DB și auth în Supabase. Fără Railway. Detalii în `12-deploy.md`.
- **Login:** obligatoriu la demo. Folosim email + parolă (Supabase).
- **Telefon:** PWA instalabil.
- **Offline:** merge pentru tot ce se poate; ce cere net arată un mesaj (`07-architecture.md` §8).
- **Durata și echipa:** nu influențează documentația.

- **Test Clocks (C4):** confirmat. Salariile le trimite scheduler-ul nostru, care citește data de pe Test Clock.
- **Animalele:** scoase din MVP (onboarding și calcul). Schemele cuplate rămân în JSON cu `enabled: false`, ca plan de viitor. Coloanele `dairy_cows` / `beef_cattle` rămân în DB, cu valoarea implicită 0.
- **Stripe rămâne** (juriul dă puncte în plus pentru folosirea Stripe). Fluxul din `08-stripe.md` e o simulare de demo. Limitarea „APIA nu plătește prin Stripe” e spusă deschis în pitch. Open banking (Salt Edge) e pasul de producție, doar în pitch.
- **Creditul de punte:** varianta A + C. Aplicația spune informativ cât credit îi trebuie și când, fără să numească vreo bancă (A). Fermierul poate introduce și singur un credit pe care îl ia oricum, iar aplicația îl include în plan (C). Riscul legal de intermediere de credit, dacă am numi bănci, e DE-VERIFICAT; de aceea nu numim.

- **Asistentul intră în demo, vocea nu** (7 nov 2026, apoi 8 nov 2026): asistentul scris „Întreabă” e făcut (pașii 9c–9d), cu un buton pe fiecare pagină. Vocea (9e) a fost scoasă la cererea echipei. Decizia rămâne a fermierului: AI-ul nu spune da sau nu și nu refuză.
- **Asistentul, modelul:** `claude-sonnet-5-5` (8 nov 2026). Haiku a greșit sume de 100 de ori la test; Opus e mai scump fără câștig vizibil. Se schimbă din `ANTHROPIC_MODEL`.
- **Asistentul, conversația:** stă în browser, fără tabele pe server; o salvare propusă e un card pe care fermierul îl apasă (`07-architecture.md` §11).
- **Numele funcțiilor din `use-cases.md`** se mapează pe cele din `functions.md`, ca fiecare funcție să aibă o singură definiție.

### Deschise
1. ~~**Domeniul pentru API**~~ **Rezolvat (8 nov 2026):** `cropcash-api.andreitutea.com`, record A în Namecheap spre VPS.
2. **Magazinele de aplicații:** e suficient PWA-ul sau vrem și Play Store / App Store (prin Capacitor, ~0,5–1 zi în plus)?
3. **Vremea, vântul pentru stropit:** `weather.spray_wind_max_kmh` e `null` (DE-VERIFICAT) în `plan-params.json`, până avem o sursă. Până atunci, avertizarea de vânt e oprită.
4. **Vremea, pragul de îngheț:** `weather.frost_min_c` e 0 °C la 2 m, presupunere de produs. Pragul real diferă pe cultură și pe stadiu.
5. **Vremea, licența la lansare:** termenii Open-Meteo trec aplicațiile cu abonamente la uz comercial. Alegem plan plătit sau instanță proprie? Prețurile planurilor nu apar pe pagina de prețuri. Tot de confirmat: dacă putem stoca datele și dacă modelul regional acoperă România.
6. **Lista completă de use case-uri:** `docs/use-cases.md` e un rezumat. Fără cele 50 de cazuri, acoperirea s-a verificat pe grupe, iar etichetele MVP / Should / Later nu se pot compara cu planul.
7. ~~**Vocea, recunoașterea**~~ **Nu mai e nevoie:** vocea a fost scoasă (8 nov 2026).
8. ~~**Vocea, citirea cu voce tare**~~ **Nu mai e nevoie:** la fel.
9. **Notificările:** câte pe săptămână și în ce ore? Merg pe telefoanele fermierilor și pe iPhone, fără instalare? Valorile merg în `plan-params.json`, ca presupuneri.
10. **Asistentul, costul:** limita e acum 5 mesaje pe zi pentru un fermier (de la 9 nov 2026; înainte 40) (`ASSISTANT_DAILY_LIMIT`), o presupunere. Costul real pe mesaj n-a fost măsurat.
11. **Actele necesare:** lista pentru fiecare termen cere o sursă oficială. Până atunci, `documents_ro` e `null` (DE-VERIFICAT).
12. **Vânzarea mai târziu:** lipsesc prețurile pe luni și costul depozitării. Până atunci, răspunsul arată doar când vin banii.
13. **Pensia sărită o lună:** merge așa la Pilonul III sau la CEI? În demo e o simulare.
14. **Hârtiile APIA:** n-am avut o cerere unică sau o decizie de plată reală. Câmpurile citite (hectarele pe cultură, suma totală, anul campaniei) sunt presupuneri. Trebuie testat pe hârtii reale, mai ales o decizie care arată doar avansul. Din 14 nov 2026, cererea dă și numele, vârsta (din CNP) și județul, iar culturile se potrivesc după codul APIA (vezi `docs/cerere-onboarding-plan.md`). Nici acestea n-au fost testate pe o cerere reală.
15. **PD-28, pragul pentru 2026:** `unproductive_pct >= 2` vine din regulile campaniei 2025 ([agrointel](https://agrointel.ro/wp-content/uploads/2025/02/Informare-privind-PD-28-agrointeligenta.pdf)). De verificat în ghidul și ordinul MADR pentru 2026. Tot de verificat: condițiile pentru pârloagă din Ordinul MADR nr. 106/2024 (inclusiv fotografiile prin GeoFoto).
16. **PD-28, cuantumul 2026:** necunoscut. Aplicația arată ca estimare suma stabilită în 2025 (32,9366 €/ha), separat, fără s-o pună în total. Proiectul de majorare la 40,2089 €/ha nu e folosit.
17. ~~**Teren necultivat, codul APIA**~~ **Rezolvat (14 nov 2026):** e 970, TEREN NECULTIVAT (MO 193 bis/2026, Anexa 1, Tabel nr. 1, p. 204). E în `apia_codes` din `crops-reference.json`.
18. **Teren necultivat la diversificare (PD-04):** îl numărăm ca o cultură separată (decizia echipei, 14 nov 2026). De confirmat în regulile PD-04 pentru 2026.
19. **Diversificarea se socotește pe gen botanic:** formularul APIA (MO 193 bis/2026, II.B.b, „Genul botanic al culturii preponderente”) numără culturile după gen, iar aplicația face la fel (`diversificationKeyOf`, `packages/shared/src/data/catalogue.ts`). Grâu comun și grâu dur, de toamnă și de primăvară, sunt toate Triticum, deci o singură cultură. Ce n-are gen în Tabel nr. 1 (amestecuri, „Alte …”, teren necultivat) se numără singur. De confirmat dacă APIA desparte culturile de toamnă de cele de primăvară din același gen.
20. **Cifre pentru culturile noi din catalog:** doar grâul, porumbul și floarea soarelui au cost, producție și preț (capital.ro). Celelalte coduri APIA sunt în catalog fără cifre, iar fermierul și le scrie în Recolte. Ce am găsit pe 14 nov 2026, nefolosit încă, pentru că nu e un set întreg dintr-o sursă și lipsesc lunile:
    - Producții medii naționale 2025 (provizorii), INS, [Producția vegetală la principalele culturi în anul 2025](https://insse.ro/cms/sites/default/files/field/publicatii/productia_vegetala_la_principalele_culturi_in_anul_2025.pdf), Tabel 3: rapiță 2.863, orz și orzoaică 4.864, soia 2.190, ovăz 2.408, secară 3.024, mazăre boabe 1.590, sfeclă de zahăr 42.739, cartofi 15.128 kg/ha. O singură valoare pe cultură, nu un interval.
    - Prețuri pentru arendă 2025, DAJ Alba ([alba24](https://alba24.ro/preturile-medii-la-principalele-produse-agricole-pe-baza-carora-se-calculeaza-veniturile-din-arenda-in-anul-2025-in-alba-lista-1061616.html)): rapiță 1,80, orz 0,70, orzoaică 0,78, soia 1,85, ovăz 0,80, triticale 0,77, cartofi 2,40 lei/kg. Prețuri pentru arendă, într-un județ, nu prețuri de piață.
    - O singură fermă, doar costuri directe, [Revista Ferma, 12.07.2026](https://revista-ferma.ro/rapita-a-dat-productii-spectaculoase-in-ferma-lui-alexandru-simon-dar-orzul-e-cea-mai-profitabila-cultura-in-2026-nu-mai-cultiva-porumb-de-4-ani-si-nici-floarea-soarelui-de-3-ani/): rapiță 2.600–2.700 lei/ha, 2,5–4,8 t/ha, 2,40–2,55 lei/kg; orz ~1.800 lei/ha.
    De hotărât: ce sursă e destul de bună ca rapița, orzul sau soia să intre în plan cu cifre din docs/data. Lunile de semănat și recoltă lipsesc pentru toate.
21. **Arenda, formularul și rotunjirea:** în ce formular declară arendașul impozitul reținut pe arendă (presa spune D100) și dacă suma se rotunjește la leu. Aplicația rotunjește la ban (`rentTax`, `docs/15-arenda.md` §3). Tot de citit: că pentru arendă nu se depune formularul 205.
22. **Arenda doar în produse, impozitul:** cum reține arendașul 10% când nu plătește bani. Aplicația arată doar suma; contabilul hotărăște (`docs/15-arenda.md` §3). În plan (pasul 8), presupunerea e că proprietarul primește cu atât mai puține kg cât face impozitul (la prețul județului), iar ferma plătește impozitul în lei și vinde kg-urile oprite (`arenda/schedule.ts`).
23. **Arenda și registrul agricol:** APIA cere adeverința din registrul agricol (MO 193 bis/2026, p. 132–133). Că un contract înregistrat la consiliul local (Codul civil art. 1838) apare în registrul agricol n-a fost citit în legea registrului agricol (`docs/15-arenda.md` §2).
24. **Arenda, CASS-ul proprietarului:** arendașul reține CASS-ul când venitul net de la el e de cel puțin 6 salarii minime (Codul fiscal art. 174^1). Aplicația nu îl calculează. De confirmat salariul minim folosit pe 2026 și dacă trebuie spus și pe contractele mici (`docs/15-arenda.md` §4).
25. **Arenda, prețurile pe județ:** în `arenda-prices-2026.json` sunt citite doar Teleorman, Olt, Covasna, Caraș-Severin și Ialomița (din 1 aug 2026, din presă). Celelalte 37 sunt `null`, iar fermierul scrie prețul. Giurgiu (HCJ 280/2025) refuză descărcarea; Călărași s-a schimbat pe 30 iunie 2026.
