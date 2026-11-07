# 05. Taxe și pensie

## 1. Impozitarea fermierului persoană fizică

- **Norma de venit:** venitul nu se calculează din încasări reale, ci pe normă, stabilită pe județ, pe cultură și pe hectar.
  - Exemplu din brief: Vrancea, cereale, **237 lei/ha în 2026**, status `DE-VERIFICAT`.
  - Normele pentru Teleorman (persona Ion) lipsesc și sunt `DE-VERIFICAT`.
- **Impozitul:** 10% din venitul pe normă.
- **Exemplu (ilustrativ, dacă norma ar fi 237 lei/ha):** 15 ha × 237 = 3.555 lei venit pe normă, deci impozit 355,50 lei/an.
- Eventualele praguri de scutire (suprafețe neimpozabile pe cultură) și CASS-ul pe venitul agricol nu sunt în sursele noastre și sunt `DE-VERIFICAT`.
- **În aplicație:** impozitul estimat apare ca plată în calendar (Declarația Unică, 25 mai) și e scăzut din plicuri.

## 2. CAS (pensia de stat)

| Parametru | Valoare | Sursă / status |
|---|---|---|
| Salariul minim (baza) | 4.050 lei | [contapp.ro](https://contapp.ro/blog/plafoane-fiscale-2026-pentru-pfa-ii-si-microintreprinderi/), confirmat-2026 |
| Prag CAS obligatoriu | 12 salarii minime = 48.600 lei/an | idem |
| CAS opțional, contract cu Casa de Pensii | **1.081 lei/lună** din 1 iulie 2026 (25% din 4.325 lei), adică ~12.975 lei pe un an întreg. Înainte: 1.013 lei/lună | [alba24.ro](https://alba24.ro/contributia-voluntara-la-pensie-s-a-majorat-din-iulie-2026-care-este-valoarea-minima-care-trebuie-platita-1147199.html), 7 iulie 2026 |
| CAS opțional, Declarația Unică | 48.600 × 25% = **12.150 lei/an** la baza din ianuarie 2026. Dacă se schimbă după iulie e `DE-VERIFICAT` | [economica.net](https://www.economica.net/asigurarea-optionala-la-pilonul-i-de-pensii-costa-12-150-de-lei-daca-va-asigurati-la-nivelul-salariului-minim-in-2026_907561.html), 29 ian. 2026 |
| Pensia minimă garantată | 1.281 lei/lună, cu cel puțin 15 ani de contribuții. O primește pensionarul, nu e o sumă de plătit | [avocatnet.ro](https://www.avocatnet.ro/articol_71675/Cine-beneficiaz%C4%83-de-pensia-minim%C4%83-garantat%C4%83-in-2026.html) |

**De ce fermierii nu au pensie:** venitul pe normă e aproape întotdeauna sub pragul de 48.600 lei, deci CAS-ul nu e obligatoriu. Opțional costă peste 12.000 lei/an, adică o mare parte din câștigul net al unei ferme de 15 ha. Ca urmare, aproape nimeni nu plătește. Iar 44,3% dintre manageri au deja peste 65 de ani (2020).

## 3. Alternativele realiste

| Opțiune | Cine | Cum | Sursă |
|---|---|---|---|
| **Pilonul III** (pensie facultativă) | orice persoană rezidentă de peste 18 ani | contribuții lunare flexibile; ~1,1 milioane de participanți; media ~167 lei/lună | [bugetul.ro](https://www.bugetul.ro/pilonul-3-de-pensii-a-ajuns-la-88-miliarde-de-lei-cine-poate-beneficia-de-acesti-bani-care-este-procedura/) |
| **CEI-S** (Legea 202/2026, din 1 ian 2027) | orice persoană fizică | contribuții din venitul net, retrageri scutite de impozit | [alba24.ro](https://alba24.ro/romanii-vor-putea-economisi-si-investi-bani-fara-impozit-din-2027-noua-lege-a-fost-publicata-in-monitorul-oficial-1162874.html) |
| **CEI-D** | orice persoană fizică | deducere la contribuție, impozit la retragere | idem |
| CAS opțional | sub prag | peste 12.000 lei/an (§2) | §2 |

**Minimul la Pilonul III:** statul nu fixează o sumă minimă, cel puțin în sursele găsite. Fiecare fond are minimul lui, între 25 și 100 de lei pe lună. Lista cu sursele e în `data/pension-funds.json`. Fermierul alege fondul, iar lista e alfabetică, ca să nu pară o recomandare.

Plafonul de deductibilitate pentru Pilonul III și plafoanele CEI sunt `DE-VERIFICAT`.

**Recomandarea în aplicație (simplă):** „Pune deoparte X lei pe lună pentru bătrânețe.” Implicit propunem **Pilonul III** (există azi). CEI e opțiunea „din 2027”. Nu recomandăm un fond anume, pentru că nu suntem consultant de investiții.

Cifrele din §2 și §3 pe care le arată pagina de pensie („De ce nu Casa de Pensii?”) stau în `data/pension-options.json`, cu sursa și statusul lor. Fondurile Pilonului III apar acolo de la A la Z, doar cu suma minimă din `data/pension-funds.json`; nu le comparăm după cât cresc.

## 4. Cum simulăm pensia

**Intrări:** vârsta actuală, contribuția lunară C, randamentul anual presupus r (3 scenarii) și vârsta țintă de 65 de ani.

```
n = (65 − vârsta) × 12
i = r / 12
suma_la_65 = C × ((1 + i)^n − 1) / i
total_pus = C × n
```

**Randamentele de scenariu** sunt parametri configurabili, nu promisiuni: **2% / 4% / 6% pe an**. E o presupunere de produs, listată în open questions. Suma mare din UI folosește doar „cel mai probabil” (4%). Graficul de pe pagina de pensie arată toate trei an de an până la 65, cu cel ales linie plină, plus cât pune fermierul.

**Exemplu pentru Ion (55 de ani, 200 lei/lună, 4%):** n = 120 de luni, deci ≈ **29.450 lei** la 65 de ani, din care 24.000 lei puși de el.

**Ce afișăm:** „Dacă pui 200 lei pe lună, la 65 de ani ai cam 29.000 lei, adică vreo 245 lei în plus pe lună timp de 10 ani.” (29.450 / 120 ≈ 245.) Conversia în „lei pe lună” e o ilustrare simplă, nu o anuitate reală.

**Contribuția sugerată:** 5% din salariul lunar calculat de algoritmul de netezire, rotunjit în jos la 50 de lei, dar niciodată sub minim. Minimul e cel al fondului ales. Fără fond ales sau dacă suma fondului lipsește, e 50 de lei, o alegere a noastră, nu un minim al statului. Dacă minimul depășește 5% din salariu, spunem asta. Fără salariu nu sugerăm nimic. E o presupunere de produs.

**Exemplu pentru Ion:** la 850 lei salariu, 5% înseamnă 42,50 lei, deci sugerăm 50 lei (5,9%), 25 lei la Stabil sau 100 lei la Raiffeisen Acumulare, a cărui sumă e `DE-VERIFICAT`.

## 5. Ce e simulat

Contribuția e o **subscription Stripe în test mode** (vezi `08-stripe.md`). Nu se deschide un cont real de Pilon III sau CEI.
