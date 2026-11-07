import { loadData } from '@cropcash/shared';
import { createApp } from './app';
import { supabaseRepo } from './db/repo';
import { supabaseFactory } from './db/supabase';
import { loadEnv } from './env';
import { supabaseTokenVerifier } from './middleware/auth';

const env = loadEnv();
const db = supabaseFactory(env.supabaseUrl, env.supabaseAnonKey, env.supabaseServiceKey);

const app = createApp({
  corsOrigins: env.corsOrigins,
  verifyToken: supabaseTokenVerifier(env.supabaseUrl),
  repo: supabaseRepo(db),
  data: loadData(),
  subsidyParams: env.exchangeRate ? { exchangeRates: { FEGA: env.exchangeRate, FEADR: env.exchangeRate } } : {},
});

app.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`);
});
