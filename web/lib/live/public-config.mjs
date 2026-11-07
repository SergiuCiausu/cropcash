/* The only values that reach the browser. Used by build.mjs to write config.js. */
const NAMES = {
  supabaseUrl: 'VITE_SUPABASE_URL',
  supabaseKey: 'VITE_SUPABASE_ANON_KEY',
};
const DEFAULT_API_URL = 'http://localhost:3001';

/** A secret key must never be written to a file the browser downloads. */
function isSecretKey(key) {
  if (key.startsWith('sb_secret_')) return true;
  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).role === 'service_role';
  } catch {
    return false;
  }
}

export function publicConfig(env) {
  const missing = Object.values(NAMES).filter((name) => !env[name]);
  if (missing.length) throw new Error(`Set ${missing.join(' and ')} in .env (see .env.example)`);
  if (isSecretKey(env[NAMES.supabaseKey])) throw new Error(`${NAMES.supabaseKey} holds a secret key. Use the public key.`);
  return {
    supabaseUrl: env[NAMES.supabaseUrl],
    supabaseKey: env[NAMES.supabaseKey],
    apiUrl: env.VITE_API_URL || DEFAULT_API_URL,
    demo: env.VITE_DEMO_MODE === 'true',
  };
}
