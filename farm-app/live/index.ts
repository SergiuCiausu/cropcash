/* What the pages use to reach Supabase and the API. Bundled into live.js as window.Live. */
import type { FUNCTIONS } from '@cropcash/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AUTH_TEXT, authErrorKey, createAuth, landingPage as landingPageFor, linkErrorKey, safeNext, type AuthClient } from './auth';
import { ApiError, createApi, type Api } from './client';
import { createFunctions } from './functions';

export { ApiError, AUTH_TEXT, authErrorKey, linkErrorKey, safeNext };

interface Config {
  supabaseUrl: string;
  supabaseKey: string;
  apiUrl: string;
}

declare global {
  interface Window {
    CROPCASH_CONFIG?: Config;
    CropEngine?: { FUNCTIONS: typeof FUNCTIONS };
  }
}

interface Connection {
  supabase: SupabaseClient;
  api: Api;
  functions: ReturnType<typeof createFunctions>;
}

let connection: Connection | null = null;

/** Connects on first use, so a page that makes no call needs nothing from config.js. */
function connect(): Connection {
  if (connection) return connection;
  const config = window.CROPCASH_CONFIG;
  if (!config) throw new Error('config.js is missing. Run: npm run build:farm');

  const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  const api = createApi({
    apiUrl: config.apiUrl,
    isOnline: () => navigator.onLine,
    getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  });
  const functions = createFunctions(api, () => {
    if (!window.CropEngine) throw new Error('This page needs engine.js before it can call functions.');
    return window.CropEngine.FUNCTIONS;
  });
  connection = { supabase, api, functions };
  return connection;
}

export const supabase = () => connect().supabase;
export const auth = () => createAuth(connect().supabase.auth as unknown as AuthClient, localStorage);
export const landingPage = (next: string | null) => landingPageFor(connect().api, next, localStorage);
export const api: Api = (path, init) => connect().api(path, init);
export const read: Connection['functions']['read'] = (name, input) => connect().functions.read(name, input);
export const write: Connection['functions']['write'] = (name, input) => connect().functions.write(name, input);
