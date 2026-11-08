import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadData } from '@cropcash/shared';
import { cleanSourceUrl, pageFields, pageReader } from 'subventii-monitor/pages';
import { createDocumentReader } from './ai/documents';
import { createAnthropicAssistant } from './ai/assistant';
import { createApp } from './app';
import { supabaseRepo } from './db/repo';
import { supabaseAdminRepo } from './db/admin';
import { supabaseFactory } from './db/supabase';
import { loadEnv } from './env';
import { supabaseTokenVerifier } from './middleware/auth';
import { supabaseMonitor } from './monitor/reader';
import type { SourcesDeps } from './routes/sources';
import { supabaseSources } from './db/sources';
import { createStripe, MoneyService } from './stripe/money';
import { createWeatherService } from './weather';

const env = loadEnv();
const db = supabaseFactory(env.supabaseUrl, env.supabaseAnonKey, env.supabaseServiceKey);

const data = loadData();

let money;
if (env.stripeSecretKey && env.stripeWebhookSecret) {
  const stripe = createStripe(env.stripeSecretKey);
  const admin = supabaseAdminRepo(db.admin());
  // Stripe gives one secret per event destination: "Your account" and "Connected accounts" are two
  // destinations now, so STRIPE_WEBHOOK_SECRET may list several, separated by commas.
  const webhookSecrets = env.stripeWebhookSecret.split(',').map((s) => s.trim()).filter(Boolean);
  money = {
    money: new MoneyService(stripe, admin, data),
    admin,
    verifyWebhook: (raw: Buffer, signature: string) => {
      let last: unknown;
      for (const secret of webhookSecrets) {
        try {
          return stripe.webhooks.constructEvent(raw, signature, secret);
        } catch (err) {
          last = err;
        }
      }
      throw last;
    },
    demoMode: env.demoMode,
    data,
  };
} else {
  console.warn('[api] STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET missing: money routes are off');
}

// The API runs from apps/api, in development and on the VPS. Some government sites send incomplete certificates.
const certsPath = resolve(process.cwd(), '../../subventii-monitor/certs/intermediates.pem');
const sp = data.params.sources;
const sources: SourcesDeps = {
  store: supabaseSources(db.admin()),
  clean: cleanSourceUrl,
  read: pageReader({
    userAgent: `cropcash-sources/0.1${env.contactEmail ? ` (+mailto:${env.contactEmail})` : ''}`,
    ca: existsSync(certsPath) ? readFileSync(certsPath, 'utf8') : undefined,
    maxBytes: sp.max_mb.value * 1024 * 1024,
    timeoutMs: sp.read_timeout_s.value * 1000,
    deadlineMs: sp.add_deadline_s.value * 1000,
    retries: 0,
  }),
  newPage: (read, now) => ({
    url: read.url,
    ...pageFields(read, { previewChars: sp.preview_chars.value, textChars: sp.text_chars.value }, now),
  }),
};

const app = createApp({
  corsOrigins: env.corsOrigins,
  verifyToken: supabaseTokenVerifier(env.supabaseUrl),
  repo: supabaseRepo(db),
  data,
  weather: createWeatherService({ data, baseUrl: env.openMeteoBaseUrl, apiKey: env.openMeteoApiKey }),
  monitor: supabaseMonitor(db),
  sources,
  readDocument: env.anthropicApiKey ? createDocumentReader(env.anthropicApiKey, data) : undefined,
  money,
  assistant: env.anthropicApiKey ? createAnthropicAssistant(env.anthropicApiKey, env.anthropicModel, data.crops.crops) : undefined,
  assistantDailyLimit: env.assistantDailyLimit,
});

app.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`);
});
