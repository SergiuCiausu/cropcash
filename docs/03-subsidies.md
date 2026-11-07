# 03. Subvențiile APIA: logica de calcul

> **Citește înainte să lucrezi la motorul de subvenții.** Datele sunt în `data/subsidies-2026.json` și `data/subsidies-history.json`. Nicio cifră din acest fișier nu se scrie în cod, ci se citește din JSON.

## 1. Formula de bază

```
subvenție_lei = Σ_schemă ( unități_eligibile(schemă) × cuantum_eur(schemă) × curs(fond(schemă)) )
```

- `unități_eligibile` înseamnă hectare eligibile (sau capete, la schemele cuplate), după regulile de eligibilitate și `max_ha`.
- `curs` depinde de fondul schemei (`FEGA` / `FEADR`).
- **Precizia:** calculăm în **eurocenți și bani, ca numere întregi**, ca să evităm erorile de virgulă mobilă. Hectarele se țin în sutimi de hectar (ari). Rotunjirea se face la cent pentru fiecare schemă, apoi se adună.
- **Conversia în lei se face pe totalul în euro al fiecărui fond, nu pe fiecare schemă.** Dacă am converti schemă cu schemă, rotunjirile s-ar aduna: pentru Ion ar ieși 16.869,61 lei, nu 16.869,60. Suma în lei pe fiecare schemă e doar orientativă (`leiIndicative`). Soldul în lei = totalul în lei − avansul în lei, ca avansul și soldul să dea mereu exact totalul.

## 2. Mecanismul cuantumului (de ce suma e incertă)

```
cuantum = plafon_bugetar_schemă / suprafața_totală_determinată_la_nivel_național
```

Cu cât declară mai mulți fermieri, cu atât scade cuantumul. Exemple reale:
- **BISS 2025:** planificat 99,27 €/ha, real 89,34 €/ha (≈ −10%).
- **PD-28 2025:** planificat 58,18 → anunțat 20 → stabilit 32,9366 (s-au declarat ~5,9 milioane ha, peste estimări) → proiect de majorare la 40,2089.

De aceea **rezultatul e întotdeauna un interval**, nu o cifră fixă.

## 3. Schemele (campania 2026)

| Cod | Nume | Unitate | Cuantum (€) | Avans | Fond | Status |
|---|---|---|---|---|---|---|
| PD-01 | BISS, sprijin de bază | ha | 101,03 | 75% (75,77) | FEGA | confirmat-2026 |
| PD-02 | CRISS, redistributiv | ha | 55,69 | 75% | FEGA | confirmat-2026 |
| PD-03 | Tineri fermieri (<40 ani) | ha | 55,36 | 75% | FEGA | confirmat-2026 |
| PD-04 | Eco-schemă teren arabil | ha | 56,28 | 42,21 (75%) | FEGA | confirmat-2026 |
| PD-05 | Eco-schemă ferme mici | ha | 100 | 75 | FEGA | DE-VERIFICAT |
| PD-28 | Zone neproductive | ha | necunoscut (2025: 32,94–40,21) | — | FEGA | DE-VERIFICAT |
| CPL-VACI-LAPTE | Cuplat vaci de lapte | cap | 347,81 | — | FEGA | DE-VERIFICAT |
| CPL-VITA-CARNE | Cuplat vită de carne | cap | 244,72 | — | FEGA | DE-VERIFICAT |

Surse: [economica.net](https://www.economica.net/?p=981850), [financiarul.ro](https://financiarul.ro/agricultura/avansul-apia-incepe-pe-16-octombrie-cu-sume-maxime-intre-219-18-si-399/).

Fondul FEGA pentru toate plățile directe (Pilonul I) e o deducție din structura PAC. E listat de verificat în `11-open-questions.md`.

## 4. Reguli de eligibilitate

| Schemă | Regulă | Status |
|---|---|---|
| PD-01 | ferma ≥ 1 ha, parcele ≥ 0,3 ha | DE-VERIFICAT (nu apare în sursele noastre) |
| PD-02 | 1 ≤ total ha ≤ 50; **la 51 ha se pierde pe toată suprafața** | DE-VERIFICAT în PS PAC ([sursă secundară](https://folositor.ro/ghid/cat-castiga-un-fermier-in-romania)) |
| PD-03 | vârsta < 40 de ani | confirmat; alte condiții (prima instalare, plafon de ha) DE-VERIFICAT |
| PD-04 | teren arabil ≥ 10,01 ha; la 10,01–30 ha, minimum 2 culturi; parcele ≥ 0,3 ha | confirmat ([agrointel PDF](https://agrointel.ro/wp-content/uploads/2025/02/pd-04-agrointeligenta.pdf)); peste 30 ha DE-VERIFICAT |
| PD-05 | plafon de 10 ha | DE-VERIFICAT (e plafonul fermei sau suprafața plătită?) |
| PD-28 | se combină cu PD-04 și PD-05 | din brief |

### Cum sunt scrise regulile (declarativ, în JSON)

```json
{ "field": "arable_ha", "op": ">=", "value": 10.01 }
{ "if": { "field": "arable_ha", "op": "<=", "value": 30 },
  "then": [ { "field": "distinct_crops", "op": ">=", "value": 2 } ] }
```

Câmpurile disponibile (`FarmProfile`): `total_ha`, `arable_ha`, `distinct_crops`, `age`, `dairy_cows`, `beef_cattle`, `unproductive_ha`, `parcels[]`.

Motorul (`packages/shared/src/subsidies/`) e format din **funcții pure**:

```ts
evaluateRule(rule, profile): boolean
checkEligibility(scheme, profile): { eligible: boolean; reasons: string[]; unverified: string[] }
eligibleUnits(scheme, profile): number   // aplică parcel_min_ha și max_ha
computeScheme(scheme, profile, rates, factors): SchemeResult  // min / probable / max, avans, sold
computeSubsidies(profile, data, params): SubsidyResult
```

`reasons` explică în română de ce o schemă nu se aplică (de exemplu: „Ai 9 ha, trebuie minimum 10,01 ha”). `unverified` listează regulile `DE-VERIFICAT` folosite, ca UI-ul să poată arăta „(de verificat)”.

## 5. Intervalul minim / probabil / maxim

Din `subsidies-history.json`, pentru fiecare an cu valori reale și planificate:

```
factor_an = cuantum_real / cuantum_planificat_PNS
min_factor = min(factor_an)
max_factor = max(1, max(factor_an))
probable_factor = 1
```

**Pentru BISS:**

| An | Planificat | Real | Factor |
|---|---|---|---|
| 2023 | 96,47 | 97,57 | 1,0114 |
| 2024 | 97,85 | 96,39 | 0,9851 |
| 2025 | 99,27 | 89,34 | 0,9000 |

Rezultă `min_factor ≈ 0,900` și `max_factor ≈ 1,011`.

- **Schemele fără istoric** (PD-02, PD-03, PD-04, PD-05) folosesc factorii de la BISS (`fallback_scheme`). E o presupunere de produs, listată în open questions.
- **PD-28** nu intră în calculul MVP. Dacă o adăugăm, are intervalul propriu: 32,94 (min) – 40,21 (max) €/ha din 2025.
- Factorii se calculează în cod din JSON, nu se scriu de mână.
- **Avansul** e calculat pe cuantumul de referință (probabil), pentru că e deja anunțat. **Incertitudinea stă doar în sold:** `sold_min = total_min − avans`. Dacă `sold_min < 0`, se afișează 0, iar UI-ul avertizează („s-ar putea să nu mai primești nimic din rest”).

## 6. Cursul de schimb

- Plățile se fac în lei, la cursul BCE stabilit înainte de 1 octombrie, **diferit pe fond**.
- Campania 2025: **FEGA 5,0806**, **FEADR 4,9743** lei/€ (`din-2025`).
- Campania 2026: cursul BCE din 30 septembrie 2026 e **DE-VERIFICAT**. Până atunci folosim parametrul configurabil `default_param = 5,28`.
- În UI, cursul apare doar la detalii: „calculat la 5,28 lei/€”.

## 7. Tranșele

| Tranșă | Când | Cât | Pentru calendar |
|---|---|---|---|
| Avans | 16 oct – 30 nov 2026 | 75% × cuantum de referință | pesimist: 30 nov · mediu: 1 nov · optimist: 16 oct |
| Sold | 1 dec 2026 – 30 iun 2027 | total − avans, ca interval | pesimist: 30 iun · mediu: 1 mar · optimist: 1 dec |

Datele pe scenarii sunt o **presupunere de produs**, nu date APIA. Scenariul pesimist folosește întotdeauna ultima zi a ferestrei.

## 8. Test case (obligatoriu, în Vitest)

Fermier cu 15 ha de cereale, în 2 culturi, fără tânăr fermier, fără animale:

| Schemă | Calcul | € |
|---|---|---|
| PD-01 BISS | 15 × 101,03 | 1.515,45 |
| PD-02 CRISS | 15 × 55,69 | 835,35 |
| PD-04 Eco arabil | 15 × 56,28 | 844,20 |
| **Total (probabil)** | | **3.195,00 €** |

- În lei, la cursul de 5,28: **16.869,60 lei**.
- Avans: 15 × (75,7725 + 41,7675 + 42,21) = **2.396,25 €**, adică **12.652,20 lei**. (Avansul la PD-01 și PD-02 se calculează ca 75% din cuantum, nu cu valoarea rotunjită 75,77.)
- Interval orientativ: min ≈ 2.875 € (≈ 15.180 lei), max ≈ 3.231 € (≈ 17.060 lei).

**Aserțiunile din test:**
1. Totalul în euro iese exact 3.195,00 (adică 319.500 de eurocenți).
2. Schemele eligibile sunt exact PD-01, PD-02 și PD-04. PD-03 nu se aplică (55 de ani), iar PD-05 nu se aplică (15 ha > 10).
3. Totalul în lei = totalul în euro × parametrul de curs (cu 5,28 iese 16.869,60).
4. `min ≤ probabil ≤ max`.

**Teste suplimentare de limită:** 10,00 ha (fără PD-04) și 10,01 ha (cu PD-04); 15 ha cu o singură cultură (fără PD-04); 50 ha (cu CRISS) și 51 ha (fără CRISS); vârsta de 39 de ani (cu PD-03) și de 40 de ani (fără); o parcelă de 0,29 ha, care nu intră în suprafața PD-04.

## 9. Ce e confirmat pentru 2026 și ce nu

**Confirmat:** cuantumurile PD-01–PD-04, avansul de 75%, ferestrele de plată și regulile PD-04 până la 30 ha.

**Neconfirmat:** cursul 2026; PD-05 (cuantumul și plafonul); PD-28 (cuantumul); schemele cuplate (cuantumurile și condițiile); pragul CRISS în textul PS PAC; condițiile complete PD-03; minimul de 1 ha la BISS; istoricul pentru PD-02–PD-05.
