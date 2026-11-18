# 12. Deploy (pasul 9)

| Ce | Unde | Adresa |
|---|---|---|
| Front-end (`web/`, Next.js export static) | **Netlify** | `https://<site>.netlify.app` |
| API (`apps/api`) | **VPS Ubuntu** `85.121.53.233`, sub pm2, în spatele Caddy (HTTPS automat) | `https://cropcash-api.andreitutea.com` |
| DB + login | **Supabase cloud** | neschimbat |

Fișierele din repo: `netlify.toml`, `deploy/Caddyfile`, `deploy/ecosystem.config.cjs`.

**De ce API-ul are nevoie de un nume de domeniu:** pagina de pe Netlify e pe HTTPS, iar browserul nu o lasă să cheme un API pe HTTP. HTTPS cere un certificat, iar Let's Encrypt dă certificate pe nume, nu pe IP. Numele `cropcash-api.andreitutea.com` doar arată spre VPS; datele merg direct din browser la VPS.

## 1. DNS (Namecheap, o singură dată)

Domain List → `andreitutea.com` → **Manage** → **Advanced DNS** → **Add New Record**:

| Type | Host | Value | TTL |
|---|---|---|---|
| A Record | `cropcash-api` | `85.121.53.233` | Automatic |

Verificare (după câteva minute): `nslookup cropcash-api.andreitutea.com` arată `85.121.53.233`.

## 2. API pe VPS (o singură dată)

Porturile **80** și **443** trebuie să fie deschise (Let's Encrypt verifică domeniul pe 80). Dacă `ufw` e pornit: `sudo ufw allow 22,80,443/tcp`.

```bash
# Node 22, git, pm2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
sudo npm install -g pm2

# Caddy, din repo-ul oficial
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# Proiectul (dacă repo-ul e privat, git cere un token GitHub ca parolă)
sudo mkdir -p /srv/cropcash && sudo chown $USER /srv/cropcash
git clone https://github.com/SergiuCiausu/cropcash.git /srv/cropcash
cd /srv/cropcash
```

**`.env`:** copiază-l de pe calculator (în PowerShell, pe Windows), niciodată prin git:

```
scp C:\projects\CropCash\.env UTILIZATOR@85.121.53.233:/srv/cropcash/.env
```

Pe VPS, în `/srv/cropcash/.env`, schimbă:
- `CORS_ORIGINS=https://<site>.netlify.app` (adresa reală de la pasul 3; la început poate rămâne cea de acum);
- `OPEN_METEO_BASE_URL` gol sau `https://api.open-meteo.com` (serviciul public). Open-Meteo instalat local cere minim 8 GB RAM și configurare (`open-meteo-vps-setup.md`); pentru hackathon nu e nevoie.
- `STRIPE_WEBHOOK_SECRET` vine la pasul 4.

```bash
npm ci
npm run build -w @cropcash/api
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup          # rulează comanda pe care o afișează, ca API-ul să pornească după un restart

sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl https://cropcash-api.andreitutea.com/api/health    # {"ok":true}
```

API-ul încarcă bibliotecile monitorului din `node_modules` la rulare, deci pe VPS rămâne `npm ci` complet, nu doar `dist/`.

**Probleme:** `pm2 logs cropcash-api` (API-ul), `sudo journalctl -u caddy -n 50` (certificatul HTTPS).

**Actualizare după un push:**

```bash
cd /srv/cropcash && git pull && npm ci && npm run build -w @cropcash/api && pm2 reload cropcash-api
```

## Ordinea la o versiune nouă

1. `npm run db:migrate`: migrațiile doar adaugă, deci codul vechi merge mai departe. Codul nou citește coloana `harvests_version` (019), iar fără ea `/api/me` pică.
2. API-ul pe VPS.
3. Front-end-ul pe Netlify. Un build pe Netlify se oprește dacă `VITE_API_URL` lipsește sau nu e `https://`.

Aplicația de telefon (React Native + Expo) e descrisă în `docs/14-mobile-expo.md`. Dacă se schimbă adresa site-ului, se schimbă și acolo.

## 3. Front-end pe Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new project** → **Import an existing project** → GitHub → repo-ul `cropcash`. `netlify.toml` setează build-ul (`npm run build -w @cropcash/next`, publish `web/out`); nu schimba nimic acolo.
2. **Project configuration → Environment variables**, înainte de primul deploy:

| Variabilă | Valoare |
|---|---|
| `VITE_SUPABASE_URL` | aceeași ca în `.env` |
| `VITE_SUPABASE_ANON_KEY` | aceeași ca în `.env` (cheia publică `sb_publishable_…`, niciodată cea secretă) |
| `VITE_API_URL` | `https://cropcash-api.andreitutea.com` |
| `VITE_DEMO_MODE` | `true` |
| `VITE_MAPTILER_KEY` | opțional: cheia MapTiler pentru „Satelit” pe Harta. E publică; restrânge-o la adresa site-ului în contul MapTiler |

3. Deploy. În **Project configuration → Change project name** poți alege numele (de exemplu `cropcash` → `cropcash.netlify.app`, dacă e liber).
4. Pune adresa finală în `CORS_ORIGINS` pe VPS și `pm2 reload cropcash-api`.
5. **Supabase** → Authentication → URL Configuration: **Site URL** = adresa Netlify, și adaug-o la **Redirect URLs** (pentru linkul din email). Tot acolo adaugă și `https://<adresa-netlify>/login?mode=new-password`, pentru parola uitată. La **Email Templates → Reset Password** pune textul în română. Serverul de email inclus în Supabase trimite doar câteva emailuri pe oră, deci pentru fermieri reali îți trebuie un SMTP propriu.
   - **Invitațiile contabilului (migrația 028):** adaugă la **Redirect URLs** și `https://<adresa-netlify>/invitatie**` și `https://<adresa-netlify>/login**` (linkul are `?cod=…`, iar după confirmarea contului `?next=…`). Pune în română **Email Templates → Invite user** și **Magic Link**: primul pleacă la un contabil fără cont, al doilea la unul cu cont. Dacă emailul nu pleacă (limita pe oră), API-ul tot dă linkul, iar fermierul îl trimite pe WhatsApp. `CORS_ORIGINS` trebuie să aibă adresa Netlify **prima**: linkul arată spre ea.

Variabilele `VITE_*` intră în build, deci după o schimbare a lor e nevoie de **Deploys → Trigger deploy**.

### Fără acces Netlify la GitHub: deploy de pe calculator

Site-ul `https://cropcash.netlify.app` e făcut așa (8 nov 2026), pentru că repo-ul e privat și Netlify nu-l vede din contul nostru. Nu se actualizează la `git push`; după o schimbare în `web/`:

```bash
npx netlify-cli login                                                     # o singură dată
VITE_API_URL=https://cropcash-api.andreitutea.com npm run build:web       # în Git Bash; restul valorilor vin din .env
npx netlify-cli deploy --prod --no-build --dir web/out --filter @cropcash/next
```

Când proprietarul repo-ului dă acces aplicației Netlify (GitHub → Settings → Applications), site-ul se leagă de repo din Netlify → Project configuration → Build & deploy, cu variabilele din tabelul de mai sus.

## 4. Webhooks Stripe

Stripe nu mai lasă o singură destinație pentru ambele surse, deci sunt **două** destinații spre același URL. Stripe Dashboard (test mode) → Developers → Webhooks → **Add destination**, de două ori:

| Destinația | Scope | Evenimente (Snapshot, API version implicit) |
|---|---|---|
| 1 | **Your account** | `payment_intent.succeeded`, `invoice.paid` (avansul simulat și pensia, pe platformă) |
| 2 | **Connected accounts** | `payout.paid`, `payout.failed` (salariul, pe contul conectat al fermierului) |

URL-ul, la amândouă: `https://cropcash-api.andreitutea.com/api/webhooks/stripe`.

Fiecare destinație are propriul **Signing secret** (`whsec_…`). Pe VPS, în `.env`, pune-le pe amândouă, separate prin virgulă (nu cel de la `stripe listen`):

```
STRIPE_WEBHOOK_SECRET=whsec_contul_tau,whsec_conturi_conectate
```

apoi `pm2 reload cropcash-api --update-env`. API-ul încearcă fiecare secret. Fluxul merge și fără webhooks, dar așa se confirmă și plățile venite din Stripe.

## 5. Verificare

- `https://cropcash-api.andreitutea.com/api/health` → `{"ok":true}`.
- Site-ul Netlify se deschide, iar login-ul cu contul demo merge.
- „Întreabă” răspunde (cere `ANTHROPIC_API_KEY` în `.env` pe VPS).
- Pe telefon: „Adaugă pe ecranul principal”, apoi modul avion: aplicația se deschide cu ultimele date.

## 6. Înainte de pitch

Pe calculator, cu `.env`-ul local (scriu în același Supabase și Stripe):

```bash
npm run seed:demo          # contul lui Ion, ceasul la 15 noiembrie 2026 (~20 s)
npm run demo:rehearse      # scriptul din 09 §3 de 3 ori la rând (~6 min); la final, rulează iar seed:demo
```

`demo:rehearse` lasă contul lui Ion în starea de după demo. **Rulează `npm run seed:demo` ultimul.**

## 7. Facturile (Oblio, ANAF e-Factura)

Fără nimic din ce e mai jos, facturile merg pe simulator (seriile `SIM-`), ca până acum.

1. **Migrația 041** (`041_invoices.sql`): `npm run db:migrate` de pe calculator, ca la orice versiune nouă.
2. **`INVOICING_KEY`** în `.env` pe VPS: `openssl rand -base64 32`, o singură dată. **Nu se mai schimbă:** cu altă cheie, cheile Oblio și tokenurile ANAF salvate nu se mai deschid și fiecare fermă se leagă din nou. Ține o copie în afara VPS-ului.
3. **ANAF:** aplicația înregistrată la ANAF (Servicii online > Înregistrare utilizatori > Dezvoltatori aplicații), cu callback-ul `https://cropcash-api.andreitutea.com/api/anaf/callback` (trebuie să fie exact același, cu https). Apoi `ANAF_CLIENT_ID`, `ANAF_CLIENT_SECRET` și `ANAF_REDIRECT_URI` în `.env`. Caddy trimite deja `/api/*` la API, deci nu e nimic de schimbat acolo.
4. **`CORS_ORIGINS`** cu adresa site-ului: ANAF întoarce browserul contabilului acolo (`/contabil#spv=…`).
5. `pm2 reload cropcash-api`.

**Poller-ul** (facturile trimise, cele primite de la ANAF, tokenurile ANAF ținute la zi) merge în procesul API-ului, la `INVOICING_POLL_S` secunde (implicit din `anaf-efactura.json`, `0` îl oprește), doar cu `INVOICING_KEY`. Nu are proces pm2 separat: un singur proces înseamnă o singură reînnoire de token pe fermă (ANAF schimbă tokenul de reînnoire la fiecare reînnoire). Dacă vreodată API-ul rulează în mai multe instanțe, poller-ul trebuie mutat cu un lacăt în baza de date.

**Trecerea pe producție (ANAF):**
- Fără `INVOICING_ALLOW_PROD=true` (exact așa) nicio fermă nu ajunge pe gazda de producție ANAF: legăturile noi sunt pe gazda de test, iar una pusă pe producție nu mai merge până se pornește iar.
- Cu el, o fermă trece pe producție doar după o probă reușită pe gazda de test, cu CIF-ul ei: din card, „Fă proba la ANAF” (o factură de 1 leu, doar pe test), apoi „Treci pe facturile adevărate”. Pe producție, „Primite” are facturile adevărate ale fermei din SPV.
- Facturile emise merg tot prin Oblio. **Oblio nu are comutator:** o fermă legată de Oblio dă facturi adevărate din prima (decis pe 17 nov 2026); cardul o spune înainte de legare.

**Verificare:** `npm run test:efactura` (validatorul public ANAF, fără logare); `EFACTURA_FARM_ID=<id> npm run test:efactura` după ce o fermă e legată; `npm run test:oblio` cu un cont Oblio de probă. În `pm2 logs cropcash-api`, poller-ul scrie doar ce pică (`invoice poll …`).
