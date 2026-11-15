# 15. Arenda: ce spune legea

Regulile pe care se sprijină modul „Iau pământ în arendă” (`docs/employees-arenda-plan.md` §3). Fiecare regulă are
sursa ei. Ce n-am citit în textul oficial e `DE-VERIFICAT` și are o intrare în `docs/11-open-questions.md`.
Cifrele stau în `docs/data/arenda-prices-2026.json`, iar codul le citește prin `packages/shared/src/arenda/prices.ts`.

Citit pe 15 nov 2026. Nu e sfat juridic sau fiscal: aplicația arată calculul, iar contabilul îl confirmă.

## 1. Contractul (Codul civil, Legea 287/2009, art. 1836–1850)

Sursă: textul articolelor pe [legeaz.net](https://legeaz.net/noul-cod-civil/pagina-37) (Codul civil actualizat).

| Regula | Articolul | Ce înseamnă pentru aplicație |
|---|---|---|
| Contractul se face **în scris**, altfel e nul absolut. | 1838 (1) | Un contract fără hârtie nu există. Aplicația cere data semnării și poate păstra o poză a contractului. |
| **Arendașul** depune un exemplar la consiliul local unde e terenul, care îl trece într-un registru special ținut de secretar. Dacă terenul e în mai multe comune, câte un exemplar la fiecare. Altfel, amendă civilă pe fiecare zi de întârziere. | 1838 (2)–(3) | Câmpurile „nr. și data înregistrării la primărie”. Un contract fără ele primește o atenționare. Un contract cu terenuri în mai multe comune are câte un număr pe comună. |
| Cheltuielile de încheiere, înregistrare și publicitate sunt ale **arendașului**. | 1838 (5) | O cheltuială a fermei, nu a proprietarului. |
| Un contract înregistrat la consiliul local (sau autentic) e **titlu executoriu** pentru plata arendei. | 1845 | De spus proprietarului: fără înregistrare, arenda se cere în instanță. |
| Fără durată scrisă, contractul ține până la strânsul recoltei din anul agricol în care s-a încheiat. | 1837 | Data de sfârșit poate lipsi; atunci e sfârșitul anului agricol. |
| Contractul **se reînnoiește singur**, pe aceeași durată, dacă nimeni nu refuză în scris cu cel puțin **un an** înainte de sfârșit (teren agricol). La un contract de un an sau mai scurt, termenul se înjumătățește (6 luni). | 1848 | Aducerea aminte trebuie să vină **înainte** de termenul de refuz, nu în ultimele luni: la 13 luni înainte de sfârșit (7 luni la contractele de un an). Planul (§3.6) spunea 3–6 luni; e schimbat. Făcut în `expiringContracts` (pasul 7). |
| **Subarendarea e interzisă**, sub nulitate absolută. | 1847 | Un teren luat în arendă nu poate fi dat mai departe în arendă. La pasul 7, o parcelă `leased_in` nu poate intra într-un contract `given`. |
| Arenda se poate ceda, cu acordul scris al proprietarului, doar soțului care lucrează pământul sau copiilor majori ai arendașului. | 1846 | Nu e un caz pentru aplicație acum. |
| Contractul se termină la moartea, incapacitatea sau falimentul **arendașului**. | 1850 | Moartea **proprietarului** nu e în listă, deci contractul merge mai departe cu moștenitorii (așa e construit §3.6 „Moștenitori”). Regula generală pentru locațiune e `DE-VERIFICAT`. |
| Recolta pierdută fortuit (toată sau cel puțin jumătate) dă dreptul arendașului să ceară **micșorarea arenzii**. Pe mai mulți ani, socoteala se face la sfârșitul contractului. | 1841 | Legătură cu `crop-loss-plan.md`: o pierdere mare notată poate arăta „Poți cere micșorarea arenzii”. Nu calculăm cât. |
| Arenda ca o **cotă din recoltă**: pierderea fortuită se împarte proporțional. | 1843 | O arendă în cotă (de ex. 25% din recoltă) e un tip de contract separat de „kg pe hectar”. Pasul 7 pornește doar cu lei/ha și kg/ha. |
| Arenda în produse: fără alt termen în contract, arendașul trebuie să predea de la data recoltării; proprietarul e în întârziere la primire din ziua în care a fost anunțat **în scris**. | 1844 | „Ziua arendei” (§3.5) poate trimite anunțul scris. |
| Arendașul are **drept de preempțiune** la cumpărarea terenului arendat. | 1849 | Nu e un caz pentru aplicație acum. |

Rămâne `DE-VERIFICAT`:
- durata minimă sau maximă (Codul civil nu dă una; Legea 16/1994 a arendării e abrogată de Codul civil, de confirmat);
- dacă e nevoie și de înregistrarea la organul fiscal. Codul fiscal art. 83 (5) cere înregistrarea la ANAF în 30 de zile pentru închirieri, dar **scoate arendarea** din regulă. Unele articole de presă spun altfel.

## 2. APIA: terenul luat în arendă

Sursă: Instrucțiunile de completare a cererii de plată 2026, Anexa 2, MO nr. 193 bis/12.III.2026, p. 132–133
([apia.org.ro](https://apia.org.ro/wp-content/uploads/2026/03/Anexa-2.pdf)).

- Fermierul arată, **la data depunerii cererii**, că terenul e în folosința și la dispoziția lui.
- Dovada e **adeverința din registrul agricol** pentru anul de cerere (model în anexa nr. 5 la ordin). APIA o cere
  direct de la primărie, în afară de cei care depun **prima dată**, care o aduc singuri. Adeverința trebuie emisă
  **înainte** de data cererii.
- Contractele se depun ca o copie doar când terenul e de la o primărie (închiriere, concesiune, comodat), de la ADS
  sau de la altă instituție publică. Pentru terenul de la ADS se bifează „ADS” în AGI Online.
- Suprafețele fără aceste documente până la termenul de depunere **nu primesc bani**.
- La transferul exploatației se aplică interdicția subarendării (art. 1847).

Pentru aplicație:
- O arendă de la o persoană ajunge la APIA prin registrul agricol, deci prin **înregistrarea la primărie**. Un contract
  neînregistrat înainte de cerere înseamnă, foarte probabil, hectare neplătite. Că registrul agricol preia contractele
  înregistrate la consiliul local e `DE-VERIFICAT` (Legea registrului agricol și normele lui nu au fost citite).
- **Subvenția pentru terenul dat în arendă (D5) e a celui care îl lucrează**, adică a arendașului care îl are la
  dispoziție. Hectarele date altcuiva ies din `computeSubsidies`. Un contract care spune altfel nu schimbă cine
  primește de la APIA; schimbă doar o socoteală între cei doi.
- Termenul cererii 2026 (16 martie – 5 iunie) e deja în `calendar-2026.json`.

## 3. Impozitul pe arendă

Sursă: Codul fiscal (Legea 227/2015, actualizat prin Legea nr. 204/2026), art. 84, pe
[static.anaf.ro](https://static.anaf.ro/static/10/Anaf/legislatie/Cod_fiscal_norme_2023.htm), plus normele (HG 1/2016, pct. 19–20).

| Regula | Articolul |
|---|---|
| Venitul brut e banii plus produsele în natură, socotite în lei. | 84 (4) |
| Produsele se socotesc la **prețurile medii stabilite de consiliul județean**, la propunerea direcției agricole județene, prin hotărâre dată înainte de începutul anului. | 84 (5) |
| Dacă prețurile se schimbă în timpul anului, cele noi se aplică din **prima zi a lunii de după** comunicarea către fisc. | 84 (6) |
| Venitul net = brutul minus **20%** cheltuieli forfetare, socotit la fiecare plată. | 84 (7) |
| Impozitul e **10% din net**, reținut de cel care plătește arenda (arendașul), la plată. E **final**. | 84 (8) |
| Arendașul plătește impozitul reținut până pe **25** a lunii de după reținere. | 84 (9) |
| Proprietarul nu ține registru și nu face contabilitate pentru arendă. | 84 (10) |

Deci impozitul e 8% din brut, iar proprietarul primește 92% din valoarea arenzii. Exemplu, Teleorman 2026:
800 kg grâu × 0,69 lei = 552 lei brut; 110,40 lei cheltuieli; 441,60 lei net; **44,16 lei impozit**; scadent pe 25 a
lunii de după. Aplicația (`rentTax`) rotunjește la ban; cum rotunjește ANAF e `DE-VERIFICAT`.

Rămâne `DE-VERIFICAT`:
- **formularul** în care arendașul declară impozitul reținut (presa spune D100; nu l-am citit în ordinul ANAF);
- că pentru arendă **nu** se depune formularul 205 (materialele ANAF spun asta; de citit în ordin);
- cum se reține **impozitul când arenda e doar în produse**: din ce se reține 10% când nu se plătesc bani (în practică
  se dă mai puțin produs sau se plătește diferența în bani). Contabilul hotărăște; aplicația arată doar suma.

În plan (pasul 8, `arenda/schedule.ts`), impozitul se împarte proporțional între bani și produse; pentru produse, proprietarul primește cu kg-urile impozitului mai puțin, iar ferma plătește impozitul în lei (presupunere, docs/11 #22).

Pe contractele `given` (D5), ferma e cea care primește: arată ce ar trebui să primească după reținere. Fără nimic de
depus. Dacă ferma e persoană juridică (SRL), regimul e altul (venit al firmei); `legal_form` vine cu pasul 0c.

## 4. CASS-ul proprietarului

Sursă: Codul fiscal art. 156, 170, 174^1 (aceeași versiune).

- Cota e **10%** (art. 156).
- Dacă venitul net din arendă de la **un singur plătitor** e estimat la cel puțin **6 salarii minime** pe an, plătitorul
  (arendașul) calculează, reține și plătește CASS-ul proprietarului, pe o bază de 6, 12 sau 24 de salarii minime
  (art. 174^1 alin. (3), art. 170 alin. (3)), declarat și plătit până pe 25 a lunii de după (art. 174^1 alin. (5)).
- Când venitul vine de la mai mulți plătitori, fiecare sub prag, proprietarul îl declară singur în Declarația unică.

Aplicația **nu calculează CASS-ul**: depinde de ce alte venituri are proprietarul. Pentru un proprietar cu mult teren
la aceeași fermă, arată doar „Poate trebui să reții și CASS; întreabă contabilul”. Pragul exact (salariul minim pe 2026)
e în `05-taxes-pension.md`; legarea lui de arendă e `DE-VERIFICAT`.

## 5. Prețurile pe județ pentru 2026

În `docs/data/arenda-prices-2026.json`, în bani pe kg, cu hotărârea și linkul ei. Citite din hotărârea însăși:

| Județ | Hotărârea | De la | Grâu | Orz | Porumb | Floarea s. | Rapiță | Soia | Mazăre |
|---|---|---|---|---|---|---|---|---|---|
| Teleorman | HCJ 1/28.01.2026 | 1 ian | 0,69 | 0,76 | 0,72 | 1,84 | – | – | – |
| Olt | HCJ 201/18.12.2025 | 1 ian | 0,75 | 0,70 | 0,72 | 1,85 | 2,00 | – | 0,90 |
| Covasna | HCJ 225/2025 | 1 ian | 0,80 | 0,75 | 0,80 | 2,20 | 2,20 | – | – |
| Caraș-Severin | HCJ 203/29.09.2025 | 1 ian | 1,00 | 1,00 | 1,00 | 2,00 | 2,00 | 2,00 | – |
| Ialomița | HCJ 102/29.07.2026 | 1 aug | 0,80 | 0,80 | 0,80 | 2,10 | 2,20 | – | – |

- **Ialomița** și-a schimbat prețurile în iulie, în vigoare din 1 august 2026 (art. 84 (6)). Prețurile de dinainte (HCJ
  229/2025) lipsesc, iar textul a fost citit în presa locală, nu pe site-ul consiliului: `DE-VERIFICAT`.
- **Giurgiu** (HCJ 280/2025): site-ul refuză descărcarea. **Călărași** a schimbat prețurile pe 30 iunie 2026: hotărârea
  n-a fost citită. Celelalte județe nu au fost căutate. Toate sunt `null`.
- Prețurile se leagă de culturile din aplicație prin **genul botanic** (Triticum, Hordeum, Zea…), ca la diversificare
  (`diversificationKeyOf`). „Orz” acoperă și orzoaica, cum fac Covasna și Teleorman.
- **Unde lipsește prețul, fermierul îl scrie** (de pe hotărârea județului lui sau de la primărie), iar aplicația spune
  de unde l-a luat. Nu punem o medie din alt județ.
- Prețurile de arendă **nu sunt prețuri de piață** (o spune și CJ Călărași). Nu intră în prețul de vânzare din plan.

## 6. Ce rămâne de verificat înainte de lansarea modului

Toate în `docs/11-open-questions.md`, întrebările 21–25:
1. formularul pentru impozitul reținut și rotunjirea;
2. reținerea când arenda e doar în produse;
3. legătura registru agricol – registrul contractelor de arendă;
4. CASS-ul reținut de arendaș, cu pragul pe 2026;
5. prețurile pentru celelalte 37 de județe (și Ialomița de dinainte de august).
