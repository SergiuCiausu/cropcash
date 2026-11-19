# 04. Rapoarte și registre pentru fermier

> **Rapoarte PDF (faza 1, 14 nov 2026):** rezumatul fermei, registrul încasărilor și plăților și situația subvențiilor APIA se descarcă din `/rapoarte`. Planul și fazele următoare: `docs/rapoarte-pdf-plan.md`.
>
> Prioritate: **doar rambursarea accizei la motorină** e în plan (Should have, pasul 10). Celelalte sunt descrise pentru pitch și pentru roadmap.

## 1. Rambursarea accizei la motorină

> Făcut (14 nov 2026) ca raport PDF în /rapoarte: litrii se notează pe cheltuiala de motorină (Recolte → Mai multe detalii), nu într-un jurnal separat. Cota vine din `docs/data/fuel-excise.json`. Vezi `docs/rapoarte-pdf-plan.md` §7 faza 2.

> **Verificat pe 19 nov 2026** (HG 1174/2014, forma consolidată la 18.09.2026). Toate cifrele stau în `docs/data/fuel-excise.json`, iar termenele în `docs/data/calendar-2026.json`. Ecranul **„De raportat”** (`/de-raportat`) le arată fermierului, cu litrii din trimestru, acciza de primit și ce duce la APIA.

| Ce | Valoare | Status |
|---|---|---|
| Suma rambursată | depinde de data facturii: 2,697 lei/l (1 ian–6 apr 2026 și din 1 iul), 2,397 (7 apr–30 iun), 1,996–2,557 în criza carburanților; 2,213 / 2,444 în 2025 | confirmat în HG; perioadele din criză sunt DE-VERIFICAT (întrebarea 15) |
| Frecvența | trimestrial: cererea de plată până la sfârșitul lunii de după trimestru | regula e confirmată, datele sunt socotite (întrebarea 51) |
| Acordul prealabil | până pe 20 decembrie, mutat după weekend (22 dec 2025 pentru 2026) | confirmat; 2027 nu e anunțat, schema se termină pe 31.12.2026 (întrebarea 50) |
| Cantitatea maximă pe ha și cultură | cereale, oleaginoase, leguminoase 78 l/ha; cartof 150; vie 125 etc. (anexa HG), pe grupele din tabelul APIA | confirmat |
| Ce se depune | facturile, situația centralizatoare (Anexa 9, OMADR 1727/2015), extrasul SPV; la animale și Anexa 10 | confirmat |

**Ce date îi trebuie aplicației (`FuelLog`):** data, litrii, numărul facturii, furnizorul, cultura sau lucrarea și parcela (opțional).

**Ce generează automat:**
- totalul pe trimestru și suma de primit (`litri × 2,213`), afișată ca plată așteptată în calendar;
- situația centralizatoare pe trimestru (PDF sau tabel printabil), cu lista facturilor;
- un memento în calendar pentru acordul prealabil și pentru depunerea pe fiecare trimestru.

**Ce nu face:** nu depune la APIA, iar formatul oficial al situației e DE-VERIFICAT. În MVP generăm un tabel cu structura logică, nu formularul oficial.

**Monitorul:** paginile oficiale pe care stau aceste cifre sunt în `watch_urls` (în ambele fișiere) și în `subventii-surse.md`. Când una se schimbă, raportul zilnic al monitorului are secțiunea „Obligații de re-verificat”, cu ce trebuie citit din nou. Actualizarea JSON-ului o face un om.

## 2. Registrul de tratamente fitosanitare

- **Obligație:** registrul se păstrează **3 ani** (din brief; temeiul legal e DE-VERIFICAT).
- **Date:** data, parcela, cultura, produsul, doza/ha, suprafața tratată, motivul, operatorul.
- **Ce poate genera aplicația:** registrul în format tabelar, din lucrările introduse în calendar, plus un export PDF.
- **Status:** roadmap, nu e în plan.

## 3. Registrul zilierilor

- **Date:** numele, CNP-ul, data, ore/zi, suma plătită, semnătura.
- **Ce poate genera aplicația:** lista pe lună și totalul plătit (cu impact în plicuri, ca cheltuială).
- **Status:** roadmap. Obligațiile legale exacte (Legea zilierilor, raportare) sunt DE-VERIFICAT.

## 4. Registrul agricol

- Se ține la primărie. Fermierul declară terenul, animalele și culturile.
- **Ce poate face aplicația:** un rezumat cu datele din profil (hectare pe cultură, animale), pregătit pentru declarare.
- **Status:** roadmap. Termenele de declarare sunt DE-VERIFICAT.

## Rezumat

| Raport | În plan? | Date de intrare | Generat automat | DE-VERIFICAT |
|---|---|---|---|---|
| Acciză motorină | Da (pasul 10) | `FuelLog` | totaluri, situația centralizatoare, plată în calendar | suma/l, termenele, formularul |
| Tratamente fitosanitare | Nu | lucrări | registrul | temeiul legal |
| Zilieri | Nu | plăți | registrul pe lună | obligațiile |
| Registrul agricol | Nu | profil | rezumatul | termenele |
