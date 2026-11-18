import { describe, expect, it } from 'vitest';
import { convertAmount, parseFrankfurter, ratesAreOld, type ExchangeRates } from './index';

const rates: ExchangeRates = { date: '2026-11-06', rates: { RON: 5.3403, USD: 1.1165, GBP: 0.83415 } };
const live = { amount: 1, base: 'EUR', date: '2026-11-06', rates: rates.rates };

describe('parseFrankfurter', () => {
  it('reads the real response shape', () => {
    expect(parseFrankfurter(live)).toEqual(rates);
  });

  it('refuses a response with a rate missing', () => {
    expect(() => parseFrankfurter({ ...live, rates: { RON: 5.34, USD: 1.11 } })).toThrow();
  });

  it('refuses another base, a zero rate or junk', () => {
    expect(() => parseFrankfurter({ ...live, base: 'USD' })).toThrow();
    expect(() => parseFrankfurter({ ...live, rates: { ...rates.rates, GBP: 0 } })).toThrow();
    expect(() => parseFrankfurter('down for maintenance')).toThrow();
  });
});

describe('convertAmount', () => {
  it('keeps the amount when the currency is the same', () => {
    expect(convertAmount(12_345, 'RON', 'RON', rates)).toBe(12_345);
  });

  it('converts to and from EUR', () => {
    expect(convertAmount(534_030, 'RON', 'EUR', rates)).toBe(100_000);
    expect(convertAmount(100_000, 'EUR', 'RON', rates)).toBe(534_030);
  });

  it('goes through EUR between two other currencies', () => {
    expect(convertAmount(111_650, 'USD', 'GBP', rates)).toBe(83_415);
  });

  it('always returns whole units', () => {
    expect(Number.isInteger(convertAmount(1, 'RON', 'GBP', rates))).toBe(true);
    expect(Number.isInteger(convertAmount(1_686_577, 'RON', 'USD', rates))).toBe(true);
  });
});

describe('ratesAreOld', () => {
  it('accepts a long weekend and flags anything over a week', () => {
    expect(ratesAreOld(rates, '2026-11-09')).toBe(false);
    expect(ratesAreOld(rates, '2026-11-13')).toBe(false);
    expect(ratesAreOld(rates, '2026-11-14')).toBe(true);
  });
});
