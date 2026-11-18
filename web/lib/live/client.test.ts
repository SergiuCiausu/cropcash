import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { ApiError, createApi, fetchWithTimeout, parseRetryAfter, timeoutsFrom } from './client';

/* A fetch that never answers until its signal aborts, like a phone with signal but no data. */
const hanging = vi.fn<typeof fetch>(
  (_url, init) =>
    new Promise((_done, fail) => {
      init?.signal?.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError')));
    }),
);

const apiWith = (fetchFn: typeof fetch, timeouts = { read: 1000, money: 5000 }) =>
  createApi({ apiUrl: 'http://api.test', getToken: async () => null, isOnline: () => true, fetchFn, timeouts });

const errorOf = (p: Promise<unknown>) => p.then(() => null, (e: ApiError) => e);

describe('timeouts (FAIL-01)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gives up on a read after its timeout, as "timeout", not "network"', async () => {
    const pending = errorOf(apiWith(hanging)('/api/me'));
    await vi.advanceTimersByTimeAsync(999);
    expect(hanging).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ status: 0, code: 'timeout' });
  });

  it('gives a money call its own, longer time', async () => {
    let settled = false;
    const pending = errorOf(apiWith(hanging)('/api/pension', { method: 'POST', timeout: 'money' })).then((e) => { settled = true; return e; });
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ code: 'timeout' });
  });

  it('never retries on its own', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => { throw new TypeError('Failed to fetch'); });
    expect(await errorOf(apiWith(fetchFn)('/api/sales', { method: 'POST', body: '{}' }))).toMatchObject({ code: 'network' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('counts a body that stalls after the headers as a timeout', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => new Promise((_d, fail) => init?.signal?.addEventListener('abort', () => fail(new Error('aborted')))),
    }) as unknown as Response);
    const pending = errorOf(apiWith(fetchFn)('/api/me'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ code: 'timeout' });
  });

  it('waits forever only when no timeouts are given (old callers)', async () => {
    const api = createApi({ apiUrl: 'http://api.test', getToken: async () => null, isOnline: () => true, fetchFn: hanging });
    let settled = false;
    void api('/api/me').catch(() => undefined).finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(settled).toBe(false);
  });

  it('lets fetchWithTimeout give up too, for Supabase and the ping', async () => {
    const pending = fetchWithTimeout(hanging, 2000)('http://x.test').then(() => null, (e: DOMException) => e.name);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toBe('AbortError');
  });
});

describe('Retry-After', () => {
  it('is kept on a 429', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { 'Retry-After': '30' } }));
    expect(await errorOf(apiWith(fetchFn)('/api/sales'))).toMatchObject({ status: 429, code: 'rate_limited', retryAfterMs: 30_000 });
  });

  it('reads seconds and dates, and ignores rubbish', () => {
    const now = Date.parse('2026-11-08T12:00:00Z');
    expect(parseRetryAfter('5', now)).toBe(5000);
    expect(parseRetryAfter('Sun, 08 Nov 2026 12:01:00 GMT', now)).toBe(60_000);
    expect(parseRetryAfter('soon', now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
  });
});

describe('timeoutsFrom', () => {
  it('turns the network block of plan-params.json into milliseconds', () => {
    const t = timeoutsFrom(loadData().params.network);
    expect(t.read).toBeGreaterThan(0);
    expect(t.health).toBeLessThan(t.read);
    expect(t.money).toBeGreaterThanOrEqual(t.write);
    expect(t.upload).toBeGreaterThanOrEqual(t.ai);
  });
});

describe('the slow routes get time to finish', () => {
  it('gives the demo buttons more than the 30 s the advance waits on Stripe', () => {
    const t = timeoutsFrom(loadData().params.network);
    expect(t.long).toBeGreaterThan(60_000);
    expect(t.setup).toBeGreaterThan(t.money);
  });
});
