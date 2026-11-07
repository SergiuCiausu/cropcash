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
| CAS opțional minim | 48.600 × 25% = **12.150 lei/an** (~1.012 lei/lună) | idem |
| Creșterea salariului minim | 4.325 lei din iulie 2026, nu schimbă baza | idem |

**De ce fermierii nu au pensie:** venitul pe normă e aproape întotdeauna sub pragul de 48.600 lei, deci CAS-ul nu e obligatoriu. Opțional costă 12.150 lei/an, adică o mare parte din câștigul net al unei ferme de 15 ha. Ca urmare, aproape nimeni nu plătește. Iar 44,3% dintre manageri au deja peste 65 de ani (2020).

## 3. Alternativele realiste

| Opțiune | Cine | Cum | Sursă |
|---|---|---|---|
| **Pilonul III** (pensie facultativă) | orice persoană rezidentă de peste 18 ani | contribuții lunare flexibile; ~1,1 milioane de participanți; media ~167 lei/lună | [bugetul.ro](https://www.bugetul.ro/pilonul-3-de-pensii-a-ajuns-la-88-miliarde-de-lei-cine-poate-beneficia-de-acesti-bani-care-este-procedura/) |
| **CEI-S** (Legea 202/2026, din 1 ian 2027) | orice persoană fizică | contribuții din venitul net, retrageri scutite de impozit | [alba24.ro](https://alba24.ro/romanii-vor-putea-economisi-si-investi-bani-fara-impozit-din-2027-noua-lege-a-fost-publicata-in-monitorul-oficial-1162874.html) |
| **CEI-D** | orice persoană fizică | deducere la contribuție, impozit la retragere | idem |
| CAS opțional | sub prag | minimum 12.150 lei/an | contapp.ro |

Plafonul de deductibilitate pentru Pilonul III și plafoanele CEI sunt `DE-VERIFICAT`.

**Recomandarea în aplicație (simplă):** „Pune deoparte X lei pe lună pentru bătrânețe.” Implicit propunem **Pilonul III** (există azi). CEI e opțiunea „din 2027”. Nu recomandăm un fond anume, pentru că nu suntem consultant de investiții.

## 4. Cum simulăm pensia

**Intrări:** vârsta actuală, contribuția lunară C, randamentul anual presupus r (3 scenarii) și vârsta țintă de 65 de ani.

```
n = (65 − vârsta) × 12
i = r / 12
suma_la_65 = C × ((1 + i)^n − 1) / i
total_pus = C × n
```

**Randamentele de scenariu** sunt parametri configurabili, nu promisiuni: **2% / 4% / 6% pe an**. E o presupunere de produs, listată în open questions. În UI apare doar „cel mai probabil”, iar intervalul stă la detalii.

**Exemplu pentru Ion (55 de ani, 200 lei/lună, 4%):** n = 120 de luni, deci ≈ **29.450 lei** la 65 de ani, din care 24.000 lei puși de el.

**Ce afișăm:** „Dacă pui 200 lei pe lună, la 65 de ani ai cam 29.000 lei, adică vreo 245 lei în plus pe lună timp de 10 ani.” (29.450 / 120 ≈ 245.) Conversia în „lei pe lună” e o ilustrare simplă, nu o anuitate reală.

**Contribuția sugerată:** cel mult 5% din salariul lunar calculat de algoritmul de netezire, rotunjit la 50 de lei. E o presupunere de produs.

## 5. Ce e simulat

Contribuția e o **subscription Stripe în test mode** (vezi `08-stripe.md`). Nu se deschide un cont real de Pilon III sau CEI.
