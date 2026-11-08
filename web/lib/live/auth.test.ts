import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Api } from './client';
import { AUTH_TEXT, authErrorKey, clearFarmData, createAuth, OUTBOX_OWNER_KEY, stampOutboxOwner, guardTarget, hasFarmCopy, hasSession, HOME, landingPage, linkErrorKey, safeNext, type AuthClient } from './auth';

function fakeStore(initial: Record<string, string>) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    get length() {
      return items.size;
    },
    key: (i: number) => [...items.keys()][i] ?? null,
    removeItem: (key: string) => void items.delete(key),
  };
}
const SAVED = {
  'cropcash-farm': '{}',
  'cropcash-harvests': '{}',
  'cropcash-follows': '[]',
  'cropcash-done': '[]',
  'cropcash.read.match_opportunities:{}': '{}',
  'sb-abc-auth-token': 'session',
  'farm-palette:2-rail': 'field',
};
const session = { access_token: 't' };

function setup(over: Partial<AuthClient> = {}) {
  const client: AuthClient = {
    getSession: async () => ({ data: { session }, error: null }),
    signInWithPassword: async () => ({ data: {}, error: null }),
    signUp: async () => ({ data: { session, user: { identities: [{}] } }, error: null }),
    signOut: async () => ({ error: null }),
    ...over,
  };
  const store = fakeStore(SAVED);
  return { auth: createAuth(client, store), store, client };
}

describe('error messages', () => {
  it('finds the message for every known code', () => {
    const { offline: _offline, link_expired: _expired, generic: _generic, ...known } = AUTH_TEXT.errors;
    for (const code of Object.keys(known)) {
      expect(authErrorKey({ code }, true)).toBe(code);
    }
  });

  it('falls back, without internet saying so', () => {
    expect(authErrorKey({ code: 'something_new' }, true)).toBe('generic');
    expect(authErrorKey(new TypeError('failed'), false)).toBe('offline');
    expect(authErrorKey(null, true)).toBe('generic');
  });

  it('spots a failed email link', () => {
    expect(linkErrorKey('#error=access_denied&error_code=otp_expired')).toBe('link_expired');
    expect(linkErrorKey('#access_token=abc')).toBeNull();
    expect(linkErrorKey('')).toBeNull();
  });
});

describe('return page', () => {
  it('accepts the pages of the app', () => {
    expect(safeNext('/calendar')).toBe('/calendar');
    expect(safeNext('/prognoza#ani')).toBe('/prognoza#ani');
    expect(safeNext(HOME)).toBe(HOME);
  });

  it('refuses everything else', () => {
    for (const bad of [
      'https://evil.test',
      '//evil.test',
      'calendar/../../x',
      'javascript:alert(1)',
      '/onboarding',
      '/calendar#a#b',
      '/calendar#<x>',
      '',
    ]) {
      expect(safeNext(bad), bad).toBeNull();
    }
    expect(safeNext(null)).toBeNull();
  });
});

describe('where to go after signing in', () => {
  const answering = (farmer: unknown): Api => (async () => ({ farmer })) as unknown as Api;
  const noStore = { setItem: () => undefined };

  it('saves the farm before the first page opens', async () => {
    const saved = new Map<string, string>();
    await landingPage(answering({ id: 'f' }), null, { setItem: (k, v) => void saved.set(k, v) });
    expect(saved.get('cropcash-me')).toBe('{"id":"f"}');
  });

  it('saves nothing for a new account', async () => {
    const saved = new Map<string, string>();
    await landingPage(answering(null), null, { setItem: (k, v) => void saved.set(k, v) });
    expect(saved.size).toBe(0);
  });

  it('still goes on when storage is blocked', async () => {
    const blocked = { setItem: () => { throw new Error('blocked'); } };
    expect(await landingPage(answering({ id: 'f' }), null, blocked)).toBe(HOME);
  });

  it('sends a farm home, or back where it was', async () => {
    expect(await landingPage(answering({ id: 'f' }), null, noStore)).toBe(HOME);
    expect(await landingPage(answering({ id: 'f' }), '/calendar', noStore)).toBe('/calendar');
  });

  it('sends a new account to onboarding', async () => {
    expect(await landingPage(answering(null), '/calendar', noStore)).toBe('/onboarding');
  });

  it('still goes somewhere when the API is down', async () => {
    const failing = (async () => Promise.reject(new ApiError(0, 'network'))) as unknown as Api;
    expect(await landingPage(failing, null, noStore)).toBe(HOME);
  });
});

describe('signing in', () => {
  it('clears what the browser held, and keeps the session and colours', async () => {
    const { auth, store } = setup();
    await auth.signIn('a@b.ro', 'secret');
    expect([...store.items.keys()]).toEqual(['sb-abc-auth-token', 'farm-palette:2-rail']);
  });

  it('keeps everything when it fails', async () => {
    const error = { code: 'invalid_credentials' };
    const { auth, store } = setup({ signInWithPassword: async () => ({ data: {}, error }) });
    await expect(auth.signIn('a@b.ro', 'bad')).rejects.toBe(error);
    expect(store.items.size).toBe(Object.keys(SAVED).length);
  });
});

describe('signing up', () => {
  it('says when the account is ready', async () => {
    expect(await setup().auth.signUp('a@b.ro', 'secret', 'http://x/login')).toBe(true);
  });

  it('says when it waits for the email, and sends the link to this page', async () => {
    const signUp = vi.fn<AuthClient['signUp']>(async () => ({
      data: { session: null, user: { identities: [{}] } },
      error: null,
    }));
    expect(await setup({ signUp }).auth.signUp('a@b.ro', 'secret', 'http://x/login')).toBe(false);
    expect(signUp.mock.calls[0]![0].options.emailRedirectTo).toBe('http://x/login');
  });

  it('recognises an address that already has an account', async () => {
    const { auth } = setup({ signUp: async () => ({ data: { session: null, user: { identities: [] } }, error: null }) });
    await expect(auth.signUp('a@b.ro', 'secret', 'u')).rejects.toEqual({ code: 'user_already_exists' });
  });
});

describe('signing out', () => {
  const left = ['farm-palette:2-rail'];

  it('leaves nothing about the farm on the phone', async () => {
    const { auth, store } = setup();
    await auth.signOut();
    expect([...store.items.keys()]).toEqual(left);
  });

  it('still clears everything when the server answers with an error', async () => {
    const { auth, store } = setup({ signOut: async () => ({ error: new Error('offline') }) });
    await auth.signOut();
    expect([...store.items.keys()]).toEqual(left);
  });

  it('still clears everything when the call itself fails', async () => {
    const { auth, store } = setup({ signOut: async () => Promise.reject(new TypeError('failed')) });
    await auth.signOut();
    expect([...store.items.keys()]).toEqual(left);
  });
});

describe('stored data', () => {
  it('survives blocked storage', () => {
    const blocked = {
      get length(): number {
        throw new Error('blocked');
      },
      key: () => null,
      removeItem: () => undefined,
    };
    expect(() => clearFarmData(blocked)).not.toThrow();
  });
});

describe('return page, every app page', () => {
  it('comes back to the pages added with Ion’s farm too', () => {
    for (const page of ['/pensie', '/date-plan', '/bani']) expect(safeNext(page), page).toBe(page);
  });
});

/** A storage with these keys, for the guard's checks. */
function storeWith(items: Record<string, string>) {
  const keys = Object.keys(items);
  return { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => items[k] ?? null };
}

describe('what the phone already has', () => {
  it('finds a Supabase session by its key, without the network', () => {
    expect(hasSession(storeWith({ 'sb-abc-auth-token': '{}' }))).toBe(true);
    expect(hasSession(storeWith({ 'cropcash-me': '{}' }))).toBe(false);
  });

  it('finds the farm copy only when it is a farm', () => {
    expect(hasFarmCopy(storeWith({ 'cropcash-me': '{"id":"f1"}' }))).toBe(true);
    expect(hasFarmCopy(storeWith({ 'cropcash-me': 'null' }))).toBe(false);
    expect(hasFarmCopy(storeWith({ 'cropcash-me': '{oops' }))).toBe(false);
    expect(hasFarmCopy(storeWith({}))).toBe(false);
  });

  it('says no when storage is blocked', () => {
    const blocked = { get length(): number { throw new Error('blocked'); }, key: () => null, getItem: (): string | null => { throw new Error('blocked'); } };
    expect(hasSession(blocked)).toBe(false);
    expect(hasFarmCopy(blocked)).toBe(false);
  });
});

describe('who may open a page', () => {
  const at = (pathname: string, over: Partial<Parameters<typeof guardTarget>[0]> = {}) =>
    guardTarget({ pathname, hash: '', hasSession: true, hasFarmCopy: true, online: true, ...over });

  it('sends someone signed out to log in, and back to the same page after', () => {
    expect(at('/salariu', { hasSession: false })).toEqual({ action: 'redirect', to: '/login?next=%2Fsalariu' });
    expect(at('/recolte', { hasSession: false, hash: '#cultura' })).toEqual({ action: 'redirect', to: '/login?next=%2Frecolte%23cultura' });
    expect(at('/salariu.html', { hasSession: false })).toEqual({ action: 'redirect', to: '/login?next=%2Fsalariu' });
  });

  it('drops a hash it would not accept back', () => {
    expect(at('/salariu', { hasSession: false, hash: '#<script>' })).toEqual({ action: 'redirect', to: '/login' });
  });

  it('decides offline the same way: no session means log in', () => {
    expect(at('/acasa', { hasSession: false, online: false })).toEqual({ action: 'redirect', to: '/login?next=%2Facasa' });
  });

  it('opens the page when the farm is already on the phone, online or not', () => {
    expect(at('/acasa')).toEqual({ action: 'start' });
    expect(at('/acasa', { online: false })).toEqual({ action: 'start' });
  });

  it('brings the farm first when it isn’t on the phone yet', () => {
    expect(at('/prognoza', { hasFarmCopy: false })).toEqual({ action: 'load-farm', next: '/prognoza' });
    expect(at('/prognoza', { hasFarmCopy: false, online: false })).toEqual({ action: 'need-net' });
  });

  it('lets onboarding open with a session but no farm, and not without a session', () => {
    expect(at('/onboarding', { hasFarmCopy: false })).toEqual({ action: 'start' });
    expect(at('/onboarding', { hasSession: false })).toEqual({ action: 'redirect', to: '/login' });
  });

  it('leaves Ion’s farm, the landing page and login open to everyone', () => {
    for (const path of ['/ferma-lui-ion/salariu', '/ferma-lui-ion', '/', '/login']) {
      expect(at(path, { hasSession: false, hasFarmCopy: false, online: false }), path).toEqual({ action: 'start' });
    }
  });
});

describe('unsent records across a new sign-in (FAIL-04)', () => {
  const queued = { 'cropcash-outbox': '[{"id":"outbox:1"}]', 'cropcash-outbox-owner': 'user-1' };
  function withQueue(over: Partial<AuthClient> = {}) {
    const s = setup(over);
    for (const [k, v] of Object.entries(queued)) s.store.items.set(k, v);
    const store = Object.assign(s.store, { getItem: (k: string) => s.store.items.get(k) ?? null });
    return { ...s, auth: createAuth(s.client, store), store };
  }
  const signedInAs = (id: string): Partial<AuthClient> => ({ signInWithPassword: async () => ({ data: { user: { id } }, error: null }) });

  it('keeps them when the same farmer signs in again', async () => {
    const { auth, store } = withQueue(signedInAs('user-1'));
    await auth.signIn('a@b.ro', 'secret');
    expect(store.items.get('cropcash-outbox')).toBe(queued['cropcash-outbox']);
    expect(store.items.has('cropcash-farm')).toBe(false);
  });

  it('drops them when another account signs in on this phone', async () => {
    const { auth, store } = withQueue(signedInAs('user-2'));
    await auth.signIn('a@b.ro', 'secret');
    expect(store.items.has('cropcash-outbox')).toBe(false);
    expect(store.items.has('cropcash-outbox-owner')).toBe(false);
  });

  it('drops a queue whose owner is unknown, as before', async () => {
    const { auth, store } = withQueue(signedInAs('user-1'));
    store.items.delete('cropcash-outbox-owner');
    await auth.signIn('a@b.ro', 'secret');
    expect(store.items.has('cropcash-outbox')).toBe(false);
  });

  it('still clears them on sign-out, which warns first (in the page)', async () => {
    const { auth, store } = withQueue();
    await auth.signOut();
    expect(store.items.has('cropcash-outbox')).toBe(false);
  });
});

describe('refreshing the session after a 401 (FAIL-11)', () => {
  it('says yes when the refresh token still works', async () => {
    expect(await setup({ refreshSession: async () => ({ data: { session }, error: null }) }).auth.refresh()).toBe(true);
  });

  it('says no when it fails, throws, or the client has no refresh', async () => {
    expect(await setup({ refreshSession: async () => ({ data: { session: null }, error: { code: 'refresh_token_not_found' } }) }).auth.refresh()).toBe(false);
    expect(await setup({ refreshSession: async () => Promise.reject(new TypeError('failed')) }).auth.refresh()).toBe(false);
    expect(await setup().auth.refresh()).toBe(false);
  });
});

describe('whose queue it is (FAIL-04)', () => {
  const memory = (entries: Record<string, string>) => {
    const map = new Map(Object.entries(entries));
    return { get length() { return map.size; }, key: (i: number) => [...map.keys()][i] ?? null, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
  };

  it('notes the signed-in account, from the session saved on the phone', () => {
    const store = memory({ 'sb-x-auth-token': JSON.stringify({ user: { id: 'u1' } }) });
    stampOutboxOwner(store);
    expect(store.getItem(OUTBOX_OWNER_KEY)).toBe('u1');
  });

  it('leaves nothing when there is no readable session', () => {
    const store = memory({ 'sb-x-auth-token': 'not json' });
    stampOutboxOwner(store);
    expect(store.getItem(OUTBOX_OWNER_KEY)).toBeNull();
  });
});
