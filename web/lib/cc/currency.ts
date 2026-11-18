/* The currency amounts are shown in. Display only: everything is calculated and saved in lei.
   Without saved rates it stays in lei, so no rate is ever guessed. React pages print through these
   formatters instead of rewriting the page text the way app.js's showCurrency() does. */
import { CURRENCIES, ExchangeRatesSchema, type CurrencyCode, type ExchangeRates } from '../../../packages/shared/src/currency/index';
import { amountIn, convertText } from '../live/money-text';
import { about, cents, exact } from './format';
import { KEYS, readJson, readText, writeJson, writeText, type KeyStore } from './storage';

export interface CurrencyChoice {
  code: CurrencyCode;
  rates: ExchangeRates | null;
}

export function savedRates(store: KeyStore): ExchangeRates | null {
  const parsed = ExchangeRatesSchema.safeParse(readJson(store, KEYS.rates));
  return parsed.success ? parsed.data : null;
}

export function loadCurrency(store: KeyStore): CurrencyChoice {
  const rates = savedRates(store);
  const code = readText(store, KEYS.currency);
  return { code: rates && (CURRENCIES as readonly string[]).includes(code ?? '') ? (code as CurrencyCode) : 'RON', rates };
}

export const saveCurrency = (store: KeyStore, code: CurrencyCode) => writeText(store, KEYS.currency, code);
export const saveRates = (store: KeyStore, rates: ExchangeRates) => writeJson(store, KEYS.rates, rates);

/**
 * The money formatters for the chosen currency. An amount is rounded as it would be in lei, then
 * converted, so the same sum reads the same in a sentence (`text`) and on its own.
 * `text` converts a whole sentence that already holds amounts in lei.
 */
export function moneyFormat({ code, rates }: CurrencyChoice) {
  const text = (s: string) => (code === 'RON' || !rates ? s : convertText(s, code, rates));
  /** `inLei` is how the amount reads in lei; `rounded` is the same amount in bani, sign dropped. */
  const shown = (inLei: string, rounded: number, withCents = false) => (code === 'RON' || !rates ? `${inLei} lei` : amountIn(rounded, code, rates, withCents));
  const lei = (bani: number) => shown(exact(bani), Math.abs(Math.round(bani / 100)) * 100);
  return {
    code,
    text,
    /** "12.649 lei", exact to the leu. */
    lei,
    /** "12.600 lei", rounded to 100 lei for headlines. */
    about: (bani: number) => shown(about(bani), Math.abs(Math.round(bani / 10000)) * 10000),
    /** "12.649,32 lei". */
    cents: (bani: number) => shown(cents(bani), Math.abs(bani), true),
    /** "−1.200 lei". */
    signed: (bani: number) => `${bani < 0 ? '−' : ''}${lei(Math.abs(bani))}`,
  };
}

export type MoneyFormat = ReturnType<typeof moneyFormat>;
