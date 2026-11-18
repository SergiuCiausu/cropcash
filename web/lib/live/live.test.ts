import { describe, expect, it, vi } from 'vitest';
import { FUNCTIONS } from '@cropcash/shared';
import { ApiError, createApi } from './client';
import { createFunctions } from './functions';
import { publicConfig } from './public-config.mjs';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function setup({
  token = 'tok' as string | null,
  online = true,
  response = (): Response => json({ data: 1 }),
} = {}) {
  const fetchFn = vi.fn<typeof fetch>(async () => response());
  const api = createApi({ apiUrl: 'http://api.test', getToken: async () => token, isOnline: () => online, fetchFn });
  return { fetchFn, api, ...createFunctions(api, () => FUNCTIONS) };
}
const sent = (fn: ReturnType<typeof setup>['fetchFn']) => {
  const [url, init] = fn.mock.calls[0]!;
  return { url, init: init!, headers: new Headers(init!.headers) };
};
const code = (promise: Promise<unknown>) => promise.then(() => 'no error', (e: ApiError) => e.code);

describe('api', () => {
  it("sends the farmer's token", async () => {
    const { api, fetchFn } = setup();
    await api('/api/me');
    expect(sent(fetchFn).url).toBe('http://api.test/api/me');
    expect(sent(fetchFn).headers.get('Authorization')).toBe('Bearer tok');
  });

  it('sends no header when signed out', async () => {
    const { api, fetchFn } = setup({ token: null });
    await api('/api/me');
    expect(sent(fetchFn).headers.has('Authorization')).toBe(false);
  });

  it('marks a body as JSON', async () => {
    const { api, fetchFn } = setup();
    await api('/x', { method: 'POST', body: '{}' });
    expect(sent(fetchFn).headers.get('Content-Type')).toBe('application/json');
  });

  it('passes on the error the server gave', async () => {
    const { api } = setup({ response: () => json({ error: 'no_farm' }, 404) });
    const error = await api('/x').catch((e: ApiError) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'no_farm' });
  });

  it("copes with an error that isn't JSON", async () => {
    const { api } = setup({ response: () => new Response('Bad gateway', { status: 502 }) });
    expect(await code(api('/x'))).toBe('unknown');
  });

  it('handles an answer with no body', async () => {
    const { api } = setup({ response: () => new Response(null, { status: 204 }) });
    expect(await api('/x')).toBeUndefined();
  });

  it("says offline and doesn't try", async () => {
    const { api, fetchFn } = setup({ online: false });
    expect(await code(api('/x'))).toBe('offline');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("says network when the server can't be reached", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Promise.reject(new TypeError('failed')));
    const api = createApi({ apiUrl: '', getToken: async () => null, isOnline: () => true, fetchFn });
    expect(await api('/x').catch((e: ApiError) => e)).toMatchObject({ status: 0, code: 'network' });
  });
});

describe('read', () => {
  it('posts to the function', async () => {
    const { read, fetchFn } = setup();
    await read('search_opportunities', { text: 'grâu' });
    expect(sent(fetchFn).url).toBe('http://api.test/api/functions/search_opportunities');
    expect(sent(fetchFn).init.method).toBe('POST');
    expect(sent(fetchFn).init.body).toBe('{"text":"grâu"}');
  });

  it('defaults to no input', async () => {
    const { read, fetchFn } = setup();
    await read('match_opportunities');
    expect(sent(fetchFn).init.body).toBe('{}');
  });

  it("refuses a name it doesn't know, or a write", async () => {
    const { read, fetchFn } = setup();
    expect(await code(read('nope'))).toBe('unknown_function');
    expect(await code(read('record_sale'))).toBe('unknown_function');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('checks the input before calling', async () => {
    const { read, fetchFn } = setup();
    expect(await code(read('search_documents', { text: 'a' }))).toBe('invalid_input');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('write', () => {
  const UUID = '11111111-1111-4111-8111-111111111111';

  it('a delete that was already done is not an error (IDEM-11)', async () => {
    const { write } = setup({ response: () => json({ error: 'not_found' }, 404) });
    await expect(write('undo_transaction', { id: UUID })).resolves.toBeUndefined();
  });

  it('a 404 on any other write is still an error', async () => {
    const { write } = setup({ response: () => json({ error: 'no_farm' }, 404) });
    expect(await code(write('complete_task', { id: 'a:2026' }))).toBe('no_farm');
  });

  it('sends the version it was given as If-Match, version 0 included (IDEM-12)', async () => {
    const { write, fetchFn } = setup();
    await write('complete_task', { id: 'a:2026' }, { version: 0 });
    expect(sent(fetchFn).headers.get('If-Match')).toBe('0');
  });

  it('uses the route from the registry', async () => {
    const { write, fetchFn } = setup();
    await write('follow_opportunity', { key: 'afir:x' });
    expect(sent(fetchFn).url).toBe('http://api.test/api/opportunities/follow');
    expect(sent(fetchFn).init.method).toBe('POST');
    expect(sent(fetchFn).init.body).toBe('{"key":"afir:x"}');
  });

  it("refuses a name it doesn't know, or a read", async () => {
    const { write, fetchFn } = setup();
    expect(await code(write('nope'))).toBe('unknown_function');
    expect(await code(write('get_salary'))).toBe('unknown_function');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('checks the input before calling', async () => {
    const { write, fetchFn } = setup();
    expect(await code(write('follow_opportunity', { key: '' }))).toBe('invalid_input');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('never tries twice', async () => {
    const { write, fetchFn } = setup({ response: () => json({ error: 'boom' }, 500) });
    expect(await code(write('follow_opportunity', { key: 'k' }))).toBe('boom');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("won't send a money action while offline", async () => {
    const { write, fetchFn } = setup({ online: false });
    expect(await code(write('start_pension', { monthlyLei: 200 }))).toBe('offline');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('public config', () => {
  const env = { VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_abc' };
  const jwt = (role: string) => `h.${btoa(JSON.stringify({ role }))}.s`;

  it('takes only the public values', () => {
    const config = publicConfig({ ...env, SUPABASE_SECRET_KEY: 'hidden', STRIPE_SECRET_KEY: 'hidden' });
    expect(config).toEqual({
      supabaseUrl: env.VITE_SUPABASE_URL,
      supabaseKey: env.VITE_SUPABASE_ANON_KEY,
      apiUrl: 'http://localhost:3001',
      demo: false,
    });
  });

  it('uses the API address when set', () => {
    expect(publicConfig({ ...env, VITE_API_URL: 'https://api.x' }).apiUrl).toBe('https://api.x');
  });

  it("names what's missing", () => {
    expect(() => publicConfig({ VITE_SUPABASE_URL: 'u' })).toThrow('VITE_SUPABASE_ANON_KEY');
  });

  it('refuses a secret key in either format', () => {
    expect(() => publicConfig({ ...env, VITE_SUPABASE_ANON_KEY: 'sb_secret_abc' })).toThrow('secret');
    expect(() => publicConfig({ ...env, VITE_SUPABASE_ANON_KEY: jwt('service_role') })).toThrow('secret');
    expect(publicConfig({ ...env, VITE_SUPABASE_ANON_KEY: jwt('anon') }).supabaseKey).toBe(jwt('anon'));
  });

  it('refuses a Netlify build that would point the app at localhost (FAIL-15)', () => {
    expect(() => publicConfig({ ...env, NETLIFY: 'true' })).toThrow('VITE_API_URL');
    expect(() => publicConfig({ ...env, NETLIFY: 'true', VITE_API_URL: 'http://api.x' })).toThrow('VITE_API_URL');
    expect(publicConfig({ ...env, NETLIFY: 'true', VITE_API_URL: 'https://api.x' }).apiUrl).toBe('https://api.x');
    expect(publicConfig(env).apiUrl).toBe('http://localhost:3001');
  });
});

describe('how long each write may take', () => {
  const timeoutOf = async (name: string, input: unknown) => {
    const api = vi.fn(async () => ({}));
    await createFunctions(api as never, () => FUNCTIONS).write(name, input);
    return (api.mock.calls[0] as unknown as [string, { timeout: string }])[1].timeout;
  };

  it('uses the registry: money, the demo buttons, and "write" for the rest', async () => {
    expect(await timeoutOf('start_pension', { monthlyLei: 300 })).toBe('money');
    expect(await timeoutOf('advance_clock', { months: 1 })).toBe('long');
    expect(await timeoutOf('simulate_apia_advance', {})).toBe('long');
    expect(await timeoutOf('complete_task', { id: 'x:2026' })).toBe('write');
  });
});
