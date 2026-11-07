# CropCash

**Salariu lunar, fond pentru ani proști și pensie, din subvenția și recolta fermierului.**

Proiect de hackathon pentru challenge-ul Stripe „Rethinking Financial Futures”: *How might we make navigating the financial future a more accessible, relevant and empowering experience for people in Romania?*

## Problema
Fermierii mici din România își încasează venitul în 2–3 valuri imprevizibile (recolta vara și toamna, subvenția APIA din octombrie până în iunie anul următor), dar cheltuie lunar și mai ales primăvara. Trăiesc într-un ciclu de „bani mulți, apoi credit”, fără rezervă pentru ani proști și, de cele mai multe ori, fără pensie.

## Ce face CropCash
- calculează subvenția APIA ca **interval** (minim / probabil / maxim), pe tranșe;
- arată **un singur calendar** cu banii, termenele și lucrările;
- împarte fiecare încasare pe **plicuri** și calculează **salariul lunar** sigur;
- dimensionează **fondul pentru ani proști** și simulează **pensia** (Pilonul III / CEI);
- rulează fluxul de bani pe **Stripe Connect** (test mode): transferuri, payouts, subscriptions, Test Clocks.

## Documentația
Toată documentația e în [`docs/`](docs/). Se începe cu [`docs/01-product.md`](docs/01-product.md), iar planul de lucru e în [`docs/10-plan.md`](docs/10-plan.md).

## Rulare
Încă nu există cod. Comenzile vor fi adăugate la pasul 1 din plan (vezi `CLAUDE.md`).

> Demo în Stripe test mode. Datele sunt parțial simulate. În producție, păstrarea banilor ar necesita un partener licențiat.
