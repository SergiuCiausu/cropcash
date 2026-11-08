# 06. Feature-uri și user flow

## Prioritizarea (MoSCoW)

### Must have (MVP-ul pentru demo)
1. **Onboarding în 2 minute:** hectare pe cultură, județ, nume, vârstă (sub 40 de ani înseamnă tânăr fermier). **Animalele nu sunt în MVP**: schemele cuplate stau în JSON cu `enabled: false` și se decide la final dacă intră. Opțional: upload de adeverință sau decizie APIA (PDF), din care AI-ul extrage datele (extragerea e la pasul 10).
2. **Calculatorul de subvenții:** un motor de reguli pe scheme. Rezultatul e un interval minim / probabil / maxim, defalcat pe avans și sold. Vezi `03-subsidies.md`.
3. **Calendarul banilor și al sarcinilor:** o singură axă de timp cu încasări, plăți, termene și lucrări. Golul martie–mai e evidențiat.
4. **Plicurile și „salariul” lunar:** la fiecare încasare, aplicația propune împărțirea pe plicuri, iar algoritmul de netezire calculează salariul maxim sigur.
5. **Pensia:** o simulare a pensiei la 65 de ani. (Fondul pentru ani proști a fost scos pe 7 nov 2026: salariul nu mai pune nimic deoparte pentru un an slab.)
5a. **Asistentul „Întreabă” (făcut, 8 nov 2026):** Ion întreabă în scris, în română, și primește răspunsuri din cifrele fermei lui. AI-ul arată efectul, nu spune da sau nu, iar orice salvare cere o apăsare pe un card de confirmare.
5b. ~~**Vocea**~~: scoasă pe 8 nov 2026, la cererea echipei.

### Should have
6. Prognoza de vânzări: tone × preț în 3 scenarii, preț de rentabilitate, proiecții pe trimestre pentru anul curent + 2 ani. În paginile statice, Prognoză are și un cursor de 1–10 ani pentru cei trei ani (slab, normal, bun).
7. Istoric: prețuri pe lună, producții pe județ (INS), vreme (Open-Meteo).
8. Toggle-ul „an de secetă”.
9. Raportul pentru acciza la motorină.
9a. Notificările: rezumatul de duminică, avertizarea din noiembrie despre aprilie, termenele.
9b. Golurile din `docs/use-cases.md`: bani fără nume, APIA care plătește mai puțin, cheltuieli care se repetă, corectarea înregistrărilor, pensia sărită o lună, verificarea SMS-urilor false, partajarea cu fiica.

### Could have
10. Radarul de fonduri: un job săptămânal pe AFIR, APIA și MADR, cu extragere LLM, potrivire pe profil, notificare și termen în calendar.

### Won't have (doar în pitch)
- Integrare cu APIA sau AGI Online (nu există API public).
- Păstrarea reală a banilor (necesită un partener licențiat).
- Execuție reală de investiții sau contribuții de pensie.

## User flow, ecran cu ecran

**Designul vine din prototipul final al echipei** (github.com/SergiuCiausu/cropcash, commit „Finished UI”): stilul „Daylight” (fundal deschis, o zonă colorată puternic pentru cifrele principale, culori plate, font Geist) și **6 palete de culori** la alegere, salvate pe dispozitiv.
- **Interfața de acum (8 nov 2026)** e aplicația Next.js din `web/`, cu paginile vechi din `farm-app` învelite în rute (`web/app/*/page.tsx` + `web/legacy/*.js`). Stilurile sunt în `web/styles/` (`shared.css`, `desktop.css`, `rail.css`, `subsidies.css`).
- **Laptop:** bară laterală colorată cu paginile, antet de pagină cu acțiuni, grilă de carduri.
- **Telefon (sub 760 px):** aceeași bară devine o bară de taburi jos, iar sus rămâne o bandă colorată scurtă.
- **Paginile:** Acasă · Subvenții (cu Oportunități și Ce s-a schimbat) · Calendar · Prognoză · Recolte · Salariu (cu Datele planului și Contul tău) · Pensie. Butonul „Întreabă” stă în colțul din dreapta jos pe toate, mai puțin la onboarding.
- **Taburile pe culturi:** Acasă, Subvenții, Calendar, Prognoză și Recolte au sus o bandă cu „Toată ferma” și câte un tab pentru fiecare cultură din recolta aleasă, plus „+ Adaugă”. Un tab schimbă cifrele pe loc, fără să reîncarce pagina și fără altă adresă. Alegerea rămâne pe telefon și merge și fără internet. Butonul de lângă meniu alege doar anul recoltei. Salariu, Contul tău și Pensie arată mereu toată ferma, pentru că țin de un singur cont.
- **„Pe culturi”:** sub „Toată ferma”, pe Acasă și Prognoză, un tabel arată pentru fiecare cultură ce intră, ce iese și ce rămâne pe toată recolta. Ce nu ține de o cultură (cheltuieli comune, credite) are rândul lui, ca rândurile să dea exact totalul.
- Planurile mai vechi, cu `farm-app/mobile/c-deck.html` și `farm-app/desktop/2-rail.html`, au fost înlocuite; fișierele nu mai sunt în repo.
- **Diferențe față de prototip:** am scos „Înregistrează o vânzare / cheltuială”, „Activitate recentă”, „Costuri de anulat” și comutatoarele de reguli, pentru că încă nu au date în spate. În locul lor sunt salariul cu creditul (pasul 5), plicurile și banii pentru lunile grele. Graficele pentru laptop sunt desenate de mână (varianta de rezervă din prototip), nu cu Recharts.

> Varianta cu 4 taburi (Acasă, Prognoză, Culturi, Rezerve) și butonul de microfon a fost un plan intermediar. Navigația de acum e cea de mai sus.

> Tabelele de mai jos descriu primul flux gândit. Onboarding-ul (O1–O3 + rezultatul) e implementat așa. Ecranele B/C/Î/D au fost înlocuite de paginile de mai sus, iar conținutul lor s-a mutat acolo.

### Cum intri în aplicație

| De unde | Ce vezi | Ce apeși | Ce urmează |
|---|---|---|---|
| Prima pagină, fără cont | „Fă-ți cont”, „Intră în cont”, „Vezi ferma lui Ion” | **Fă-ți cont** | `/login?mode=register`, apoi onboarding |
| Prima pagină, cu sesiune pe telefon | „Mergi la ferma ta” | **Mergi la ferma ta** | `/acasa` |
| Orice pagină a fermei, fără cont | nimic din fermă | – | `/login`, iar după login te întoarce unde voiai să ajungi |
| Ferma lui Ion (`/ferma-lui-ion/acasa`) | aplicația cu datele lui Ion și o bandă sus: „Asta e ferma lui Ion, un exemplu.” | **Fă-ți cont** sau **Pornește din nou** | ce schimbi rămâne doar pe acest dispozitiv; pe pagina Bani nu se mută bani |

În timp ce pagina pornește, se vede un skeleton cu forma ei. Detalii: `07-architecture.md` §9.

### O. Onboarding (o singură dată, 3 pași)

| # | Ecran | Ce vede | Ce apasă | Ce urmează |
|---|---|---|---|---|
| O1 | Despre tine și fermă | „Hai să-ți vedem banii.” Numele, vârsta și județul (listă derulantă) pe același ecran. Cere cont: ferma se salvează mereu pe server. | Ion, 55, Teleorman → **Mai departe** | O2 |
| O2 | Culturile | Butonul pentru hârtia de la APIA (opțional: cererea completează hectarele, decizia păstrează și suma), apoi Grâu, Porumb, Floarea-soarelui cu butoane +/− și suma de la APIA, calculată pe loc cu vârsta | 8 ha grâu, 7 ha porumb → **Mai departe** | O3 |
| O3 | Banii de acum (opțional) | „Câți bani ai acum?” Ne trebuie ca să-i spunem dacă îi ajung. | 35.000 → **Arată-mi banii** (sau „Nu știu, sar peste” = 0) | Rezultatul |
| – | Rezultatul | „De la APIA primești **16.900 lei**” (între 15.200 și 17.100) | **Vezi cât îți aduce ferma**, sau „Spune-ne ce ai strâns și ce ai semănat” (Recolte) | Prognoză |

Ce a strâns fermierul și când a semănat nu se mai întreabă la onboarding. Până le completează pe Recolte, folosim mediile și luna obișnuită de semănat. Când ferma e refăcută („Schimbă ferma”), ce era deja salvat pe Recolte rămâne.

### B. Tabul „Bani”: „Câți bani am?”

| # | Ecran | Ce vede | Ce apasă |
|---|---|---|---|
| B1 | Acasă | Cifra mare: **„Salariul tău luna asta: 2.400 lei”**, plus plicurile ca bare (Cheltuieli fermă, Datorii, Salariu, Pensie) | un plic → B2 |
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
| Î3 | Pensia (`/pensie`) | sus „La 65 de ani ai **29.400 lei**”; slider „Cât pui pe lună?” între 50 și 500 lei, cu suma sugerată și cum se schimbă salariul („de la 850 lei la 650 lei”); fondul (opțional, A–Z); graficul „Dacă banii cresc mai încet sau mai repede” (butoane 2% / 4% / 6% pe an: linia aleasă plină, celelalte punctate, plus „Ce pui tu”); „De ce nu Casa de Pensii?” cu fondurile Pilonului III de la A la Z și suma minimă a fiecăruia | **Pornesc** (creează subscription-ul). Cu pensia pornită: **Schimbă suma** sau **Opresc pensia**, fiecare cu o confirmare |
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
