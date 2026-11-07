import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseFactory {
  /** Acts as the signed-in user: Row Level Security applies. Use for all user requests. */
  forUser(token: string): SupabaseClient;
  /** Bypasses RLS. Only for webhooks, scheduled jobs and seeding — never with user input alone. */
  admin(): SupabaseClient;
}

export function supabaseFactory(url: string, anonKey: string, serviceKey: string): SupabaseFactory {
  const noSession = { persistSession: false, autoRefreshToken: false };
  let adminClient: SupabaseClient | null = null;
  return {
    forUser: (token) =>
      createClient(url, anonKey, {
        auth: noSession,
        global: { headers: { Authorization: `Bearer ${token}` } },
      }),
    admin: () => (adminClient ??= createClient(url, serviceKey, { auth: noSession })),
  };
}
