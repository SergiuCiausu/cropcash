function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} (see .env.example)`);
  return v;
}

/** The ports web/scripts/dev.mjs can pick. */
const DEV_ORIGINS = [5173, 5174, 5175, 5176, 5177, 5178].map((p) => `http://localhost:${p}`).join(',');

export interface Env {
  port: number;
  corsOrigins: string[];
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  /** Optional lei/EUR override; otherwise the default from docs/data is used. */
  /** Public Open-Meteo by default; a paid plan or a self-hosted instance otherwise. */
  openMeteoBaseUrl?: string;
  openMeteoApiKey?: string;
  /** Both unset turns the money flow off. A live key is refused at startup. */
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  /** Unset turns off reading uploaded papers and the assistant. The .env.example placeholder counts as unset. */
  anthropicApiKey?: string;
  /** The assistant's model (ANTHROPIC_MODEL). */
  anthropicModel: string;
  /** Assistant messages per farmer per day (ASSISTANT_DAILY_LIMIT). */
  assistantDailyLimit: number;
  /** Goes in the User-Agent when reading a farmer's source, so a site can reach us. */
  contactEmail?: string;
  /** Enables /api/demo/* (simulated APIA payment, advancing the demo clock). */
  demoMode: boolean;
  /** Sign-in emails that may add fertilizers: every admin, plus CATALOGUE_EDITORS. Lower case. */
  catalogueEditors: string[];
  /** Sign-in emails that may open the admin panel and publish changes (ADMIN_EMAILS, else DEMO_EMAIL). Lower case. */
  adminEmails: string[];
  /** How often the API rereads the published changes, for other API processes' publishes (PREDICTIONS_REFRESH_S). */
  predictionsRefreshMs: number;
}

const emails = (list: string | undefined) =>
  (list ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

type Vars = Record<string, string | undefined>;
/** Who may open the admin panel: ADMIN_EMAILS, or DEMO_EMAIL when that is unset. */
export const adminEmails = (vars: Vars) => emails(vars.ADMIN_EMAILS || vars.DEMO_EMAIL);
/** Who may add fertilizers: the admins, plus anyone in CATALOGUE_EDITORS (e.g. an agronomist who isn't an admin). */
export const catalogueEditors = (vars: Vars) => [...new Set([...adminEmails(vars), ...emails(vars.CATALOGUE_EDITORS)])];

export function loadEnv(): Env {
  return {
    port: Number(process.env.PORT ?? 3001),
    corsOrigins: (process.env.CORS_ORIGINS ?? DEV_ORIGINS)
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    supabaseUrl: required('SUPABASE_URL'),
    supabaseAnonKey: required('SUPABASE_ANON_KEY'),
    supabaseServiceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    openMeteoBaseUrl: process.env.OPEN_METEO_BASE_URL || undefined,
    openMeteoApiKey: process.env.OPEN_METEO_API_KEY || undefined,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || undefined,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || undefined,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'sk-ant-xxx' ? process.env.ANTHROPIC_API_KEY : undefined,
    anthropicModel: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5',
    assistantDailyLimit: Number(process.env.ASSISTANT_DAILY_LIMIT) > 0 ? Number(process.env.ASSISTANT_DAILY_LIMIT) : 5,
    contactEmail: process.env.CONTACT_EMAIL?.trim() || undefined,
    demoMode: process.env.DEMO_MODE === 'true',
    catalogueEditors: catalogueEditors(process.env),
    adminEmails: adminEmails(process.env),
    predictionsRefreshMs: (Number(process.env.PREDICTIONS_REFRESH_S) > 0 ? Number(process.env.PREDICTIONS_REFRESH_S) : 300) * 1000,
  };
}
