/* What the pages use to reach Supabase and the API: the one connection, for legacy pages (as window.Live)
   and for the React store (lib/cc/react.tsx). */
import { FUNCTIONS } from '../../../packages/shared/src/functions/registry';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AUTH_TEXT, authErrorKey, stampOutboxOwner, createAuth, guardTarget, hasFarmCopy, hasSession, landingPage as landingPageFor, linkErrorKey, safeNext, type AuthClient } from './auth';
import planParams from '../../../docs/data/plan-params.json';
import { ApiError, createApi, fetchWithTimeout, timeoutsFrom, type Api } from './client';
import { createFunctions } from './functions';

export { ApiError, AUTH_TEXT, authErrorKey, guardTarget, hasFarmCopy, hasSession, linkErrorKey, safeNext };
export { newIntentKey } from './intent';
export { FAIL_TEXT, failText } from './fail-text';
export { isMoneyMove, moneyOutcome } from './money-check';

const TIMEOUTS = timeoutsFrom(planParams.network);
/** For the few calls that don't go through the API client (the farmer's own sources). */
export const timedFetch = fetchWithTimeout((...args) => fetch(...args), TIMEOUTS.write);
export const pingFetch = fetchWithTimeout((...args) => fetch(...args), TIMEOUTS.health);
export const markOutboxOwner = () => stampOutboxOwner(localStorage);

interface Config {
  supabaseUrl: string;
  supabaseKey: string;
  apiUrl: string;
  demo?: boolean;
}

declare global {
  interface Window {
    CROPCASH_CONFIG?: Config;
  }
}

/** The public config next.config.ts builds into NEXT_PUBLIC_CROPCASH_CONFIG, read once per page. */
export function publicConfig(): Config {
  window.CROPCASH_CONFIG ??= JSON.parse(process.env.NEXT_PUBLIC_CROPCASH_CONFIG ?? '{}') as Config;
  return window.CROPCASH_CONFIG;
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
  const config = publicConfig();
  if (!config.apiUrl) throw new Error('NEXT_PUBLIC_CROPCASH_CONFIG is empty: next.config.ts builds it from .env.');

  const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    global: { fetch: fetchWithTimeout((...args) => fetch(...args), TIMEOUTS.write) },
  });
  const api = createApi({
    apiUrl: config.apiUrl,
    isOnline: () => navigator.onLine,
    timeouts: TIMEOUTS,
    getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  });
  /* The registry comes in by import, so the pages and the API check input the same way. */
  const functions = createFunctions(api, () => FUNCTIONS);
  connection = { supabase, api, functions };
  return connection;
}

export const supabase = () => connect().supabase;
export const auth = () => createAuth(connect().supabase.auth as unknown as AuthClient, localStorage);
export const landingPage = (next: string | null) => landingPageFor(connect().api, next, localStorage);
export const api: Api = (path, init) => connect().api(path, init);
export const read: Connection['functions']['read'] = (name, input) => connect().functions.read(name, input);
export const write: Connection['functions']['write'] = (name, input, options) => connect().functions.write(name, input, options);
