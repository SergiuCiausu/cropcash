import { parseFrankfurter, type ExchangeRates } from '@cropcash/shared';

const RATES_URL = 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=RON,USD,GBP';
const FRESH_MS = 6 * 60 * 60 * 1000;
/** After a failure, serve the last good rates for a while instead of slowing every request. */
const RETRY_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 8_000;

export type RatesProvider = () => Promise<ExchangeRates | null>;

/** Daily rates kept in memory. Sends no farmer data. Null only when none were ever fetched. */
export function exchangeRatesProvider(fetcher: typeof fetch = fetch, now: () => number = Date.now): RatesProvider {
  let last: ExchangeRates | null = null;
  let nextFetch = 0;
  let pending: Promise<ExchangeRates | null> | null = null;

  const refresh = async () => {
    try {
      const res = await fetcher(RATES_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`status ${res.status}`);
      last = parseFrankfurter(await res.json());
      nextFetch = now() + FRESH_MS;
    } catch (err) {
      console.warn('[fx] keeping the last rates:', err instanceof Error ? err.message : err);
      nextFetch = now() + RETRY_MS;
    }
    return last;
  };

  return () => {
    if (now() < nextFetch) return Promise.resolve(last);
    pending ??= refresh().finally(() => {
      pending = null;
    });
    return pending;
  };
}
