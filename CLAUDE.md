# CropCash

Aplicație de hackathon pentru challenge-ul Stripe „Rethinking Financial Futures” (România). CropCash transformă subvențiile APIA și recolta fermelor mici și mijlocii (5–50 ha), care vin în 2–3 valuri pe parcursul a până la 15 luni, într-un **salariu lunar** și o **pensie**. Pe lângă asta, ține calendarul termenelor. Persona: Ion, 55+ ani, 15 ha grâu și porumb în Teleorman, doar cu telefonul.

## Faza curentă
- FAZA 1 (documentație) e gata. **FAZA 2 începe doar la `START`.** Apoi urmezi `docs/10-plan.md` pas cu pas.
- După fiecare pas: `npm test` verde → bifezi pasul în `docs/10-plan.md` → o frază de status. **Nu faci commit după fiecare pas:** commit doar când ți se cere.
- Dacă o decizie de arhitectură diferă de docs, întrebi înainte.

## Stack-ul
Interfața e **`web/`** (Next.js, export static în `web/out`, PWA cu service worker, merge offline). Paginile au fost portate din vechiul `farm-app`; scripturile lor stau în `web/legacy/`. `farm-app` și `apps/web` au fost scoase · Express + TS în `apps/api` · logica pură în `packages/shared` · Supabase (DB + login email/parolă) · Stripe (test mode) · Claude API + Zod · Vitest.
Deploy: front pe **Netlify**, API pe **VPS RareCloud** (pm2 + Caddy cu HTTPS), DB în **Supabase cloud**. Fără Railway.

## Comenzile (după pasul 1)
```bash
npm install
npm run dev          # web (Next.js) :5173 + api :3001
npm run build        # web (web/out, cu sw.js) + api
npm run build:web    # doar web
npm test             # Vitest (unit, offline)
npm run test:integration  # pe Supabase-ul real din .env (RLS, auth)
npm run db:migrate   # aplică supabase/migrations/*.sql (SUPABASE_DB_URL, pooler eu-west-2)
npm run typecheck
npm run seed:demo    # datele lui Ion (docs/data/demo-ion.json), ceasul la 15 nov 2026, ~20 s
npm run demo:rehearse  # scriptul din 09 §3 de 3 ori, pe Supabase + Stripe reale (~6 min); apoi iar seed:demo
stripe listen --events payment_intent.succeeded,invoice.paid,payout.paid,payout.failed --forward-to localhost:3001/api/webhooks/stripe --forward-connect-to localhost:3001/api/webhooks/stripe
npm run test:stripe  # flux cap-coadă pe sandbox-ul Stripe (lent, ~1-2 min)
```

## Reguli
- **UI în română, cu diacritice**, cu limbaj simplu. Fără „lichiditate”, „cash-flow”, „portofoliu”, „randament”. Textele stau în pagini (`web/app/*/page.tsx` și `web/legacy/*.js`).
- **Codul e în engleză** (nume, comentarii, commit-uri).
- **Stripe doar în test mode.** Aplicația refuză cheile care nu încep cu `sk_test_`.
- **Cifrele vin doar din `docs/data/*.json`.** Nicio cifră hardcodată în componente sau în logică.
- **Nu inventa cifre.** O cifră lipsă înseamnă `null` + `DE-VERIFICAT` + o intrare în `docs/11-open-questions.md`.
- Banii se țin în bani/eurocenți, ca **numere întregi**. Niciodată float.
- `packages/shared` = funcții pure, fără I/O, cu teste.
- Testele trebuie să treacă înainte de orice commit.
- **Offline-first:** orice feature nou spune ce face fără net. Un buton care cere net primește `data-needs-net="motivul"`, iar `app.js` îl oprește fără net și spune de ce (vezi `docs/07-architecture.md` §8). Operațiile care mută bani nu se pun niciodată în coada offline. Vânzările și cheltuielile înregistrate de fermier pot intra în coadă, pentru că doar notează ce s-a întâmplat deja.
- Secretele stau doar în `.env` (vezi `.env.example`), niciodată în cod.

## Monitorul de subvenții (`subventii-monitor/`)
Script separat, adus din repo-ul echipei. Urmărește ~179 de surse oficiale (lista e în `subventii-surse.md`, în rădăcină) și extrage oportunitățile de finanțare în tabelele `sources`, `runs`, `snapshots`, `change_events`, `links_seen`, `opportunities` (migrațiile 004–007). Are propriul `.env` (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CONTACT_EMAIL`). Comenzi: `npm test -w subventii-monitor`, `npm run seed -w subventii-monitor`, `npm run monitor -w subventii-monitor`, `npm run documents -w subventii-monitor` (umple căutarea din aplicație cu textul deja salvat). Planul și starea lui: `subventii-plan.md`, `progress.md`, `glossary.md` (în rădăcină).

## Ce citești și când
| Fișier | Citește-l înainte să... |
|---|---|
| `docs/01-product.md` | lucrezi la orice ecran sau text de UI |
| `docs/02-problem-context.md` | scrii pitch sau texte explicative |
| `docs/03-subsidies.md` + `data/subsidies-2026.json` + `data/subsidies-history.json` | atingi motorul de subvenții |
| `docs/04-farmer-reports.md` | lucrezi la raportul de motorină sau la registre |
| `docs/05-taxes-pension.md` | lucrezi la pensie sau la impozit |
| `docs/06-features-mvp.md` | construiești un ecran (flow-ul ecran cu ecran) |
| `docs/07-architecture.md` | creezi fișiere sau tabele, sau lucrezi la netezire ori scenarii |
| `docs/08-stripe.md` | atingi orice cod Stripe sau webhooks |
| `docs/09-demo-pitch.md` | faci polish pentru demo sau date de seed |
| `docs/10-plan.md` | începi un pas nou (și bifezi la final) |
| `docs/12-deploy.md` | faci deploy (Netlify, VPS cu pm2 + Caddy, webhooks Stripe) |
| `docs/11-open-questions.md` | folosești o cifră marcată DE-VERIFICAT |
| `data/calendar-2026.json` | lucrezi la calendar sau termene |
| `data/crops-reference.json` | lucrezi la scenarii, cheltuieli pe luni sau prognoză |
