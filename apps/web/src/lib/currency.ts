import { useSyncExternalStore } from 'react';
import {
  CURRENCIES,
  ExchangeRatesSchema,
  convertAmount,
  type CurrencyCode,
  type ExchangeRates,
} from '@cropcash/shared';

/**
 * The currency amounts are shown in, saved per device. Display only: everything is calculated
 * and saved in lei. With no rates on the device it stays on RON, so no rate is ever guessed.
 */
const CODE_KEY = 'cropcash-currency';
const RATES_KEY = 'cropcash-rates';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: it just won't be remembered */
  }
}

function savedRates(): ExchangeRates | null {
  try {
    return ExchangeRatesSchema.parse(JSON.parse(read(RATES_KEY) ?? 'null'));
  } catch {
    return null;
  }
}

function savedCode(): CurrencyCode {
  const saved = read(CODE_KEY);
  return CURRENCIES.find((c) => c === saved) ?? 'RON';
}

let code = savedCode();
let rates = savedRates();
let version = 0;
const listeners = new Set<() => void>();

function changed() {
  version += 1;
  for (const notify of listeners) notify();
}

export const displayCurrency = (): CurrencyCode => (rates ? code : 'RON');

/** Bani -> the same amount in whole minor units of the display currency. */
export function toDisplay(bani: number): number {
  const target = displayCurrency();
  return rates ? convertAmount(bani, 'RON', target, rates) : bani;
}

export function setCurrency(next: CurrencyCode) {
  code = next;
  write(CODE_KEY, next);
  changed();
}

export function setExchangeRates(next: ExchangeRates) {
  rates = next;
  write(RATES_KEY, JSON.stringify(next));
  changed();
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};

/** Re-renders on a change. `ready` is false until rates have reached this device. */
export function useCurrency() {
  useSyncExternalStore(subscribe, () => version);
  return { code: displayCurrency(), ready: rates !== null };
}
