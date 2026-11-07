# 11. Întrebări deschise

## A. Cifre DE-VERIFICAT

| # | Ce | Valoarea folosită acum | Unde se verifică | Impact |
|---|---|---|---|---|
| 1 | Cursul BCE 2026 (FEGA și FEADR, din 30 sept 2026) | parametru 5,28 | BCE / anunțul APIA | toate sumele în lei |
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
| 19 | Istoricul pe județ (INS) și „3 din 10 ani proști la porumb” în Teleorman | date ilustrative | INS Tempo (AGR108A sau similar) | fondul de risc |
| 20 | Pilonul III: plafonul de deductibilitate; CEI: plafoanele | neafișate | ASF, Legea 202/2026 | ecranul de pensie |
| 21 | Lunile de cheltuieli și ponderile pe cultură | presupuse (`crops-reference.json`) | un agronom / fermieri reali | forma calendarului |
| 22 | Stripe: suportul pentru conturi Express cu country RO, payouts în RON și IBAN-ul de test RO | presupus | documentația Stripe, la pasul 6 | arhitectura Stripe |

## B. Presupuneri de produs (decizii luate de noi, editabile)

| # | Presupunerea | De ce |
|---|---|---|
| P1 | Schemele fără istoric folosesc factorii de interval de la BISS (0,900 / 1,011) | E singurul istoric complet. Fără el n-am avea interval. |
| P2 | Avansul e sigur, iar incertitudinea stă doar în sold | Avansul se plătește pe cuantumul de referință deja anunțat. |
| P3 | Data plății pe scenarii: pesimist = ultima zi a ferestrei, mediu = mijlocul, optimist = prima zi | Planul trebuie să țină și în cel mai rău caz. |
| P4 | Anul de secetă: producție minimă, preț mediu, costuri maxime | Prețul tinde să nu scadă când scade producția. |
| P5 | Fondul de risc: 10% din fiecare încasare până la țintă; ținta = venit mediu − venit în anul de secetă; an prost = producție < 80% din media pe 10 ani | Simplu de explicat. |
| P6 | Randamentele pentru pensie: 2% / 4% / 6% | Doar ilustrativ; spunem explicit că nu e consultanță. |
| P7 | Contribuția de pensie sugerată: cel mult 5% din salariu, rotunjită la 50 lei | Ca să nu sperie. |
| P8 | Salariul se rotunjește în jos la 50 lei, creditul în sus la 100 lei | Sume ușor de reținut. |
| P9 | Persona Ion: 8 ha grâu + 7 ha porumb, sold de 35.000 lei la 1 noiembrie 2026 | 2 culturi îl fac eligibil PD-04 și dau un exemplu realist. |
| P10 | „Medie” în `crops-reference.json` = mijlocul intervalului din sursă | Sursa dă doar intervale. |

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
- **Creditul de punte:** varianta A + C. Aplicația spune informativ cât credit îi trebuie și când, fără să numească vreo bancă (A). Fermierul poate introduce și singur un credit pe care îl ia oricum, iar aplicația îl include în plan (C). Riscul legal de intermediere de credit, dacă am numi bănci, e DE-VERIFICAT; de aceea nu numim.

### Deschise
1. **Domeniul pentru API:** ce (sub)domeniu pointăm spre VPS? E necesar pentru HTTPS.
2. **Magazinele de aplicații:** e suficient PWA-ul sau vrem și Play Store / App Store (prin Capacitor, ~0,5–1 zi în plus)?
