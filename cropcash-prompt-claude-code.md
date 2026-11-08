# PROMPT PENTRU CLAUDE CODE — CropCash

> **Istoric (actualizat 8 nov 2026).** E promptul de pornire al proiectului. Între timp s-au schimbat: fondul pentru ani proști a fost scos, vocea a fost scoasă, interfața e în `web/` (Next.js), iar regulile de acum sunt în `CLAUDE.md`.

Ești în repo-ul unui proiect de hackathon. Construim **CropCash**, o aplicație de management financiar pentru fermele mici și mijlocii din România. Mai jos ai tot contextul. Nu știi nimic altceva despre proiect în afară de ce scrie aici și de fișierele din `docs/source/` (dacă există).

---

## REGULA NR. 1: LUCRĂM ÎN DOUĂ FAZE

**FAZA 1, acum: doar documentație și plan.**
- Creezi `CLAUDE.md` și toate fișierele din `docs/` descrise mai jos.
- **NU scrii cod de aplicație. NU instalezi pachete. NU inițializezi framework-uri. NU rulezi `npm create` sau ceva asemănător.**
- La final îmi dai un rezumat scurt: ce fișiere ai creat, ce cifre sunt marcate „DE VERIFICAT” și ce întrebări deschise ai. Apoi **te oprești și aștepți**.

**FAZA 2: începe doar când scriu exact `START` (sau „apucă-te de proiect”).**
- Atunci urmezi `docs/10-plan.md`, pas cu pas, în ordinea de acolo.
- După fiecare pas: rulezi testele, faci commit cu mesaj clar, bifezi pasul în `docs/10-plan.md` și îmi spui într-o frază ce ai terminat.
- Dacă o decizie de arhitectură diferă de ce scrie în docs, mă întrebi înainte.

---

## 0. Surse din repo

Dacă există folderul `docs/source/`, citește-l **înainte** de orice. Acolo pun:
- PDF-ul challenge-ului Stripe („Rethinking Financial Futures”)
- brief-ul nostru de cercetare despre fermieri
- brief-ul despre structura documentației

Dacă vreo informație de acolo contrazice acest prompt, **cifrele din acest prompt au prioritate**, pentru că sunt verificate și corectate. Notează contradicția în `docs/11-open-questions.md`.

---

## 1. Challenge-ul (Stripe, „Rethinking Financial Futures”)

**Întrebarea challenge-ului:** *How might we make navigating the financial future a more accessible, relevant and empowering experience for people in Romania?*

Brief-ul spune explicit că oamenii au întrebări diferite în etape diferite ale vieții, de la deciziile financiare de zi cu zi până la obiective pe termen lung, cum e pensia. Echipa alege direcția, publicul și forma produsului.

**Ce vor să vadă:**
- un scop clar, o experiență coerentă și valoare tangibilă pentru utilizatori;
- un produs care are sens ca întreg, nu o colecție de feature-uri separate;
- legătura dintre contextul românesc, un public bine definit și o experiență end-to-end coerentă.

**Demo-ul trebuie să arate clar:**
1. pe cine servește produsul și ce problemă rezolvă;
2. cum funcționează experiența principală, cap-coadă;
3. de ce e relevant în România;
4. ce asumpții, surse de date, considerente de reglementare și limitări există.

**Criteriile de jurizare:**
| Criteriu | Pondere | Ce înseamnă |
|---|---|---|
| Business fit | 30% | Relevanța pentru piața din România, propunerea de valoare, diferențierea, potențialul de adopție |
| User experience | 25% | Claritate, accesibilitate, interacțiuni intuitive, coerență |
| Technical implementation | 25% | Calitatea execuției, fezabilitatea, cât de bine demonstrează prototipul valoarea |
| Delivery & pitch | 20% | Narațiunea, calitatea demo-ului, comunicarea |

---

## 2. Produsul: CropCash

**Într-o frază:** CropCash transformă subvențiile și recolta fermierului, care vin în 2–3 valuri imprevizibile pe parcursul a până la 15 luni, într-un **„salariu” lunar**, un **fond pentru ani proști** și o **pensie**. În plus, îi spune la timp ce termene are și ce bani noi i se cuvin.

**Problema, în 3 propoziții (pentru pitch):**
> Fermierii mici din România își încasează venitul anual în 2–3 valuri imprevizibile (recolta vara și toamna, subvenția din octombrie până în iunie anul următor), dar cheltuie lunar și mai ales primăvara. De aceea trăiesc într-un ciclu anual de „bani mulți, apoi credit”, fără economii pentru ani proști. Iar pentru că veniturile agricole nu presupun CAS obligatoriu, cei mai mulți nu își construiesc deloc pensie.

**Publicul:** fermele mici și mijlocii (FMM), aproximativ 5–50 ha, teren arabil, eventual animale.

**Persona principală:** Ion, 55+ ani, 15 ha de cereale (grâu și porumb) în Teleorman. Folosește doar telefonul. Fiica lui îl ajută cu aplicațiile.

**Principii de UX (obligatorii):**
- Tot UI-ul e **în română, cu diacritice**, cu limbaj simplu, de om de la țară. Fără jargon financiar („lichiditate”, „cash-flow”, „portofoliu” sunt interzise în UI).
- Cifre mari, puțin text, butoane mari. Mobile-first, totul trebuie să meargă pe un telefon ieftin.
- Fiecare ecran răspunde la o singură întrebare: „Câți bani am?”, „Când vin banii?”, „Îmi ajung?”, „Ce am de făcut?”.
- Sumele se afișează în lei. Euro apare doar ca detaliu la subvenții.

---

## 3. Feature-urile (ce vrem să construim)

### Must have (MVP-ul pentru demo)
1. **Onboarding în 2 minute:** hectare pe cultură, județ, vârstă (sub 40 de ani înseamnă tânăr fermier), animale opțional. Opțional: upload de adeverință sau decizie de plată APIA (PDF), din care AI-ul extrage datele.
2. **Calculatorul de subvenții:** un motor de reguli pe scheme, care verifică eligibilitatea. Rezultatul e un **interval** (minim / probabil / maxim), nu o cifră fixă, și e defalcat pe tranșe (avans + sold).
3. **Calendarul banilor și al sarcinilor:** o singură axă de timp cu încasările (avans APIA, sold, vânzarea recoltei), plățile (credit, arendă, inputuri), termenele administrative și lucrările agricole. Golul februarie–mai e evidențiat vizual.
4. **Bugetul pe plicuri și „salariul” lunar:** când intră o tranșă, aplicația propune împărțirea pe plicuri (primăvară/inputuri, datorii, salariu lunar, fond de risc, pensie). **Algoritmul de netezire** calculează salariul lunar maxim pentru care soldul nu scade niciodată sub zero până la următoarea încasare, în scenariul ales.
5. **Fondul de risc și pensia:** dimensionarea fondului pe baza istoricului județului („3 din 10 ani au fost proști la porumb”). Pensia înseamnă contribuții mici, automate, la Pilonul III sau la CEI, cu o simulare a sumei la 65 de ani.

### Should have
6. **Prognoza de vânzări:** slider cu tone × preț în 3 scenarii (pesimist / mediu / optimist), din istoric, plus prețul de rentabilitate pe cultură. Proiecții pe trimestre pentru anul curent și următorii 2 ani.
7. **Istoricul:** prețuri pe cultură și lună (sezonalitate), producții medii pe județ (INS), vreme istorică (Open-Meteo). Toate alimentează scenariile.
8. **Scenariul „an de secetă”:** un toggle care arată ce se întâmplă cu planul într-un an prost.
9. **Raportul pentru rambursarea accizei la motorină:** fermierul introduce consumul, iar aplicația generează situația centralizatoare.

### Could have (dacă rămâne timp)
10. **Radarul de fonduri:** un job săptămânal care verifică sursele oficiale (AFIR, APIA, MADR). Extrage cu LLM condițiile de eligibilitate într-o schemă structurată, le compară cu profilul fermei, trimite notificare și adaugă termenul în calendar.

### Won't have (le pomenim doar în pitch)
- Integrare reală cu APIA sau AGI Online (nu există API public).
- Păstrarea reală a banilor fermierului (necesită un partener licențiat).
- Execuție reală de investiții sau contribuții de pensie.

---

## 4. Date verificate (sursa de adevăr pentru `docs/` și pentru `data/subsidies-2026.json`)

**Reguli pentru cifre:**
- Fiecare cifră din docs și JSON are: **valoare, unitate, an, sursă (URL) și status**: `confirmat-2026`, `din-2025`, `din-2024` sau `DE-VERIFICAT`.
- Codul citește cifrele **doar din `docs/data/*.json`**. Nicio cifră hardcodată în componente.
- Nu inventa nimic. Dacă îți lipsește o cifră, pune `null`, status `DE-VERIFICAT` și adaug-o în `docs/11-open-questions.md`.

### 4.1 Context
- În Campania 2026 s-au depus **671.334 de cereri de plată, pentru 9.766.322 ha** (scădere de 37.018 cereri față de anul trecut). Sursă: https://economedia.ro/campania-apia-2026-s-a-incheiat-suprafata-declarata-a-crescut-iar-numarul-cererilor-a-scazut.html — `confirmat-2026`.
  - ⚠️ Brief-ul vechi spune „~800.000 de cereri”. Cifra e **greșită**, folosește 671.334.
- România avea 2,9 milioane de ferme, adică 31,8% din exploatațiile UE (2020); 90,3% erau sub 5 ha; 44,3% dintre manageri aveau peste 65 de ani. Sursă: brief-ul nostru (digi24, cursdeguvernare) — `din-2020`.
- Insolvențele din agricultură în S1 2026: **226, față de 127 în S1 2025 (+80%)**. Sursă: https://www.forbes.ro/criza-fara-precedent-in-agricultura-romaneasca-insolventele-au-explodat-cu-aproape-80-in-primul-semestru-514318 — `confirmat-2026`.
- Costuri, producții și prețuri medii 2025–2026 (grâu 3.500–5.000 lei/ha cost, 4–6 t/ha, 0,90–1,20 lei/kg; porumb 4.000–6.000 lei/ha, 5–8 t/ha, 0,80–1,10 lei/kg; floarea-soarelui 3.500–5.500 lei/ha, 2–3 t/ha, 1,80–2,50 lei/kg). Subvențiile acoperă 15–25% din costuri la porumb și până la 30% la grâu. Sursă: https://www.capital.ro/este-agricultura-profitabila-in-romania-in-2026-analiza-costuri-vs-venituri-pentru-fermieri.html — `din-2025/2026`.

### 4.2 Calendarul banilor (campania 2026)
| Etapă | Perioadă | Status |
|---|---|---|
| Depunerea cererii | 16 martie – 5 iunie 2026 | confirmat-2026 |
| Controale pe teren | 1 iulie – 15 octombrie 2026 | confirmat-2026 |
| Avans | 16 octombrie – 30 noiembrie 2026, **75%** | confirmat-2026 |
| Sold (restul) | 1 decembrie 2026 – 30 iunie 2027 | confirmat-2026 |
| Modificări ale datelor declarate | notificare în 15 zile | din brief |
| Declarația Unică | 25 mai, anul următor | confirmat |

Plățile vin etapizat, nu toți primesc în aceeași zi. **Banii pentru anul de cerere 2026 ajung în până la 15 luni de la depunerea cererii.**

### 4.3 Scheme și cuantumuri (€/ha, referință pentru avansul 2026)
| Cod | Nume | Cuantum | Avans | Status |
|---|---|---|---|---|
| PD-01 | BISS, sprijin de bază | 101,03 | 75% (75,77) | confirmat-2026 |
| PD-02 | CRISS, redistributiv | 55,69 | 75% | confirmat-2026 |
| PD-03 | Tineri fermieri (<40 ani) | 55,36 | 75% | confirmat-2026 |
| PD-04 | Eco-schemă teren arabil | 56,28 | 42,21 | confirmat-2026 |
| PD-05 | Eco-schemă ferme mici | 100 | 75 | din brief, DE-VERIFICAT |
| PD-28 | Zone neproductive | vezi istoricul | — | DE-VERIFICAT pentru 2026 |
| Cuplat vaci lapte | €/cap | 347,81 | — | din brief, DE-VERIFICAT |
| Cuplat vită carne | €/cap | 244,72 | — | din brief, DE-VERIFICAT |

Surse: https://www.economica.net/?p=981850 , https://financiarul.ro/agricultura/avansul-apia-incepe-pe-16-octombrie-cu-sume-maxime-intre-219-18-si-399/

**Reguli de eligibilitate cunoscute:**
- **PD-04:** ferma trebuie să aibă minimum 10,01 ha; pentru 10,01–30 ha, minimum 2 culturi diferite; parcele de minimum 0,3 ha. Sursă: https://agrointel.ro/wp-content/uploads/2025/02/pd-04-agrointeligenta.pdf
- **PD-02 (CRISS):** doar fermele de 1–50 ha; la 51 ha se pierde pe toată suprafața. **DE-VERIFICAT în textul Planului Strategic PAC.** Sursă secundară: https://folositor.ro/ghid/cat-castiga-un-fermier-in-romania
- **PD-05:** plafon de maximum 10 ha (din brief) — DE-VERIFICAT.
- **PD-28** se poate combina cu PD-04 și PD-05.

### 4.4 Volatilitatea cuantumurilor (datele pentru interval)
- **BISS pe ani:** 2023: 97,57 · 2024: 96,39 · 2025: 89,34 · 2026: 101,03 (referință avans).
- **BISS planificat în PNS 2023–2027:** 96,47 / 97,85 / 99,27 / 100,66 / 103,06. Pentru 2025, cel planificat a fost 99,27, iar cel real 89,34 (≈ −10%).
- **PD-28, campania 2025:** planificat 58,18 → anunțat 20 → stabilit 32,9366 (au fost declarate ~5,9 milioane ha, peste estimări) → proiect de majorare la 40,2089. Surse: https://www.bzi.ro/cati-bani-primesc-fermierii-care-au-depus-cererile-in-eco-schema-pd28-este-o-lovitura-pentru-cei-care-au-terenuri-agricole-5396224 , https://www.economica.net/?p=932602
- **Mecanismul:** cuantumul se obține prin împărțirea plafonului bugetar la suprafața totală determinată. Cu cât declară mai mulți fermieri, cu atât scade cuantumul.
- **Folosește aceste date ca să construiești intervalul** minim / probabil / maxim pentru fiecare schemă.

### 4.5 Cursul de schimb
- Plățile se fac în lei, la cursul BCE stabilit înainte de 1 octombrie, **diferit în funcție de fond**:
  - Campania 2025: **FEGA 5,0806 lei/€**, **FEADR 4,9743 lei/€** — `din-2025`.
  - Campania 2026: curs BCE din 30 septembrie 2026 — **DE-VERIFICAT**. Până atunci, folosește un parametru configurabil (implicit 5,28).
- Fiecare schemă din JSON are câmpul `fund: "FEGA" | "FEADR"`.

### 4.6 Test case (cu rezultat cunoscut)
Fermier cu 15 ha de cereale, în 2 culturi, fără tânăr fermier, fără animale:
- BISS 15 × 101,03 = 1.515,45 €
- CRISS 15 × 55,69 = 835,35 €
- PD-04 15 × 56,28 = 844,20 €
- **Total = 3.195,00 €** → la curs 5,28: **16.869,60 lei** (din care 75% avans ≈ 12.652 lei)
- Scrie-l ca test automat. Totalul în euro trebuie să iasă exact. Totalul în lei depinde de parametrul de curs.

### 4.7 Creditul pe adeverința APIA (cum acoperă azi golul)
- Până la 90% din subvenție, garanția fiind chiar subvenția de încasat.
- Dobânda: **bănci ROBOR 6M + maximum 2%**, **IFN-uri ROBOR 6M + maximum 8%**. Sursă: comunicat APIA, 27 mai 2026.
- Exemplu BRD: comision de acordare 1%, scadență cel târziu la termenul de plată APIA (de obicei 30 iunie anul următor).
- **Concluzia pentru pitch:** creditul e relativ ieftin. Problema reală e lipsa planificării, incertitudinea sumei, lipsa rezervei și lipsa pensiei.

### 4.8 Taxe și pensie
- Fermierii persoane fizice sunt impozitați pe **normă de venit**, pe județ și pe hectar (exemplu din brief: Vrancea, cereale 237 lei/ha în 2026 — DE-VERIFICAT). Impozitul e de 10%.
- **CAS (pensie):** obligatoriu doar peste 12 salarii minime. Sub prag e opțional, dar costă minimum **48.600 × 25% = 12.150 lei/an**. Baza e salariul minim de 4.050 lei; creșterea la 4.325 lei din iulie 2026 nu schimbă baza. Sursă: https://contapp.ro/blog/plafoane-fiscale-2026-pentru-pfa-ii-si-microintreprinderi/
- **Alternative realiste:**
  - **Pilonul III:** deschis oricărei persoane fizice rezidente de peste 18 ani; ~1,1 milioane de participanți; contribuție medie ~167 lei/lună. Sursă: https://www.bugetul.ro/pilonul-3-de-pensii-a-ajuns-la-88-miliarde-de-lei-cine-poate-beneficia-de-acesti-bani-care-este-procedura/
  - **CEI (Legea 202/2026), din 1 ianuarie 2027:** CEI-S (contribuții din venit net, retrageri scutite) și CEI-D (deducere la contribuție, impozit la retragere). Orice persoană fizică poate deschide un cont. Sursă: https://alba24.ro/romanii-vor-putea-economisi-si-investi-bani-fara-impozit-din-2027-noua-lege-a-fost-publicata-in-monitorul-oficial-1162874.html

### 4.9 Surse pentru radarul de fonduri și exemple
- Surse de monitorizat: AFIR (afir.ro), APIA (apia.org.ro), MADR (madr.ro).
- Exemplu: sprijin propus de ~60 milioane € pentru îngrășăminte în 2026, până la 527 lei/ha. Sursă: https://alba24.ro/fermierii-ar-putea-primi-un-nou-ajutor-de-la-apia-in-2026-pana-la-527-de-lei-pe-hectar-pentru-ingrasaminte-1164973.html
- Rambursarea accizei la motorină: trimestrial, 2,213 lei/l, cu acord prealabil până la 20 decembrie (din brief) — DE-VERIFICAT.

### 4.10 Concurența (pentru pitch, `docs/09-demo-pitch.md`)
- **Agricover Pay** (lansat în octombrie 2026): cont, card și credit Agricover. E legat de creditor și nu face planificare.
- **Agricover Crop360, AGRIVI, AgroCity:** management operațional (parcele, lucrări), pentru ferme profesioniste.
- **Figured (NZ), Harvest Profit (SUA):** planificare financiară pentru ferme, dar nu sunt adaptate la România (APIA, tranșe, curs, PFA).
- **Diferențierea CropCash:** pentru ferma mică, fără limbaj financiar, cu salariu, rezervă și pensie din subvenție, plus reguli APIA cu incertitudine.

---

## 5. Stack-ul (propunere — o confirm în faza 1)

- **Frontend:** React + Vite + TypeScript + Tailwind, mobile-first, ca PWA.
- **Backend:** Node.js + Express + TypeScript.
- **DB și auth:** Supabase (Postgres).
- **Plăți:** Stripe, **doar în test mode**.
- **AI:** Claude API, pentru extragerea din PDF-urile APIA și pentru radarul de fonduri (output structurat, JSON validat cu Zod).
- **Date externe:** Open-Meteo (vremea istorică, gratuit). INS și prețurile vin din CSV-uri pregătite în `docs/data/`.
- **Deploy:** Netlify (front), Railway (API).
- **Teste:** Vitest, cel puțin pentru motorul de subvenții și algoritmul de netezire.

Convenții: **cod în engleză, UI în română**. Toate textele de UI stau într-un singur fișier de traduceri (`ro.json`), nu împrăștiate prin componente.

---

## 6. Stripe (ce folosim și de ce)

- **Connect (conturi Express):** un cont conectat pentru fiecare fermier. Ăsta e modelul real: platforma nu ține banii în contul ei.
- **Simularea încasării APIA:** în test mode, „avansul” e o plată de test, transferată în contul conectat al fermierului.
- **„Salariul” lunar:** payouts manuale, programate lunar din contul conectat către contul bancar al fermierului. Suma vine din algoritmul de netezire.
- **Pensia:** o subscription lunară cu suma aleasă de fermier (simulează contribuția la Pilonul III sau CEI).
- **Test Clocks:** pentru demo, „dăm timpul înainte” cu 6–12 luni și arătăm live cum se execută salariile și contribuțiile.
- **Webhooks:** `payout.paid`, `invoice.paid`, `transfer.created`, care actualizează plicurile în aplicație.
- **Limitarea de spus juriului:** în producție, păstrarea și alocarea banilor fermierului necesită un partener licențiat (instituție de plată sau bancă). În demo, totul e în test mode.

Variabile de mediu: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`. Pune-le în `.env.example`, nu în cod.

---

## 7. Ce fișiere creezi în FAZA 1

```
cropcash/
├── CLAUDE.md
├── README.md
├── .env.example
└── docs/
    ├── source/                    ← (deja pus de mine, dacă există)
    ├── 01-product.md
    ├── 02-problem-context.md
    ├── 03-subsidies.md
    ├── 04-farmer-reports.md
    ├── 05-taxes-pension.md
    ├── 06-features-mvp.md
    ├── 07-architecture.md
    ├── 08-stripe.md
    ├── 09-demo-pitch.md
    ├── 10-plan.md
    ├── 11-open-questions.md
    └── data/
        ├── subsidies-2026.json
        ├── subsidies-history.json
        ├── calendar-2026.json
        └── crops-reference.json
```

### Ce conține fiecare

**`CLAUDE.md`** (maximum ~60 de rânduri, citit automat la fiecare sesiune):
- ce e CropCash, într-un paragraf; contextul de hackathon și challenge-ul Stripe;
- stack-ul și comenzile (`dev`, `build`, `test`, `stripe listen --forward-to ...`);
- regulile: UI în română, cod în engleză, Stripe doar în test mode, cifrele vin doar din `docs/data/`, nicio cifră inventată, testele trebuie să treacă înainte de commit;
- lista fișierelor din `docs/` și **când** trebuie citit fiecare (de exemplu: „înainte să lucrezi la calculul subvențiilor, citește `03-subsidies.md` și `data/subsidies-2026.json`”).

**`01-product.md`:** pitch-ul în 30 de secunde, persona, propunerea de valoare (salariu lunar, fond de risc, pensie, asistent pentru termene și acte), principiile de UX din secțiunea 2.

**`02-problem-context.md`:** datele din 4.1, ciclul banilor (tabelul din 4.2), de ce creditul pe adeverință nu rezolvă problema (4.7), insolvențele.

**`03-subsidies.md`** (cel mai important pentru logică): formula de bază `Σ(ha eligibile × cuantum) × curs`, mecanismul cuantumului (plafon / suprafață), tabelul de scheme, regulile de eligibilitate, volatilitatea și **cum se calculează intervalul**, cursurile pe fond, tranșele, test case-ul din 4.6 cu rezultatul așteptat, plus ce e confirmat pentru 2026 și ce nu.

**`04-farmer-reports.md`:** rambursarea accizei la motorină, registrul de tratamente fitosanitare (păstrat 3 ani), registrul zilierilor, registrul agricol. Pentru fiecare: ce date îi trebuie și ce poate genera aplicația automat. Marchează ce e DE-VERIFICAT.

**`05-taxes-pension.md`:** norma de venit, impozitul de 10%, CAS opțional, de ce fermierii nu au pensie, alternativele realiste (Pilonul III, CEI) și cum le simulăm.

**`06-features-mvp.md`:** Must / Should / Could / Won't din secțiunea 3, user flow-ul **ecran cu ecran** (ce vede fermierul, ce apasă, ce urmează) și ce date sunt simulate.

**`07-architecture.md`:**
- stack-ul și structura de foldere (frontend, backend, shared);
- modelul de date: `Farmer`, `Parcel`, `Crop`, `SubsidyScheme`, `ExpectedPayment`, `Envelope`, `Transaction`, `Payout`, `PensionPlan`, `FuelLog`, `FundingOpportunity`, cu câmpuri și relații, plus schema SQL pentru Supabase;
- **algoritmul de netezire**, descris în pseudocod: intrările (încasările așteptate cu intervale, cheltuielile pe luni), ieșirea (salariul lunar maxim pentru care soldul nu scade sub zero până la următoarea încasare, în scenariul ales), plus cazurile-limită;
- **scenariile:** an bun / mediu / slab (secetă). Cum se combină intervalul de subvenție cu producția și prețul;
- motorul de reguli pentru subvenții: date în JSON, eligibilitate ca funcții pure, testabile;
- de ce a fost aleasă fiecare tehnologie, într-o propoziție.

**`08-stripe.md`:** secțiunea 6 detaliată: ce obiecte Stripe creăm, în ce ordine, ce e simulat și ce e real, lista de webhooks, comanda `stripe listen` și cum folosim Test Clocks în demo.

**`09-demo-pitch.md`:**
- criteriile juriului și cum bifează CropCash fiecare criteriu;
- cele 4 lucruri cerute de brief și unde apar în demo;
- **scriptul demo-ului, minut cu minut** (4–5 minute), cu persona Ion: onboarding → subvenția ca interval → calendarul cu golul → intră avansul și se împarte pe plicuri → „dăm timpul înainte” cu Test Clocks → salariul se plătește lunar → scenariul „an de secetă” → pensia la 65 de ani;
- concurența și diferențierea (4.10);
- limitările de spus deschis: date simulate, partener licențiat necesar pentru bani, cifre de verificat în PS PAC, fără integrare APIA.

**`10-plan.md`** (planul de implementare pentru FAZA 2):
- pași numerotați, fiecare cu: obiectiv, fișiere atinse, criteriu de „gata” și estimare de timp;
- ordinea: 1) setup proiect → 2) JSON-uri de date + motorul de subvenții + teste → 3) onboarding → 4) calendar → 5) plicuri + algoritmul de netezire + teste → 6) Stripe Connect + payouts + subscription + webhooks + Test Clocks → 7) fond de risc și pensie → 8) prognoza de vânzări și scenariile → 9) polish UX pentru demo + date de demo (persona Ion) → 10) extra: raportul de motorină, radarul de fonduri, extragerea din PDF;
- marchează clar ce e **minimul pentru un demo funcțional** (pașii 1–6 și 9) și ce e bonus;
- o propunere de împărțire pe **4 oameni** (motor de subvenții și calendar / plicuri și UX / Stripe și backend / date, pitch și demo), cu ce pot face în paralel.

**`11-open-questions.md`:** toate cifrele `DE-VERIFICAT`, contradicțiile găsite în `docs/source/` și deciziile pe care trebuie să le iau eu.

**`data/*.json`:**
- `subsidies-2026.json`: pentru fiecare schemă, `code`, `name_ro`, `unit` (ha / cap), `amount_eur`, `advance_pct`, `fund`, `max_ha`, `eligibility` (reguli declarative), `source_url`, `year`, `status`;
- `subsidies-history.json`: cuantumurile pe ani (din 4.4), pentru calculul intervalului;
- `calendar-2026.json`: toate termenele din 4.2;
- `crops-reference.json`: pentru grâu, porumb și floarea-soarelui: cost/ha, producție/ha (min / medie / max), preț/kg (min / mediu / max), lunile de cheltuieli și luna recoltei, cu sursa.

---

## 8. Cum lucrezi

- Scrie docs-urile în română (sunt pentru echipă). Termenii tehnici pot rămâne în engleză.
- Fii concret: tabele, pseudocod, exemple numerice. Fără umplutură.
- Când o decizie are un „de ce”, scrie-l într-o propoziție.
- La final (FAZA 1): rezumat + lista DE-VERIFICAT + întrebări. **Apoi te oprești și aștepți `START`.**
