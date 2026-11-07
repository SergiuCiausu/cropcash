import { describe, expect, it } from 'vitest';
import { loadData, type CountyYield } from '../data';
import { badYears, riskFundProgress, riskShareOfIncome, worstBadYears } from './index';

const data = loadData();

const series = (county: string, cropId: string, yields: number[]): CountyYield[] =>
  yields.map((y, k) => ({ county, crop_id: cropId, year: 2016 + k, yield_t_per_ha: y }));

describe('riskFundProgress', () => {
  it('part of the way', () => {
    expect(riskFundProgress(500_000, 2_000_000)).toEqual({
      saved: 500_000,
      target: 2_000_000,
      missing: 1_500_000,
      pct: 25,
      done: false,
    });
  });

  it('full or over the target', () => {
    const p = riskFundProgress(2_500_000, 2_000_000);
    expect(p.missing).toBe(0);
    expect(p.pct).toBe(100);
    expect(p.done).toBe(true);
  });

  it('no target (a bad year costs nothing) counts as done', () => {
    expect(riskFundProgress(0, 0).done).toBe(true);
  });
});

describe('riskShareOfIncome', () => {
  it('10% of the APIA advance (12.652 lei → 1.265,20 lei)', () => {
    expect(riskShareOfIncome(1_265_200, 10, 2_000_000)).toBe(126_520);
  });

  it('never more than what is missing, nothing once full', () => {
    expect(riskShareOfIncome(1_265_200, 10, 50_000)).toBe(50_000);
    expect(riskShareOfIncome(1_265_200, 10, 0)).toBe(0);
    expect(riskShareOfIncome(-100, 10, 50_000)).toBe(0);
  });
});

describe('badYears', () => {
  // Mean 5,0; 80% = 4,0; years below 4,0: 3,5 · 3,0 · 3,9 → 3 of 10.
  const corn = series('TR', 'porumb', [5.5, 3.5, 6, 5.6, 3.0, 6.1, 5.9, 3.9, 5.5, 5.0]);

  it('counts years below 80% of the mean', () => {
    expect(badYears(corn, 'TR', 'porumb', 80, 10)).toEqual({ county: 'TR', cropId: 'porumb', bad: 3, total: 10 });
  });

  it('only the last windowYears years', () => {
    const longer = [...series('TR', 'porumb', [1, 1]).map((h) => ({ ...h, year: h.year - 10 })), ...corn];
    expect(badYears(longer, 'TR', 'porumb', 80, 10)!.bad).toBe(3);
  });

  it('null without enough history (never invents a figure)', () => {
    expect(badYears(corn.slice(0, 9), 'TR', 'porumb', 80, 10)).toBeNull();
    expect(badYears(corn, 'VN', 'porumb', 80, 10)).toBeNull();
  });

  it('county history is still DE-VERIFICAT, so Ion gets null today', () => {
    expect(data.crops.county_history.status).toBe('DE-VERIFICAT');
    expect(worstBadYears(data, 'TR', ['grau', 'porumb'])).toBeNull();
    expect(worstBadYears(data, null, ['grau'])).toBeNull();
  });
});
