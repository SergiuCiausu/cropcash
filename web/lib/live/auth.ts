import { KEYS } from '../cc/storage';
import { DEMO_PAGES, isDemoPath, pageOf } from '../paths';
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
  forgotLink: 'Am uitat parola',
  forgotTitle: 'Ai uitat parola?',
  forgotLead: 'Scrie adresa contului și îți trimitem un link pentru o parolă nouă.',
  forgotButton: 'Trimite-mi linkul',
  forgotSent: 'Dacă există un cont cu adresa asta, ți-am trimis un email. Apasă pe linkul din el ca să pui o parolă nouă.',
  backToLogin: 'Înapoi la intrare',
  newPasswordTitle: 'Pune o parolă nouă',
  newPasswordLead: 'După ce o salvezi, intri direct în cont.',
  newPassword: 'Parola nouă',
  newPasswordButton: 'Salvează parola',
  showPassword: 'Arată parola',
  hidePassword: 'Ascunde parola',
  resendButton: 'Trimite din nou emailul',
  resent: 'Ți-am trimis din nou emailul. Uită-te și în Spam.',
  wait: 'Așteaptă puțin…',
  /* Shown instead of a page when the farm isn't on this phone yet (guardTarget). */
  farmNeedsNet: 'Pornește internetul o dată',
  farmNeedsNetWhy: 'Ca să-ți aducem ferma pe telefon. După aceea merge și fără internet.',
  farmFailed: 'Nu am putut aduce ferma',
  farmFailedWhy: 'Mai încearcă o dată peste puțin timp.',
  retry: 'Încearcă din nou',
  errors: {
    invalid_credentials: 'Emailul sau parola nu sunt bune.',
    user_already_exists: 'Există deja un cont cu emailul ăsta. Intră în cont.',
    weak_password: 'Parola e prea scurtă. Pune cel puțin 6 caractere.',
    email_not_confirmed: 'Încă n-ai apăsat pe linkul din email.',
    same_password: 'Parola nouă trebuie să fie alta decât cea veche.',
    over_email_send_rate_limit: 'Prea multe încercări. Mai încearcă peste câteva minute.',
    validation_failed: 'Verifică adresa de email.',
    generic: 'Nu a mers. Mai încearcă o dată.',
    offline: 'Pornește internetul ca să intri în cont.',
    link_expired: 'Linkul din email nu mai merge. Cere altul mai jos.',
  },
} as const;

type ErrorKey = keyof typeof AUTH_TEXT.errors;

const SUPABASE_ERRORS: readonly string[] = [
  'invalid_credentials',
  'user_already_exists',
  'weak_password',
  'email_not_confirmed',
  'same_password',
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

export const HOME = '/acasa';
const ONBOARDING = '/onboarding';
/* Every page of the farmer's app (lib/paths.ts), so a sign-in can come back to any of them. */
const RETURN_PAGES: readonly string[] = DEMO_PAGES;

/** Only pages of this app, so a crafted link can't send the farmer to another site. */
export function safeNext(next: string | null): string | null {
  if (!next) return null;
  const [page, ...hash] = next.split('#');
  if (!RETURN_PAGES.includes(page!)) return null;
  if (hash.length > 1 || (hash.length === 1 && !/^[a-z-]+$/.test(hash[0]!))) return null;
  return next;
}

/** Pages open from this copy, so it has to exist before the first one loads. */
export const FARM_COPY = KEYS.me;

/** A Supabase session saved in this browser. Read without the network, so it works offline. */
export function hasSession(store: Pick<Storage, 'length' | 'key'>): boolean {
  try {
    return Array.from({ length: store.length }, (_, i) => store.key(i)).some((k) => !!k && /^sb-.*-auth-token/.test(k));
  } catch {
    return false;
  }
}

/** The copy of /api/me the pages open from. */
export function hasFarmCopy(store: Pick<Storage, 'getItem'>): boolean {
  try {
    const farm = JSON.parse(store.getItem(FARM_COPY) ?? 'null');
    return typeof farm === 'object' && farm !== null;
  } catch {
    return false;
  }
}

export type Guard =
  | { action: 'start' }
  | { action: 'redirect'; to: string }
  | { action: 'load-farm'; next: string }
  | { action: 'need-net' };

/** Who may open a page, decided before any page script runs (lib/boot.ts). The farmer's app needs
    an account and its farm; Ion's farm, the landing page and /login are open to everyone.
    load-farm: signed in, but the farm isn't on this phone yet, so it comes from /api/me first. */
export function guardTarget({ pathname, hash, hasSession, hasFarmCopy, online }: { pathname: string; hash: string; hasSession: boolean; hasFarmCopy: boolean; online: boolean }): Guard {
  if (isDemoPath(pathname)) return { action: 'start' };
  const page = pageOf(pathname);
  if (page !== ONBOARDING && !RETURN_PAGES.includes(page)) return { action: 'start' };
  const back = safeNext(`${page}${hash}`);
  if (!hasSession) return { action: 'redirect', to: back && page !== ONBOARDING ? `/login?next=${encodeURIComponent(back)}` : '/login' };
  if (page === ONBOARDING || hasFarmCopy) return { action: 'start' };
  return online ? { action: 'load-farm', next: back ?? HOME } : { action: 'need-net' };
}

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

/** getItem is optional so a caller that can't read keeps the old behaviour: clear everything. */
type KeyStore = Pick<Storage, 'length' | 'key' | 'removeItem'> & { getItem?: Storage['getItem'] };

function removeKeys(store: KeyStore, match: (key: string) => boolean) {
  try {
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i));
    for (const key of keys) if (key && match(key)) store.removeItem(key);
  } catch {
    // Storage can be blocked, and then nothing was saved.
  }
}

/** The records waiting for internet, and whose account they belong to. */
export const OUTBOX_KEY = 'cropcash-outbox';
export const OUTBOX_OWNER_KEY = 'cropcash-outbox-owner';

/** Notes which account the queue belongs to, from the saved session, which is there offline too. */
export function stampOutboxOwner(store: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'>) {
  try {
    const key = Array.from({ length: store.length }, (_, i) => store.key(i)).find((k) => !!k && /^sb-.*-auth-token$/.test(k));
    const id = key ? (JSON.parse(store.getItem(key) ?? 'null') as { user?: { id?: string } } | null)?.user?.id : null;
    if (id) store.setItem(OUTBOX_OWNER_KEY, id);
  } catch {
    /* Without an owner the queue is cleared at the next sign-in, as before. */
  }
}

function outboxOwner(store: KeyStore): string | null {
  try {
    return store.getItem?.(OUTBOX_OWNER_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * Everything saved about a farm. The farmer's choice of colours is not farm data.
 * `keepOutboxOf`: the account signing in. Its own unsent records stay, so signing in again after a
 * session ran out doesn't lose the sales noted offline (FAIL-04). Another account's records go.
 */
export function clearFarmData(store: KeyStore, keepOutboxOf: string | null = null) {
  const keep = keepOutboxOf !== null && outboxOwner(store) === keepOutboxOf;
  removeKeys(store, (key) => key.startsWith('cropcash') && !(keep && (key === OUTBOX_KEY || key === OUTBOX_OWNER_KEY)));
}
const clearSession = (store: KeyStore) => removeKeys(store, (key) => /^sb-.*-auth-token/.test(key));

interface AuthResult<D> {
  data: D;
  error: unknown;
}

/** The part of the Supabase client that login uses. */
type User = { id?: string; identities?: unknown[] } | null | undefined;

export interface AuthClient {
  getSession(): Promise<AuthResult<{ session: unknown }>>;
  signInWithPassword(input: { email: string; password: string }): Promise<AuthResult<{ user?: User }>>;
  signUp(input: {
    email: string;
    password: string;
    options: { emailRedirectTo: string };
  }): Promise<AuthResult<{ session: unknown; user: User }>>;
  signOut(): Promise<{ error: unknown }>;
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<AuthResult<unknown>>;
  updateUser(attributes: { password: string }): Promise<AuthResult<{ user?: User }>>;
  resend(input: { type: 'signup'; email: string; options: { emailRedirectTo: string } }): Promise<AuthResult<unknown>>;
  /** Optional so older fakes still fit; the real Supabase client has it. */
  refreshSession?(): Promise<AuthResult<{ session: unknown }>>;
}

export function createAuth(client: AuthClient, store: KeyStore) {
  return {
    async isSignedIn(): Promise<boolean> {
      const { data } = await client.getSession();
      return data.session !== null;
    },

    async signIn(email: string, password: string): Promise<void> {
      const { data, error } = await client.signInWithPassword({ email, password });
      if (error) throw error;
      clearFarmData(store, data?.user?.id ?? null);
    },

    /** Returns false when the account waits for the link in the email. */
    async signUp(email: string, password: string, emailRedirectTo: string): Promise<boolean> {
      const { data, error } = await client.signUp({ email, password, options: { emailRedirectTo } });
      if (error) throw error;
      // With email checks on, Supabase answers an existing address like a new one, with no identities.
      if (data.user?.identities?.length === 0) throw { code: 'user_already_exists' };
      clearFarmData(store, data.user?.id ?? null);
      return data.session !== null;
    },

    /** Supabase answers the same for an address with no account, so this tells a stranger nothing. */
    async sendPasswordReset(email: string, redirectTo: string): Promise<void> {
      const { error } = await client.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    },

    /** For the session the recovery link opened. Another farmer's copy on this phone goes, as at sign-in. */
    async setNewPassword(password: string): Promise<void> {
      const { data, error } = await client.updateUser({ password });
      if (error) throw error;
      clearFarmData(store, data?.user?.id ?? null);
    },

    async resendConfirmation(email: string, emailRedirectTo: string): Promise<void> {
      const { error } = await client.resend({ type: 'signup', email, options: { emailRedirectTo } });
      if (error) throw error;
    },

    /**
     * After a 401: try the refresh token once before treating the farmer as signed out (FAIL-04,
     * FAIL-11). Never throws: false means a sign-in is really needed.
     */
    async refresh(): Promise<boolean> {
      try {
        const result = await client.refreshSession?.();
        return !!result && !result.error && result.data.session !== null;
      } catch {
        return false;
      }
    },

    /** Must work offline, where Supabase keeps the session because it can't reach the server. */
    async signOut(): Promise<void> {
      await client.signOut().catch(() => undefined);
      clearSession(store);
      clearFarmData(store);
    },
  };
}
