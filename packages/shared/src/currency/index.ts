import { z } from 'zod';

/**
 * Daily exchange rates. They only change how an amount is displayed: subsidies, the salary
 * and the plan are calculated and saved in lei, and APIA pays at its fixed campaign rate.
 */
export const CURRENCIES = ['RON', 'EUR', 'USD', 'GBP'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];
export const CurrencySchema = z.enum(CURRENCIES);

const Rate = z.number().positive();

export const ExchangeRatesSchema = z.object({
  date: z.iso.date(),
  /** Units of each currency for 1 EUR. */
  rates: z.object({ RON: Rate, USD: Rate, GBP: Rate }),
});
export type ExchangeRates = z.infer<typeof ExchangeRatesSchema>;

/** The ECB publishes on working days, so a long weekend is still not "old". */
export const RATES_OLD_AFTER_DAYS = 7;

/** Throws unless all three rates are present: Frankfurter silently drops a code it doesn't know. */
export function parseFrankfurter(json: unknown): ExchangeRates {
  const parsed = ExchangeRatesSchema.extend({ base: z.literal('EUR') }).parse(json);
  return { date: parsed.date, rates: parsed.rates };
}

const perEur = (code: CurrencyCode, r: ExchangeRates) => (code === 'EUR' ? 1 : r.rates[code]);

/** Converts whole bani or cents through EUR, rounding only the final amount. */
export function convertAmount(amount: number, from: CurrencyCode, to: CurrencyCode, r: ExchangeRates): number {
  if (from === to) return amount;
  return Math.round((amount / perEur(from, r)) * perEur(to, r));
}

export function ratesAreOld(r: ExchangeRates, today: string): boolean {
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${r.date}T00:00:00Z`)) / 86_400_000;
  return days > RATES_OLD_AFTER_DAYS;
}
