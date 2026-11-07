import { createApp } from './app';
import { supabaseFactory } from './db/supabase';
import { loadEnv } from './env';
import { supabaseTokenVerifier } from './middleware/auth';

const env = loadEnv();

const app = createApp({
  corsOrigins: env.corsOrigins,
  verifyToken: supabaseTokenVerifier(env.supabaseUrl),
  db: supabaseFactory(env.supabaseUrl, env.supabaseAnonKey, env.supabaseServiceKey),
});

app.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`);
});
