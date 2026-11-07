import type { Api } from './client';

/** The same words as `auth.*` in ro.json. A test keeps them equal. */
export const AUTH_TEXT = {
  tagline: 'Banii fermei, pe înțelesul tău',
  loginTitle: 'Intră în cont',
  registerTitle: 'Fă-ți cont',
  email: 'Adresa de email',
  password: 'Parola',
  passwordHint: 'Cel puțin 6 caractere.',
  loginButton: 'Intră',
  registerButton: 'Fă-mi cont',
  switchToRegister: 'N-ai cont? Fă-ți unul',
  switchToLogin: 'Ai deja cont? Intră',
  checkEmail: 'Ți-am trimis un email. Apasă pe linkul din el, apoi intră în cont.',
  wait: 'Așteaptă puțin…',
  errors: {
    invalid_credentials: 'Emailul sau parola nu sunt bune.',
    user_already_exists: 'Există deja un cont cu emailul ăsta. Intră în cont.',
    weak_password: 'Parola e prea scurtă. Pune cel puțin 6 caractere.',
    email_not_confirmed: 'Încă n-ai apăsat pe linkul din email.',
    over_email_send_rate_limit: 'Prea multe încercări. Mai încearcă peste câteva minute.',
    validation_failed: 'Verifică adresa de email.',
    generic: 'Nu a mers. Mai încearcă o dată.',
    offline: 'Pornește internetul ca să intri în cont.',
    link_expired: 'Linkul din email nu mai merge. Intră în cont sau fă-ți contul din nou.',
  },
} as const;

type ErrorKey = keyof typeof AUTH_TEXT.errors;

const SUPABASE_ERRORS: readonly string[] = [
  'invalid_credentials',
  'user_already_exists',
  'weak_password',
  'email_not_confirmed',
  'over_email_send_rate_limit',
  'validation_failed',
];

export function authErrorKey(error: unknown, online: boolean): ErrorKey {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && SUPABASE_ERRORS.includes(code)) return code as ErrorKey;
  return online ? 'generic' : 'offline';
}

/** An email link that failed comes back with the reason after the #. */
export function linkErrorKey(hash: string): ErrorKey | null {
  return /[#&]error(_code)?=/.test(hash) ? 'link_expired' : null;
}

export const HOME = '../desktop/2-rail.html';
const ONBOARDING = 'onboarding.html';
const RETURN_PAGES: readonly string[] = [
  HOME,
  'subventii.html',
  'calendar.html',
  'prognoza.html',
  'recolte.html',
  'salariu.html',
  'oportunitati.html',
  'surse.html',
];

/** Only pages of this app, so a crafted link can't send the farmer to another site. */
export function safeNext(next: string | null): string | null {
  if (!next) return null;
  const [page, ...hash] = next.split('#');
  if (!RETURN_PAGES.includes(page!)) return null;
  if (hash.length > 1 || (hash.length === 1 && !/^[a-z-]+$/.test(hash[0]!))) return null;
  return next;
}

/** Pages open from this copy, so it has to exist before the first one loads. */
export const FARM_COPY = 'cropcash-me';

/** A new account needs a farm first. If the API can't say, the page itself asks again. */
export async function landingPage(api: Api, next: string | null, store: Pick<Storage, 'setItem'>): Promise<string> {
  try {
    const { farmer } = await api<{ farmer: unknown }>('/api/me');
    if (!farmer) return ONBOARDING;
    try {
      store.setItem(FARM_COPY, JSON.stringify(farmer));
    } catch {
      // Blocked storage: the page fetches it instead.
    }
    return next ?? HOME;
  } catch {
    return next ?? HOME;
  }
}

type KeyStore = Pick<Storage, 'length' | 'key' | 'removeItem'>;

function removeKeys(store: KeyStore, match: (key: string) => boolean) {
  try {
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i));
    for (const key of keys) if (key && match(key)) store.removeItem(key);
  } catch {
    // Storage can be blocked, and then nothing was saved.
  }
}

/** Everything saved about a farm. The farmer's choice of colours is not farm data. */
export const clearFarmData = (store: KeyStore) => removeKeys(store, (key) => key.startsWith('cropcash'));
const clearSession = (store: KeyStore) => removeKeys(store, (key) => /^sb-.*-auth-token/.test(key));

interface AuthResult<D> {
  data: D;
  error: unknown;
}

/** The part of the Supabase client that login uses. */
export interface AuthClient {
  getSession(): Promise<AuthResult<{ session: unknown }>>;
  signInWithPassword(input: { email: string; password: string }): Promise<AuthResult<unknown>>;
  signUp(input: {
    email: string;
    password: string;
    options: { emailRedirectTo: string };
  }): Promise<AuthResult<{ session: unknown; user: { identities?: unknown[] } | null }>>;
  signOut(): Promise<{ error: unknown }>;
}

export function createAuth(client: AuthClient, store: KeyStore) {
  return {
    async isSignedIn(): Promise<boolean> {
      const { data } = await client.getSession();
      return data.session !== null;
    },

    async signIn(email: string, password: string): Promise<void> {
      const { error } = await client.signInWithPassword({ email, password });
      if (error) throw error;
      clearFarmData(store);
    },

    /** Returns false when the account waits for the link in the email. */
    async signUp(email: string, password: string, emailRedirectTo: string): Promise<boolean> {
      const { data, error } = await client.signUp({ email, password, options: { emailRedirectTo } });
      if (error) throw error;
      // With email checks on, Supabase answers an existing address like a new one, with no identities.
      if (data.user?.identities?.length === 0) throw { code: 'user_already_exists' };
      clearFarmData(store);
      return data.session !== null;
    },

    /** Must work offline, where Supabase keeps the session because it can't reach the server. */
    async signOut(): Promise<void> {
      await client.signOut().catch(() => undefined);
      clearSession(store);
      clearFarmData(store);
    },
  };
}
