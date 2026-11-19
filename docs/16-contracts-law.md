# 16. Contractele fermei: ce spune legea

Regulile pe care se sprijină ecranul „Contracte” (`docs/contracts-plan.md`), pentru tipurile din recomandarea C1:
vânzare de recoltă, cumpărare pe credit (la recoltă), servicii, leasing, asigurare și „alt contract”. Arenda are
legea ei în `docs/15-arenda.md`. Folosința gratuită (comodat) e citită aici pentru mai târziu. Contractul de muncă
nu e citit (vine mai târziu, C3).

Fiecare regulă are sursa ei. Ce n-am citit în textul oficial e `DE-VERIFICAT` și are o intrare în
`docs/11-open-questions.md` (întrebările 42–49). Cifrele stau în `docs/data/contract-taxes-2026.json` (taxe) și
`docs/data/contract-types.json` (sfârșitul fiecărui tip).

Citit pe 18 nov 2026. Nu e sfat juridic sau fiscal: aplicația arată calculul, iar contabilul îl confirmă.

## 1. Sfârșitul unui contract (Codul civil)

Sursa: textele articolelor de pe [codulcivil.ro](http://www.codulcivil.ro/) (Codul civil, republicat în MO nr. 505
din 15 iulie 2011). Nu e o publicație oficială: formularea e de confirmat pe legislatie.just.ro (#42).

| Regula | Articolul | Ce înseamnă pentru aplicație |
|---|---|---|
| Un contract **pe durată nedeterminată** poate fi denunțat de oricare parte, cu un **preaviz rezonabil**. O clauză contrară sau o plată cerută pentru denunțare se socotesc nescrise. | 1277 | Un contract fără dată de sfârșit nu are „termen de hotărât”. Fermierul îl poate încheia oricând, cu preavizul din contract. Legea nu dă un număr de zile: „rezonabil” îl apreciază instanța. |
| La un contract cu **executare succesivă** (servicii lunare, de exemplu), denunțarea se poate face și după ce a început, cu preaviz rezonabil, dacă părțile n-au convenit altfel. Nu atinge ce s-a executat deja. | 1276 (2), (4) | „Anunț că închei” pe un contract de servicii. Contractul fermierului poate spune altfel, deci preavizul îl scrie el (`notice_days`). |
| **Reînnoirea tacită** e o regulă a locațiunii: dacă după termen chiriașul rămâne și plătește, fără împotrivirea proprietarului, se socotește încheiată o locațiune nouă, în aceleași condiții, dar **pe durată nedeterminată**, dacă legea sau contractul nu spun altfel. | 1810 | Codul civil n-are o reînnoire tacită generală. Un contract de servicii se reînnoiește singur doar dacă scrie așa în el: de aceea `auto_renews` e implicit **fals** pentru servicii și „alt contract”, iar fermierul îl bifează. La arendă e altă regulă (art. 1848, `docs/15-arenda.md` §1). |
| Închiriere fără durată: proprietarul o poate denunța cu cel puțin **60 de zile** preaviz când chiria e lunară sau pe o perioadă mai lungă (15 zile sub o lună); chiriașul, cu cel puțin un sfert din perioada de plată. | 1824 | Doar pentru închirieri (un depozit, un utilaj fără leasing), ca „alt contract”. Nu intră în primul set de reguli. |
| Închiriere pe durată determinată: chiriașul o poate denunța cu cel puțin **60 de zile** preaviz; clauza contrară e nescrisă. | 1825 (1) | La fel: de folosit dacă vine un tip „închiriere”. |

## 2. Vânzarea de recoltă (Codul civil)

| Regula | Articolul | Ce înseamnă pentru aplicație |
|---|---|---|
| Predarea înseamnă **punerea bunului la dispoziția cumpărătorului**, cu tot ce trebuie pentru o posesie liberă. | 1685 | „Am livrat” se apasă când marfa e pusă la dispoziția cumpărătorului (la siloz, în camion), nu la plată. |
| Fără altă înțelegere, cumpărătorul plătește la locul unde era bunul la încheierea contractului, **de îndată ce proprietatea s-a transmis**. | 1720 (1) | Fără o dată de plată în contract, plata vine odată cu livrarea. Aplicația pune banii în ziua livrării și spune că e o presupunere (P-C3). |
| Termenul de predare când contractul nu-l spune. | 1686–1693 | **Necitit** (#43). Aplicația cere oricum datele livrărilor. |

Penalitățile pentru livrare întârziată sau lipsă nu vin din lege, ci din contract: aplicația doar spune „verifică
penalitățile din contract”.

## 3. Leasingul (OG 51/1997)

Sursa: articolele de pe [legeaz.net/og-51-1997](https://legeaz.net/og-51-1997). Forma consolidată din MO nu a fost
citită (#44).

| Regula | Articolul | Ce înseamnă pentru aplicație |
|---|---|---|
| La sfârșitul leasingului, finanțatorul trebuie să respecte **dreptul de opțiune** al utilizatorului: **cumpără bunul**, **prelungește** contractul fără să schimbe natura leasingului, sau **încetează** raporturile. | 1 (1), 9 lit. d) | Exact cele trei butoane: „Cumpăr utilajul”, „Prelungesc”, „Îl dau înapoi”. |
| Utilizatorul poate cumpăra **înainte** de sfârșit, dar nu mai devreme de **12 luni**, dacă părțile convin și a plătit tot ce datorează. | 1 (1) | O cumpărare înainte de termen se arată doar după 12 luni de la început și doar dacă fermierul spune că are dreptul în contract. |
| **Valoarea reziduală** e suma la care, după toate ratele, proprietatea trece la utilizator; o stabilesc părțile. | 2 lit. c) | `residual_bani` vine din contract; la „Cumpăr” intră în plan. |
| Contractul se face **în scris**. | 7 | Ca la arendă: aplicația poate păstra o poză. |
| Bunul îl asigură **finanțatorul**, dacă contractul nu spune altfel; utilizatorul plătește ratele, asigurările, impozitele și taxele din contract. | 9 lit. f), 10 lit. d) | La un leasing, aplicația întreabă „Asigurarea e în rată?”, ca să n-o numere de două ori cu un contract de asigurare. |
| Utilizatorul returnează bunul după contract. | 10 lit. j) | „Îl dau înapoi”. |
| **Termenul în care se anunță opțiunea** la sfârșit. | 1–10 citite | **Nu e în lege** (în articolele citite). Îl scrie fermierul din contract (`notice_days`). Art. 11–13 necitite (#44). |

## 4. Asigurarea (Codul civil)

| Regula | Articolul | Ce înseamnă pentru aplicație |
|---|---|---|
| Asiguratul plătește o **primă**; asigurătorul plătește despăgubirea dacă se întâmplă riscul. | 2199 | Prima e o cheltuială a fermei, pe datele din poliță. |
| Primele se plătesc la termenele din contract. Fără altă înțelegere, asigurătorul poate **rezilia** contractul dacă primele nu sunt plătite la scadență; consecințele întârzierii trebuie scrise în contract. | 2206 (1), (4), (5) | O rată de primă neplătită: „Dacă nu plătești la timp, asigurătorul poate închide polița. Vezi ce scrie în poliță.” |
| Denunțarea de către oricare parte: cu **cel puțin 20 de zile** preaviz, de la primirea notificării. | 2209 | „Nu mai asigur” înainte de termen cere 20 de zile. `notice_days` implicit 20 la asigurare. |
| Asigurările **obligatorii** au legi speciale. | 2213 | RCA-ul tractorului nu e citit (#45). |
| Când începe și când se termină acoperirea; dacă o poliță se reînnoiește singură. | 2207–2211 | **Necitite** (#45). Aplicația nu presupune reînnoire: după data de sfârșit, terenul sau utilajul e **neasigurat** până la o poliță nouă. |

## 5. Folosința gratuită (comodat), pentru mai târziu

| Regula | Articolul | Ce înseamnă pentru aplicație |
|---|---|---|
| Comodatul e **gratuit**: comodantul dă un bun, comodatarul îl folosește și îl **restituie după un timp**. | 2146 | Fără bani în plan; fără impozit pe arendă (nu e arendă). |
| Bunul se restituie la **termenul convenit** sau, fără termen, după folosința din contract. Fără termen și fără scop (sau cu folosință permanentă): **la cererea comodantului**. | 2155 | Un comodat fără termen nu are „termen de hotărât”, dar poate fi cerut înapoi oricând: aplicația spune asta pe card. |
| Comodantul poate cere bunul **înainte de termen** la o nevoie urgentă și neprevăzută, la moartea comodatarului sau când acesta nu-și respectă obligațiile. | 2156 | De spus pe card. Un teren în comod fără contract nu ajunge la APIA: `docs/15-arenda.md` §2 (copia se depune doar la terenurile de la primărie sau ADS). |

## 6. Taxele la stat (Codul fiscal)

Sursa: Codul fiscal (Legea 227/2015), forma consolidată de pe
[static.anaf.ro](https://static.anaf.ro/static/10/Anaf/legislatie/Cod_fiscal_norme_2023.htm), „ultima actualizare:
LEGEA nr. 204/2026”, citit integral pe 18 nov 2026 (textul descărcat, nu rezumat). Cifrele sunt în
`contract-taxes-2026.json`.

### 6.1 TVA

| Regula | Articolul | Ce înseamnă pentru aplicație |
|---|---|---|
| Cota standard e **21%**. | 291 (1) | Servicii, leasing, utilaje, piese: 21% (din `vat-2026.json`, aceeași cifră). |
| Cota redusă de **11%** pentru apa de irigații, îngrășămintele și pesticidele folosite în agricultură, semințele de însămânțat și **serviciile folosite în mod normal în producția agricolă, prevăzute prin ordin comun MF–MADR**. Pentru îngrășămintele și pesticidele chimice (lit. f), până la **31 decembrie 2031**. | 291 (2) lit. d), e), f); (3^3) | Un contract `supply` cu semințe sau îngrășăminte: 11%. Un contract `service` de lucrări agricole poate fi la 11%, dar **doar serviciile din ordinul comun**, necitit (#46). Până atunci, serviciile rămân la 21% și fermierul poate schimba cota de pe factură. |
| **Taxarea inversă** la livrarea de **cereale și plante tehnice**, inclusiv semințe oleaginoase și sfeclă de zahăr, care nu sunt în principiu pentru consumatorul final. Condiția obligatorie: **ambii** sunt înregistrați în scopuri de TVA. Pe factură nu se scrie TVA; cumpărătorul o trece în decont și ca TVA colectată, și ca deductibilă. Doar în țară. | 331 (1)–(3), (5) | La un contract `sale` de grâu, porumb, floarea-soarelui sau rapiță, între doi plătitori de TVA: **nicio sumă de TVA** nu se mișcă; card: „Taxare inversă: TVA-ul îl trece cumpărătorul”. Codurile NC sunt în norme (necitite pe cultură, #47). |
| Lit. c) (cerealele) se aplică **până la 31 decembrie 2026 inclusiv**. | 331 (6) | Pentru o livrare din **2027**, aplicația nu mai aplică taxarea inversă și spune că regula s-ar putea prelungi (#27 rămâne deschisă: propunerea Comisiei). |
| **Regimul special pentru agricultori**: persoana fizică, PFA, II sau IF care face producție agricolă (și alte activități doar sub plafonul de scutire) poate notifica ANAF; e trecut în Registrul public al agricultorilor. **Nu colectează TVA**, **nu deduce** TVA, nu depune decont. | 315^1 (1) lit. b), (4), (5), (7) | La `legal_form` pf/pfa/ii/if, aplicația întreabă „Ești în regimul special pentru agricultori?”. Dacă da: TVA-ul de pe facturile primite e un **cost** (nu se recuperează). |
| Agricultorul din regim primește o **compensație în cotă forfetară de 8%** (din 2019) pe prețul fără TVA al produselor vândute către alte persoane impozabile (nu către alți agricultori din regim), scrisă pe factură, cu mențiunea regimului. | 315^1 (2), (3), (8) | La un contract `sale` al unui agricultor din regim către un siloz sau comerciant: **+8%** din preț vin **de la cumpărător**, nu sunt o taxă la stat. Card: „Primești în plus compensația de 8%: X lei.” Rezolvă o parte din #29. |
| Plafonul de scutire pentru întreprinderile mici: **395.000 lei** cifră de afaceri pe an. | 310 (1) | Explică de ce o fermă poate să nu fie plătitoare de TVA. Aplicația nu hotărăște asta: citește `vat_status` din datele firmei. |
| Scutite (fără drept de deducere): **acordarea și negocierea de credite** și administrarea lor de către cel care le acordă; **operațiunile de asigurare** și serviciile intermediarilor de asigurări. | 292 (2) lit. a) pct. 1, lit. b) | Contractele `credit` și `insurance`: **fără TVA** (răspunde la C6: nicio linie de taxă). Serviciile externalizate de pe lângă (consultanță, de exemplu) nu sunt scutite (norme, din presă). |
| Decontul de TVA (formularul **300**) se depune până pe **25** a lunii de după perioada fiscală; TVA-ul se plătește până la aceeași dată. | 323 (1), 326 (1); OPANAF 591/2017 | Linia „TVA de plată” a unui plătitor de TVA: pe 25 a lunii de după (perioadă lunară presupusă; trimestrială e posibilă, #48). Aplicația nu face decontul: arată TVA-ul din contracte, iar contabilul face D300. |

Leasingul: n-am găsit o regulă specială în Titlul VII; rata de leasing e o prestare de servicii taxabilă, deci 21%
(art. 291 (1)). Rata reziduală, la cumpărare, e o livrare de bunuri, tot la 21%. Presa spune la fel; de confirmat (#48).

### 6.2 Impozitul pe venit al firmei

| Regula | Articolul | Ce înseamnă pentru aplicație |
|---|---|---|
| Microîntreprindere = persoană juridică română care, la 31 decembrie a anului de dinainte, are venituri de **cel mult 100.000 euro** (cu firmele legate), cel puțin **un salariat** și situațiile financiare depuse la timp. | 47 (1) lit. c), g), i); (1^1) | Pentru `legal_form` = `srl`. Aplicația nu verifică încadrarea: o întreabă o dată („Firma plătește impozit pe venitul microîntreprinderii?”). |
| Cota: **1%** din venituri. | 51 (1) | Un contract `sale` al unui SRL micro: impozit 1% din venitul din contract. |
| Se calculează și se plătește **trimestrial**, până pe **25** a lunii de după trimestru. | 56 (1) | Linia de taxă cade pe 25 aprilie, 25 iulie, 25 octombrie, 25 ianuarie. Formularul (D100) e din presă (#49). |

O persoană fizică, PFA sau II care e la **normă de venit** nu plătește impozit pe fiecare contract de vânzare: impozitul
e pe hectare, o dată pe an (`docs/05-taxes-pension.md` §1, Declarația unică). Pe card: „Nu plătești impozit pe
vânzarea asta: impozitul tău e pe normă, pe hectare.” Un SRL care nu e micro (impozit pe profit) nu e acoperit:
aplicația spune „întreabă contabilul”.

### 6.3 Impozitul pe teren (pentru arendă și comodat)

| Regula | Articolul | Ce înseamnă pentru aplicație |
|---|---|---|
| Impozitul pe teren îl datorează **proprietarul**, către bugetul local al comunei unde e terenul. | 463 (1), (3) | Între proprietar și arendaș se poate conveni altfel (`land_tax_by`), dar la primărie datorează proprietarul. |
| Se plătește în **două rate egale**, până pe **31 martie** și **30 septembrie**. Până la 31 martie, pentru tot anul, consiliul local poate da o **bonificație de până la 10%**. Sub 50 lei pe aceeași primărie, totul până la prima rată. | 467 (1)–(3) | Datele liniilor de taxă. Suma o scrie fermierul din decizia de impunere: cotele sunt pe localitate și nu le avem. |

### 6.4 Ce nu e taxă la stat

- **Credit**: nimic la stat (TVA scutit, art. 292); dobânda e un cost.
- **Asigurare**: nimic la stat pentru fermă (TVA scutit, art. 292). Răspunde la C6.
- **Comodat**: gratuit, deci nimic din contract; doar impozitul pe teren al proprietarului.

## 7. Ce rămâne de verificat

În `docs/11-open-questions.md`, întrebările 42–49:
1. Codul civil din sursa oficială (formularea de pe codulcivil.ro);
2. termenul de predare la vânzare când contractul nu-l spune (art. 1686–1693);
3. OG 51/1997 consolidată, art. 11–13, și un termen legal pentru anunțarea opțiunii la leasing;
4. asigurarea: începutul și sfârșitul acoperirii, reînnoirea, RCA-ul utilajelor;
5. ordinul comun MF–MADR cu serviciile agricole la 11%;
6. codurile NC pentru taxarea inversă, pe fiecare cultură din catalog;
7. perioada fiscală de TVA (lunară sau trimestrială) și TVA-ul la leasing;
8. formularul pentru impozitul pe venitul microîntreprinderii.
