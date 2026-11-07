import { describe, expect, it, vi } from 'vitest';
import { exchangeRatesProvider } from './rates';

const body = { amount: 1, base: 'EUR', date: '2026-11-06', rates: { RON: 5.3403, USD: 1.1165, GBP: 0.83415 } };
const expected = { date: body.date, rates: body.rates };
const ok = () => new Response(JSON.stringify(body), { status: 200 });
const HOUR = 3_600_000;

describe('exchangeRatesProvider', () => {
  it('fetches once and serves the same rates while they are fresh', async () => {
    const fetcher = vi.fn(async () => ok());
    let time = 0;
    const get = exchangeRatesProvider(fetcher as unknown as typeof fetch, () => time);
    expect(await get()).toEqual(expected);
    time = 5 * HOUR;
    expect(await get()).toEqual(expected);
    expect(fetcher).toHaveBeenCalledTimes(1);
    time = 7 * HOUR;
    await get();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('asks only for the three rates it needs and sends no farmer data', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => ok());
    await exchangeRatesProvider(fetcher as unknown as typeof fetch, () => 0)();
    expect(fetcher.mock.calls[0]![0]).toBe('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=RON,USD,GBP');
    expect(fetcher.mock.calls[0]![1]?.body).toBeUndefined();
  });

  it('shares one fetch between requests arriving together', async () => {
    const fetcher = vi.fn(async () => ok());
    const get = exchangeRatesProvider(fetcher as unknown as typeof fetch, () => 0);
    await Promise.all([get(), get(), get()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns null, not a guess, when nothing was ever fetched', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const get = exchangeRatesProvider((async () => { throw new Error('offline'); }) as typeof fetch, () => 0);
    expect(await get()).toBeNull();
    warn.mockRestore();
  });

  it('keeps the last good rates through a failure, and an incomplete answer counts as one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let time = 0;
    const answers = [
      ok(),
      new Response('{}', { status: 500 }),
      new Response(JSON.stringify({ ...body, rates: { RON: 5.3 } }), { status: 200 }),
    ];
    const get = exchangeRatesProvider((async () => answers.shift()!) as typeof fetch, () => time);
    await get();
    time = 7 * HOUR;
    expect(await get()).toEqual(expected);
    time = 8 * HOUR;
    expect(await get()).toEqual(expected);
    warn.mockRestore();
  });
});
