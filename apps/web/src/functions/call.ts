import type { ApiRequest, ExchangeRates } from '@cropcash/shared';
import { api } from '../api/client';
import { setExchangeRates } from '../lib/currency';

/** Runs a write from the registry. Needs internet: callers check before calling. */
export function callWrite<Input>(fn: { request(input: Input): ApiRequest }, input: Input): Promise<unknown> {
  const { method, path, body } = fn.request(input);
  return api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

/** Refreshes the saved rates. Offline or on failure the last saved ones simply stay. */
export async function refreshExchangeRates(): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const { rates } = await api<{ rates: ExchangeRates | null }>('/api/exchange-rates');
    if (rates) setExchangeRates(rates);
  } catch {
    /* keep what we have */
  }
}
