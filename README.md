# CropCash

**Salariu lunar și pensie, din subvenția și recolta fermierului.**

Proiect de hackathon pentru challenge-ul Stripe „Rethinking Financial Futures”: *How might we make navigating the financial future a more accessible, relevant and empowering experience for people in Romania?*

**Live (demo, Stripe test mode):** https://cropcash.netlify.app · API: https://cropcash-api.andreitutea.com

## Problema
Fermierii mici din România își încasează venitul în 2–3 valuri imprevizibile (recolta vara și toamna, subvenția APIA din octombrie până în iunie anul următor), dar cheltuie lunar și mai ales primăvara. Trăiesc într-un ciclu de „bani mulți, apoi credit” și, de cele mai multe ori, fără pensie.

## Ce face CropCash
- calculează subvenția APIA ca **interval** (minim / probabil / maxim), pe tranșe;
- arată **un singur calendar** cu banii, termenele și lucrările;
- împarte fiecare încasare pe **plicuri** și calculează **salariul lunar** sigur;
- simulează și pornește **pensia** (Pilonul III / CEI);
- are un asistent, **„Întreabă”**, care răspunde din cifrele fermei și propune salvări doar ca un card pe care fermierul îl apasă;
- citește hârtiile APIA și facturile din poze;
- urmărește ~179 de surse oficiale pentru oportunități de finanțare (`subventii-monitor/`);
- rulează fluxul de bani pe **Stripe Connect** (test mode): transferuri, payouts, subscriptions, Test Clocks, webhooks.

## Structura
- `web/`: interfața (Next.js, export static, PWA instalabil și offline).
- `apps/api/`: API-ul (Express + TypeScript), cu Stripe, Supabase și Claude.
- `packages/shared/`: logica pură (subvenții, plan, salariu, pensie) și registrul de funcții.
- `subventii-monitor/`: monitorul de surse oficiale.
- `supabase/migrations/`: schema bazei de date.
- `docs/`: documentația; cifrele stau doar în `docs/data/*.json`.

## Rulare
Cere **Node 24** și un `.env` completat după `.env.example`.

```bash
npm install
npm run dev      # web :5173 + api :3001
npm test         # testele unitare
```

Toate comenzile sunt în [`CLAUDE.md`](CLAUDE.md), iar deploy-ul în [`docs/12-deploy.md`](docs/12-deploy.md).

## Documentația
Se începe cu [`docs/01-product.md`](docs/01-product.md). Planul de lucru e în [`docs/10-plan.md`](docs/10-plan.md), starea proiectului în [`progress.md`](progress.md), iar demo-ul în [`docs/09-demo-pitch.md`](docs/09-demo-pitch.md).

> Demo în Stripe test mode. Datele sunt parțial simulate. În producție, păstrarea banilor ar necesita un partener licențiat.
