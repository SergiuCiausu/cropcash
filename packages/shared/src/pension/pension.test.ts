import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { futureValue, pensionParams, simulatePension, suggestPension } from './index';

const params = pensionParams(loadData());

/** C × ((1 + i)^n − 1) / i, the closed form from docs/05 §4. */
const closedForm = (c: number, n: number, pct: number) => {
  const i = pct / 1200;
  return (c * ((1 + i) ** n - 1)) / i;
};

describe('futureValue', () => {
  it('zero return = just the sum of contributions', () => {
    expect(futureValue(20_000, 120, 0)).toBe(2_400_000);
  });

  it('stays within a lei of the closed form, and is an integer', () => {
    for (const pct of [2, 4, 6]) {
      const v = futureValue(20_000, 120, pct);
      expect(Number.isInteger(v)).toBe(true);
      expect(Math.abs(v - closedForm(20_000, 120, pct))).toBeLessThan(100);
    }
  });

  it('rejects non-integer money', () => {
    expect(() => futureValue(200.5, 12, 4)).toThrow();
  });
});

describe('simulatePension', () => {
  it('Ion: 55 years, 200 lei/month, 4% → ≈ 29.450 lei at 65, 24.000 lei paid in', () => {
    const s = simulatePension(55, 20_000, params)!;
    expect(s.months).toBe(120);
    expect(s.paidIn).toBe(2_400_000);
    expect(Math.round(s.atTarget.probable / 100 / 10) * 10).toBe(29_450);
    // 29.450 / 120 ≈ 245 lei per month over 10 years (docs/05 §4).
    expect(Math.round(s.perMonthAfter / 100)).toBe(245);
  });

  it('scenarios are ordered low < probable < high', () => {
    const s = simulatePension(55, 20_000, params)!;
    expect(s.atTarget.low).toBeLessThan(s.atTarget.probable);
    expect(s.atTarget.probable).toBeLessThan(s.atTarget.high);
    expect(s.atTarget.low).toBeGreaterThan(s.paidIn);
  });

  it('no simulation at or past the target age', () => {
    expect(simulatePension(65, 20_000, params)).toBeNull();
    expect(simulatePension(70, 20_000, params)).toBeNull();
  });

  it('one year left: 12 contributions', () => {
    expect(simulatePension(64, 10_000, params)!.paidIn).toBe(120_000);
  });
});

describe('suggestPension', () => {
  it('at most 5% of the salary, rounded down to 50 lei', () => {
    expect(suggestPension(240_000, params)).toBe(10_000); // 2.400 → 120 → 100 lei
    expect(suggestPension(500_000, params)).toBe(25_000); // 5.000 → 250 lei
  });

  it('kept inside the slider range', () => {
    expect(suggestPension(65_000, params)).toBe(5_000); // 650 → 32 → min 50 lei
    expect(suggestPension(0, params)).toBe(5_000);
    expect(suggestPension(100_000_000, params)).toBe(50_000); // max 500 lei
  });
});
