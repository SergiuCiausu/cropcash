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

## 3. Front-end pe Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new project** → **Import an existing project** → GitHub → repo-ul `cropcash`. `netlify.toml` setează build-ul (`npm run build -w @cropcash/next`, publish `web/out`); nu schimba nimic acolo.
2. **Project configuration → Environment variables**, înainte de primul deploy:

| Variabilă | Valoare |
|---|---|
| `VITE_SUPABASE_URL` | aceeași ca în `.env` |
| `VITE_SUPABASE_ANON_KEY` | aceeași ca în `.env` (cheia publică `sb_publishable_…`, niciodată cea secretă) |
| `VITE_API_URL` | `https://cropcash-api.andreitutea.com` |
| `VITE_DEMO_MODE` | `true` |

3. Deploy. În **Project configuration → Change project name** poți alege numele (de exemplu `cropcash` → `cropcash.netlify.app`, dacă e liber).
4. Pune adresa finală în `CORS_ORIGINS` pe VPS și `pm2 reload cropcash-api`.
5. **Supabase** → Authentication → URL Configuration: **Site URL** = adresa Netlify, și adaug-o la **Redirect URLs** (pentru linkul din email).

Variabilele `VITE_*` intră în build, deci după o schimbare a lor e nevoie de **Deploys → Trigger deploy**.

## 4. Webhooks Stripe

Stripe Dashboard (test mode) → Developers → Webhooks → **Add endpoint**:
- URL: `https://cropcash-api.andreitutea.com/api/webhooks/stripe`
- ascultă pe **contul tău** și pe **conturile conectate**;
- evenimente: `payment_intent.succeeded`, `invoice.paid`, `payout.paid`, `payout.failed`.

Copiază **Signing secret** (`whsec_…`) în `STRIPE_WEBHOOK_SECRET` pe VPS (nu cel de la `stripe listen`), apoi `pm2 reload cropcash-api`. Fluxul merge și fără webhooks, dar așa se confirmă și plățile venite din Stripe.

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
