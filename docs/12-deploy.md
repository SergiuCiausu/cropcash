# 12. Deploy (pasul 9)

Front pe **Netlify**, API pe **VPS-ul RareCloud** (pm2 + Caddy cu HTTPS), DB în **Supabase cloud**. Fișierele sunt gata în repo: `netlify.toml`, `deploy/Caddyfile`, `deploy/ecosystem.config.cjs`.

## Ce trebuie să ai înainte

| Ce | De ce |
|---|---|
| Un (sub)domeniu pentru API, de exemplu `api.cropcash.ro`, cu un record **A** spre IP-ul VPS-ului | Caddy cere un nume ca să ia certificatul HTTPS. Fără HTTPS, browserul blochează apelurile din Netlify (mixed content), iar Stripe nu trimite webhooks. |
| Acces SSH pe VPS, cu porturile 80 și 443 deschise | Let's Encrypt verifică domeniul pe portul 80. |
| Un cont Netlify legat de repo-ul GitHub | Build automat la fiecare push. |

## 1. API pe VPS (o singură dată)

```bash
# Node 22, pm2, Caddy (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
sudo npm install -g pm2
sudo apt-get install -y caddy

git clone <repo> cropcash && cd cropcash
npm ci
npm run build -w @cropcash/api
cp .env.example .env   # apoi completezi valorile (vezi mai jos)

pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup

# Caddy: pune domeniul în fișier și repornește
sudo sed "s/{\$API_DOMAIN}/api.cropcash.ro/" deploy/Caddyfile | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl https://api.cropcash.ro/api/health   # {"ok":true}
```

**`.env` pe VPS:** aceleași chei ca local (`STRIPE_SECRET_KEY` doar `sk_test_`, `SUPABASE_*`), plus:
- `CORS_ORIGINS=https://<site>.netlify.app` (adresa reală a site-ului Netlify);
- `STRIPE_WEBHOOK_SECRET` = secretul endpoint-ului public de la pasul 3, **nu** cel de la `stripe listen`;
- `DEMO_MODE=true` pentru butoanele de demo.

**Actualizare:** `git pull && npm ci && npm run build -w @cropcash/api && pm2 reload cropcash-api`.

## 2. Front pe Netlify

1. „Add new site” → importă repo-ul. `netlify.toml` setează build-ul (`npm run build -w @cropcash/web`, publish `apps/web/dist`, fallback SPA).
2. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL=https://api.cropcash.ro`, `VITE_DEMO_MODE=true`.
3. Deploy. Adresa site-ului intră în `CORS_ORIGINS` pe VPS (apoi `pm2 reload cropcash-api`).
4. În Supabase → Authentication → URL Configuration: adaugă adresa Netlify la Site URL / Redirect URLs.

## 3. Webhooks Stripe pe URL-ul public

În Stripe Dashboard (test mode) → Developers → Webhooks → Add endpoint:
- URL: `https://api.cropcash.ro/api/webhooks/stripe`
- „Listen to events on Connected accounts” **și** „on your account”
- Evenimente: `payment_intent.succeeded`, `invoice.paid`, `payout.paid`, `payout.failed`

Copiază „Signing secret” (`whsec_…`) în `STRIPE_WEBHOOK_SECRET` pe VPS și `pm2 reload cropcash-api`. Fluxul merge și fără webhooks (API-ul înregistrează direct), dar așa se confirmă și plățile venite din Stripe.

## 4. Înainte de pitch

```bash
npm run seed:demo          # contul lui Ion, ceasul la 15 noiembrie 2026 (~20 s)
npm run demo:rehearse      # scriptul din 09 §3 de 3 ori la rând (~6 min); la final, rulează iar seed:demo
```

`demo:rehearse` lasă contul lui Ion în starea de după demo. **Rulează `npm run seed:demo` ultimul.**
