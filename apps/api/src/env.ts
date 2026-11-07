function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} (see .env.example)`);
  return v;
}

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
  /** Unset turns off reading uploaded papers. */
  anthropicApiKey?: string;
  /** Goes in the User-Agent when reading a farmer's source, so a site can reach us. */
  contactEmail?: string;
  /** Enables /api/demo/* (simulated APIA payment, advancing the demo clock). */
  demoMode: boolean;
}

export function loadEnv(): Env {
  return {
    port: Number(process.env.PORT ?? 3001),
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
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
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
    contactEmail: process.env.CONTACT_EMAIL?.trim() || undefined,
    demoMode: process.env.DEMO_MODE === 'true',
  };
}
