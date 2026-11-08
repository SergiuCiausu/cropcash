import { describe, expect, it } from 'vitest';
import { convertText } from '../live/money-text';
import { moneyFormat } from './currency';
import { about, cents, exact, signedLei } from './format';

const rates = { date: '2026-11-07', rates: { RON: 5.0912, USD: 1.0834, GBP: 0.8721 } };
const AMOUNTS = [0, 1, 49, 50, 149, 150, 99_999, 100_000, 1_264_932, 123_456_789, -150, -49_950, -1_264_932];

describe('an amount reads the same on its own and inside a sentence', () => {
  for (const code of ['EUR', 'USD', 'GBP'] as const) {
    const money = moneyFormat({ code, rates });
    it(`in ${code}`, () => {
      for (const bani of AMOUNTS) {
        expect(money.lei(bani)).toBe(convertText(`${exact(bani)} lei`, code, rates));
        expect(money.about(bani)).toBe(convertText(`${about(bani)} lei`, code, rates));
        expect(money.cents(bani)).toBe(convertText(`${cents(bani)} lei`, code, rates));
        expect(money.signed(bani)).toBe(convertText(signedLei(bani), code, rates));
      }
    });
  }

  it('stays in lei without rates, or in RON', () => {
    for (const choice of [{ code: 'RON', rates }, { code: 'EUR', rates: null }] as const) {
      const money = moneyFormat(choice);
      expect(money.lei(1_264_932)).toBe('12.649 lei');
      expect(money.about(1_264_932)).toBe('12.600 lei');
      expect(money.cents(1_264_932)).toBe('12.649,32 lei');
      expect(money.signed(-120_000)).toBe('−1.200 lei');
    }
  });
});
