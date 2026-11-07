# 06. Feature-uri și user flow

## Prioritizarea (MoSCoW)

### Must have (MVP-ul pentru demo)
1. **Onboarding în 2 minute:** hectare pe cultură, județ, nume, vârstă (sub 40 de ani înseamnă tânăr fermier). **Animalele nu sunt în MVP**: schemele cuplate stau în JSON cu `enabled: false` și se decide la final dacă intră. Opțional: upload de adeverință sau decizie APIA (PDF), din care AI-ul extrage datele (extragerea e la pasul 10).
2. **Calculatorul de subvenții:** un motor de reguli pe scheme. Rezultatul e un interval minim / probabil / maxim, defalcat pe avans și sold. Vezi `03-subsidies.md`.
3. **Calendarul banilor și al sarcinilor:** o singură axă de timp cu încasări, plăți, termene și lucrări. Golul martie–mai e evidențiat.
4. **Plicurile și „salariul” lunar:** la fiecare încasare, aplicația propune împărțirea pe plicuri, iar algoritmul de netezire calculează salariul maxim sigur.
5. **Pensia:** o simulare a pensiei la 65 de ani. (Fondul pentru ani proști a fost scos pe 7 nov 2026: salariul nu mai pune nimic deoparte pentru un an slab.)
5a. **Asistentul:** Ion întreabă în română și primește răspunsuri din cifrele fermei lui. AI-ul arată efectul, nu spune da sau nu, iar orice salvare cere o apăsare pe un card de confirmare.
5b. **Vocea:** buton de microfon pe fiecare tab și răspunsuri citite cu voce tare. Tastatura rămâne mereu disponibilă.

### Should have
6. Prognoza de vânzări: tone × preț în 3 scenarii, preț de rentabilitate, proiecții pe trimestre pentru anul curent + 2 ani. În paginile statice, Prognoză are și un cursor de 1–10 ani pentru cei trei ani (slab, normal, bun).
7. Istoric: prețuri pe lună, producții pe județ (INS), vreme (Open-Meteo).
8. Toggle-ul „an de secetă”.
9. Raportul pentru acciza la motorină.
9a. Notificările: rezumatul de duminică, avertizarea din noiembrie despre aprilie, termenele.
9b. Golurile din `docs/use-cases.md`: bani fără nume, APIA care plătește mai puțin, cheltuieli care se repetă, corectarea înregistrărilor, scoaterea banilor din fond, pensia sărită o lună, verificarea SMS-urilor false, partajarea cu fiica.

### Could have
10. Radarul de fonduri: un job săptămânal pe AFIR, APIA și MADR, cu extragere LLM, potrivire pe profil, notificare și termen în calendar.

### Won't have (doar în pitch)
- Integrare cu APIA sau AGI Online (nu există API public).
- Păstrarea reală a banilor (necesită un partener licențiat).
- Execuție reală de investiții sau contribuții de pensie.

## User flow, ecran cu ecran

**Designul vine din prototipul final al echipei** (github.com/SergiuCiausu/cropcash, commit „Finished UI”): stilul „Daylight” (fundal deschis, o zonă colorată puternic pentru cifrele principale, culori plate, font Geist) și **6 palete de culori** la alegere, salvate pe dispozitiv.
- **Telefon (sub 760 px), `farm-app/mobile/c-deck.html`:** zona colorată sus, cu carduri pe care le treci cu degetul (bani acum + grafic, subvenția) și 3 cifre-cheie, apoi plăci de acțiune, salariul, cheltuielile și ce urmează; bara de taburi jos. Stilurile sunt în `apps/web/src/styles/deck.css`.
- **Laptop, `farm-app/desktop/2-rail.html`:** bară laterală colorată, antet de pagină cu acțiuni, grilă de carduri. Stilurile sunt în `styles/rail.css`.
- **Diferențe față de prototip:** am scos „Înregistrează o vânzare / cheltuială”, „Activitate recentă”, „Costuri de anulat” și comutatoarele de reguli, pentru că încă nu au date în spate. În locul lor sunt salariul cu creditul (pasul 5), plicurile și banii pentru lunile grele. Graficele pentru laptop sunt desenate de mână (varianta de rezervă din prototip), nu cu Recharts.

Navigația are 4 taburi: **Acasă** · **Prognoză** („Îți ajung banii?”: grafic pe 12 luni cu an slab / normal / bun, cifre-cheie, unde se duc banii, lună cu lună) · **Culturi** (câștig pe hectar, prețul la care nu pierzi) · **Rezerve** (plicurile, banii pentru lunile grele). Detaliile subvenției, „Iau un credit” și contul se deschid într-o fereastră care urcă de jos. Butonul de microfon apare pe fiecare tab și deschide, tot într-o fereastră de jos, foaia „Întreabă”, așa că navigația rămâne la 4 taburi.

> Tabelele de mai jos descriu primul flux gândit. Onboarding-ul (O1–O7) e implementat așa. Ecranele B/C/Î/D au fost înlocuite de cele 4 taburi de mai sus, iar conținutul lor s-a mutat acolo.

### O. Onboarding (o singură dată, ~2 minute)

| # | Ecran | Ce vede | Ce apasă | Ce urmează |
|---|---|---|---|---|
| O1 | Bun venit | „Îți arătăm cât primești, când vin banii și cât poți cheltui pe lună.” | **Începe** | O2 |
| O2 | Județul | listă cu căutare | alege „Teleorman” | O6 |
| O6 | Hârtia de la APIA (opțional) | „Ai o hârtie de la APIA? Cererea sau decizia de plată.” Cererea completează hectarele, decizia păstrează și suma. | **Sar peste** | O3 |
| O3 | Culturile | carduri mari: Grâu, Porumb, Floarea-soarelui, cu „câte hectare?” și butoane +/− | 8 ha grâu, 7 ha porumb → **Gata** | O4 |
| O4 | Numele și vârsta | „Cum te cheamă?” și „Câți ani ai?” (număr mare) | Ion, 55 → **Gata** | O5 |
| O5 | Banii de acum (opțional) | „Cam câți bani ai acum?” Ne trebuie ca să-i spunem dacă îi ajung. | 35.000 → **Arată-mi banii** (sau „Nu știu, sar peste” = 0) | O7 |
| O7 | Rezultatul | „De la APIA primești cam **16.900 lei**” (între 15.200 și 17.100) | **Vezi când vin banii** | C1 |

Pe O7 apare și lista schemelor („Sprijin de bază ✓, Redistributiv ✓, Eco-schemă ✓”), iar la detalii schemele care nu se aplică și motivul („Tineri fermieri: doar sub 40 de ani”).

### B. Tabul „Bani”: „Câți bani am?”

| # | Ecran | Ce vede | Ce apasă |
|---|---|---|---|
| B1 | Acasă | Cifra mare: **„Salariul tău luna asta: 2.400 lei”**, plus plicurile ca bare (Primăvară, Datorii, Salariu, Bătrânețe) | un plic → B2 |
| B2 | Plicul | soldul plicului, istoricul mișcărilor | — |
| B3 | „Au intrat bani!” (când intră o tranșă) | „Au intrat **12.649 lei** de la APIA. Îți propunem așa:” plus împărțirea pe plicuri, editabilă cu slidere | **Bine așa** / **Schimb** |

### C. Tabul „Calendar”: „Când vin banii?”

| # | Ecran | Ce vede |
|---|---|---|
| C1 | Axa de timp | 12–15 luni verticale. Fiecare lună: ↓ bani care intră (verde), ↑ bani care ies (roșu), termene (📄) și lucrări (🚜). Linia soldului e mică pe lateral. **Martie–mai sunt colorate**: „Aici se termină banii de obicei.” |
| C2 | Detaliul evenimentului | „Restul de la APIA: între 1 decembrie și 30 iunie. Nu știm exact luna. Noi am socotit că vine abia în iunie, ca să fii acoperit.” |

### Î. Tabul „Îmi ajung?”

| # | Ecran | Ce vede | Ce apasă |
|---|---|---|---|
| Î1 | Scenarii | 3 butoane mari: **An bun / An normal / An de secetă**. Salariul sigur și grafic simplu al soldului | „An de secetă” → salariul scade, apare cât intră mai puțin și cu cât rămâi mai puțin la final |
| Î3 | Bătrânețea (`pensie.html`) | sus „La 65 de ani ai **29.400 lei**”; slider „Cât pui pe lună?” între 50 și 500 lei, cu suma sugerată și cum se schimbă salariul („de la 850 lei la 650 lei”); fondul (opțional, A–Z); graficul „Dacă banii cresc mai încet sau mai repede” (butoane 2% / 4% / 6% pe an: linia aleasă plină, celelalte punctate, plus „Ce pui tu”); „De ce nu Casa de Pensii?” cu fondurile Pilonului III de la A la Z și suma minimă a fiecăruia | **Pornesc** (creează subscription-ul). Cu pensia pornită: **Schimbă suma** sau **Opresc pensia**, fiecare cu o confirmare |
| Î1b | Golul de primăvară | „Fără credit, poți scoate sigur **650 lei** pe lună. Ca să ai **2.400 lei**, o să ai nevoie de ~**14.000 lei** în aprilie. Fermierii iau de obicei credit pe adeverința APIA.” (informativ, fără bănci) | **Iau un credit** → formular: sumă, lună, lună de rambursare → planul se recalculează |
| Î4 | Vânzarea recoltei (Should) | slider pentru preț și producție, plus „Prețul la care nu pierzi: 0,85 lei/kg” | — |

### D. Tabul „De făcut”

Lista sarcinilor ordonate după termen: „Depune cererea APIA până pe 5 iunie”, „Cere acordul pentru motorină până pe 20 decembrie (de verificat)”, „Declarația Unică până pe 25 mai”. Fiecare are un buton **Am făcut**. Tot aici intră și raportul pentru motorină (D2) și oportunitățile din radar (D3, Could).

## Date simulate în demo

| Ce | Cum e simulat |
|---|---|
| Încasarea APIA | plată de test în Stripe, transferată în contul conectat al lui Ion |
| Vânzarea recoltei | introdusă manual sau plată de test |
| Cheltuieli (inputuri, arendă, rată credit) | generate din `crops-reference.json` și din datele demo ale lui Ion |
| Trecerea timpului | Stripe Test Clock plus „ceasul aplicației” sincronizat cu el |
| Istoricul județului | DE-VERIFICAT; până la datele INS, un set de demo marcat explicit „date ilustrative” |
| Contul bancar al lui Ion | IBAN de test Stripe |
| Pensia | subscription în test mode |
