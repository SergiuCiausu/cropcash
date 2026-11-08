# 02. Problema și contextul românesc

## Cifrele de context

| Fapt | Valoare | An | Sursă | Status |
|---|---|---|---|---|
| Cereri de plată APIA | **671.334** (cu 37.018 mai puține decât anul trecut) | 2026 | [economedia](https://economedia.ro/campania-apia-2026-s-a-incheiat-suprafata-declarata-a-crescut-iar-numarul-cererilor-a-scazut.html) | confirmat-2026 |
| Suprafața declarată | **9.766.322 ha** | 2026 | idem | confirmat-2026 |
| Ferme în România | 2,9 milioane, adică 31,8% din exploatațiile UE | 2020 | brief (digi24, cursdeguvernare) | din-2020 |
| Ferme sub 5 ha | 90,3% | 2020 | idem | din-2020 |
| Manageri de fermă peste 65 de ani | 44,3% | 2020 | idem | din-2020 |
| Insolvențe în agricultură, S1 | **226** de firme agricole, față de 127 în S1 2025 (aproape +80%; analiză CITR pe date ONRC, [capital.ro](https://www.capital.ro/criza-din-agricultura-romaneasca-se-adanceste-insolventele-au-crescut-cu-aproape-80-iar-sute-de-firme-sunt-in-pericol.html)) | 2026 | [forbes.ro](https://www.forbes.ro/criza-fara-precedent-in-agricultura-romaneasca-insolventele-au-explodat-cu-aproape-80-in-primul-semestru-514318) | confirmat-2026 |
| Recolta de grâu 2025 | AFR estima în iulie 2025 13,3–14 mil. tone, cel mai mare nivel din 1997. **Estimare, nu cifra finală** | 2025 | [agerpres](https://agerpres.ro/english/2025/07/28/wheat-production-could-reach-record-level-in-2025-says-head-of-romanian-farmers-association--1471668) | estimare |
| Fermier din Călărași | „A fost 2022, 2023, 2024, 2025, ani secetoși” și „s-a împrumutat la bănci, a rostogolit niște datorii și mai rău s-a înfundat” | 2026 | [bzi.ro](https://www.bzi.ro/statistici-ingrijoratoare-a-crescut-numarul-firmelor-din-agricultura-cu-probleme-anul-acesta-este-un-drum-la-rascruce-5532708) | citat |

> ⚠️ Brief-ul vechi spune „~800.000 de cereri”. Cifra e greșită. Folosim **671.334**.

### Costuri, producții și prețuri (2025–2026)

Sursă: [capital.ro](https://www.capital.ro/este-agricultura-profitabila-in-romania-in-2026-analiza-costuri-vs-venituri-pentru-fermieri.html), status `din-2025`. Datele structurate sunt în `data/crops-reference.json`.

| Cultură | Cost (lei/ha) | Producție (t/ha) | Preț (lei/kg) | Preț de rentabilitate la medie |
|---|---|---|---|---|
| Grâu | 3.500–5.000 | 4–6 | 0,90–1,20 | 4.250 / 5.000 kg ≈ **0,85 lei/kg** |
| Porumb | 4.000–6.000 | 5–8 | 0,80–1,10 | 5.000 / 6.500 kg ≈ **0,77 lei/kg** |
| Floarea-soarelui | 3.500–5.500 | 2–3 | 1,80–2,50 | 4.500 / 2.500 kg ≈ **1,80 lei/kg** |

Subvențiile acoperă 15–25% din costuri la porumb și până la 30% la grâu. Concluzia: într-un an slab (producție minimă și preț minim), cultura iese pe pierdere, iar subvenția doar micșorează gaura.

## Ciclul banilor

| Etapă | Perioadă (campania 2026) | Ce înseamnă pentru Ion | Status |
|---|---|---|---|
| Depunerea cererii | 16 martie – 5 iunie 2026 | Fiica lui completează cererea. | confirmat-2026 |
| Controale pe teren | 1 iulie – 15 octombrie 2026 | Poate pierde bani dacă ce a declarat nu se potrivește. | confirmat-2026 |
| Avansul (75%) | 16 octombrie – 30 noiembrie 2026 | **Primul val mare de bani.** | confirmat-2026 |
| Soldul (restul) | 1 decembrie 2026 – 30 iunie 2027 | Nu știe în ce lună vine. | confirmat-2026 |
| Modificări ale datelor declarate | notificare în 15 zile | | din-brief |
| Declarația Unică | 25 mai 2027 | | confirmat |

**Banii pentru anul de cerere 2026 ajung în până la 15 luni de la depunerea cererii.** Plățile vin etapizat, nu toți fermierii primesc în aceeași zi.

### Anul lui Ion, pe luni (schemă)

```
Lună:     Iul  Aug  Sep  Oct  Noi  Dec  Ian  Feb  Mar  Apr  Mai  Iun
Intră:    GRÂU           PORUMB+AVANS APIA    ...... SOLD APIA (oricând) ......
Iese:     recolt.   arat  semănat                    ÎNGRĂȘ.  SEMĂNAT PORUMB
Sold:     ▲▲▲  ▲▲   ▲    ▲▲▲▲ ▲▲▲  ▲▲   ▲    ▼    ▼▼   ▼▼▼  ▼▼   ▼
                                               └──── GOLUL februarie–mai ────┘
```

Golul februarie–mai e momentul în care banii din toamnă s-au terminat, inputurile de primăvară trebuie plătite, iar soldul APIA încă n-a venit. Azi, golul se acoperă cu credit.

## De ce creditul pe adeverința APIA nu rezolvă problema

- Banca dă până la **90% din subvenție**, iar garanția e chiar subvenția de încasat.
- Dobânda: **bănci ROBOR 6M + maximum 2%**, **IFN-uri ROBOR 6M + maximum 8%** (comunicat APIA, 27 mai 2026).
- Exemplu BRD: comision de acordare 1%, scadență cel târziu la termenul de plată APIA (de obicei 30 iunie anul următor).

**Concluzia pentru pitch:** creditul e relativ ieftin. **Problema reală nu e costul creditului.** E că:
1. fermierul **nu planifică**: banii din toamnă se cheltuie fără un plan pe 12 luni;
2. **nu știe cât primește**: cuantumul real poate fi cu 10% sub cel planificat (BISS 2025) sau chiar cu 43% sub (PD-28 2025);
3. **nu are rezervă** pentru un an prost, iar insolvențele au crescut cu 80%;
4. **nu are pensie**, pentru că veniturile agricole nu presupun CAS obligatoriu.

Creditul mută problema cu câteva luni. CropCash o rezolvă pe tot anul.

## Problema în 3 propoziții (pentru pitch)

> Fermierii mici din România își încasează venitul anual în 2–3 valuri imprevizibile (recolta vara și toamna, subvenția din octombrie până în iunie anul următor), dar cheltuie lunar și mai ales primăvara. De aceea trăiesc într-un ciclu anual de „bani mulți, apoi credit”, fără economii pentru ani proști. Iar pentru că veniturile agricole nu presupun CAS obligatoriu, cei mai mulți nu își construiesc deloc pensie.
