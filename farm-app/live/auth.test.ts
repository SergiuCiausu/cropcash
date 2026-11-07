import { describe, expect, it, vi } from 'vitest';
import ro from '../../apps/web/src/i18n/ro.json';
import { ApiError, type Api } from './client';
import { AUTH_TEXT, authErrorKey, clearFarmData, createAuth, HOME, landingPage, linkErrorKey, safeNext, type AuthClient } from './auth';

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

describe('text', () => {
  it('matches ro.json word for word', () => {
    const { auth, app, common, offline } = ro;
    const { errors, tagline, wait, checkEmail, ...labels } = AUTH_TEXT;
    expect(tagline).toBe(app.tagline);
    expect(wait).toBe(common.wait);
    expect(checkEmail).toBe(auth.checkEmail);
    expect(auth).toMatchObject(labels);
    const { offline: noInternet, link_expired, ...known } = errors;
    expect(link_expired).toBeTruthy();
    expect(auth.errors).toEqual(known);
    expect(noInternet).toBe(offline.needed.login);
  });
});

describe('error messages', () => {
  it('finds the message for every known code', () => {
    for (const code of Object.keys(ro.auth.errors).filter((c) => c !== 'generic')) {
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
    expect(safeNext('calendar.html')).toBe('calendar.html');
    expect(safeNext('prognoza.html#ani')).toBe('prognoza.html#ani');
    expect(safeNext(HOME)).toBe(HOME);
  });

  it('refuses everything else', () => {
    for (const bad of [
      'https://evil.test',
      '//evil.test',
      'calendar.html/../../x',
      'javascript:alert(1)',
      'onboarding.html',
      'calendar.html#a#b',
      'calendar.html#<x>',
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
    expect(await landingPage(answering({ id: 'f' }), 'calendar.html', noStore)).toBe('calendar.html');
  });

  it('sends a new account to onboarding', async () => {
    expect(await landingPage(answering(null), 'calendar.html', noStore)).toBe('onboarding.html');
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
    expect(await setup().auth.signUp('a@b.ro', 'secret', 'http://x/login.html')).toBe(true);
  });

  it('says when it waits for the email, and sends the link to this page', async () => {
    const signUp = vi.fn<AuthClient['signUp']>(async () => ({
      data: { session: null, user: { identities: [{}] } },
      error: null,
    }));
    expect(await setup({ signUp }).auth.signUp('a@b.ro', 'secret', 'http://x/login.html')).toBe(false);
    expect(signUp.mock.calls[0]![0].options.emailRedirectTo).toBe('http://x/login.html');
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
