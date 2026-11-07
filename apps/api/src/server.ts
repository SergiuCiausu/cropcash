import { loadData } from '@cropcash/shared';
import { createApp } from './app';
import { supabaseRepo } from './db/repo';
import { supabaseAdminRepo } from './db/admin';
import { supabaseFactory } from './db/supabase';
import { loadEnv } from './env';
import { supabaseTokenVerifier } from './middleware/auth';
import { createStripe, MoneyService } from './stripe/money';

const env = loadEnv();
const data = loadData();
const db = supabaseFactory(env.supabaseUrl, env.supabaseAnonKey, env.supabaseServiceKey);

let money;
if (env.stripeSecretKey && env.stripeWebhookSecret) {
  const stripe = createStripe(env.stripeSecretKey);
  const admin = supabaseAdminRepo(db.admin());
  const webhookSecret = env.stripeWebhookSecret;
  money = {
    money: new MoneyService(stripe, admin, data),
    admin,
    verifyWebhook: (raw: Buffer, signature: string) => stripe.webhooks.constructEvent(raw, signature, webhookSecret),
    demoMode: env.demoMode,
    data,
  };
} else {
  console.warn('[api] STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET missing: money routes are off');
}

const app = createApp({
  corsOrigins: env.corsOrigins,
  verifyToken: supabaseTokenVerifier(env.supabaseUrl),
  repo: supabaseRepo(db),
  data,
  subsidyParams: env.exchangeRate ? { exchangeRates: { FEGA: env.exchangeRate, FEADR: env.exchangeRate } } : {},
  money,
});

app.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`);
});
