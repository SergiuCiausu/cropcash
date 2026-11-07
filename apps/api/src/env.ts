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
  exchangeRate?: number;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
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
    exchangeRate: process.env.EXCHANGE_RATE_EUR_RON ? Number(process.env.EXCHANGE_RATE_EUR_RON) : undefined,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || undefined,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || undefined,
    demoMode: process.env.DEMO_MODE === 'true',
  };
}
