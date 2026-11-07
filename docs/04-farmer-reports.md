# 04. Rapoarte și registre pentru fermier

> Prioritate: **doar rambursarea accizei la motorină** e în plan (Should have, pasul 10). Celelalte sunt descrise pentru pitch și pentru roadmap.

## 1. Rambursarea accizei la motorină

| Ce | Valoare | Status |
|---|---|---|
| Suma rambursată | 2,213 lei/l | DE-VERIFICAT (din brief) |
| Frecvența | trimestrial | DE-VERIFICAT (din brief) |
| Acordul prealabil | până la 20 decembrie | DE-VERIFICAT (din brief) |
| Cantitatea maximă pe ha și cultură | — | DE-VERIFICAT (lipsește) |

**Ce date îi trebuie aplicației (`FuelLog`):** data, litrii, numărul facturii, furnizorul, cultura sau lucrarea și parcela (opțional).

**Ce generează automat:**
- totalul pe trimestru și suma de primit (`litri × 2,213`), afișată ca plată așteptată în calendar;
- situația centralizatoare pe trimestru (PDF sau tabel printabil), cu lista facturilor;
- un memento în calendar pentru acordul prealabil și pentru depunerea pe fiecare trimestru.

**Ce nu face:** nu depune la APIA, iar formatul oficial al situației e DE-VERIFICAT. În MVP generăm un tabel cu structura logică, nu formularul oficial.

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
