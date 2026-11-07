import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { computeSubsidies, normalizeParcels } from '../subsidies';
import { buildTimeline, type AmountScenario, type TimelineOptions } from './timeline';
import {
  monthsToYearEnd,
  quarterlyProjection,
  saleForecast,
  saleRanges,
  salaryByScenario,
  yearlyTotals,
} from './scenarios';

const data = loadData();
const crop = (id: string) => data.crops.crops.find((c) => c.id === id)!;
const farm = { parcels: [{ cropId: 'grau', areaHa: 8 }, { cropId: 'porumb', areaHa: 7 }], age: 55 };
const subsidies = computeSubsidies(farm, data, { exchangeRates: { FEGA: 5.28 } });
const input = { parcels: normalizeParcels(farm.parcels), subsidies, startBalance: 3_500_000 };
const opts: TimelineOptions = { start: '2026-11', months: 12, amounts: 'medium', timing: 'late' };
const build = (amounts: AmountScenario, months = 12) => buildTimeline(input, data, { ...opts, amounts, months });
const timelines = { good: build('good'), medium: build('medium'), bad: build('bad') };
const smoothing = { pensionMonthly: 20_000, riskPct: 10, riskRemaining: 3_310_000 };

describe('salaryByScenario', () => {
  const s = salaryByScenario(timelines, smoothing, data);

  it('Ion, normal year without credit: 650 lei (docs/07 §4)', () => {
    expect(s.medium.salary).toBe(65_000);
  });

  it('drought pays less, a good year more (or the same)', () => {
    expect(s.bad.salary).toBeLessThanOrEqual(s.medium.salary);
    expect(s.good.salary).toBeGreaterThanOrEqual(s.medium.salary);
    expect(s.bad.salary).not.toBe(s.good.salary);
  });

  it('all rounded down to 50 lei', () => {
    for (const r of Object.values(s)) expect(r.salary % 5_000).toBe(0);
  });
});

describe('quarterlyProjection over 3 years', () => {
  const months = monthsToYearEnd('2026-11', 3);
  const long = build('medium', months);
  const quarters = quarterlyProjection(long);

  it('November 2026 → December 2028 = 26 months, 9 quarters', () => {
    expect(months).toBe(26);
    expect(quarters.map((q) => q.key)).toEqual([
      '2026-T4',
      '2027-T1',
      '2027-T2',
      '2027-T3',
      '2027-T4',
      '2028-T1',
      '2028-T2',
      '2028-T3',
      '2028-T4',
    ]);
    expect(quarters[0]!.months).toBe(2);
    expect(quarters.slice(1).every((q) => q.months === 3)).toBe(true);
  });

  it('quarters add up to the months, balance carries over', () => {
    expect(quarters.reduce((s, q) => s + q.net, 0)).toBe(long.months.reduce((s, m) => s + m.net, 0));
    expect(quarters.at(-1)!.balanceEnd).toBe(long.months.at(-1)!.balanceEnd);
    for (const q of quarters) expect(q.net).toBe(q.in - q.out);
  });

  it('later years have income too (APIA and harvest projected)', () => {
    const years = yearlyTotals(quarters);
    expect(years.map((y) => y.year)).toEqual([2026, 2027, 2028]);
    expect(years[2]!.in).toBeGreaterThan(0);
    expect(years[2]!.out).toBeGreaterThan(0);
  });

  it('a drought every year ends lower than a normal year', () => {
    const bad = quarterlyProjection(build('bad', months));
    expect(bad.at(-1)!.balanceEnd).toBeLessThan(quarters.at(-1)!.balanceEnd);
  });

  it('monthsToYearEnd from January and December', () => {
    expect(monthsToYearEnd('2027-01', 1)).toBe(12);
    expect(monthsToYearEnd('2026-12', 3)).toBe(25);
  });
});

describe('saleForecast (Î4)', () => {
  it('wheat, 8 ha, mean values: 40 t, 42.000 lei income, break-even 0,85 lei/kg', () => {
    const r = saleRanges(crop('grau'));
    const f = saleForecast(crop('grau'), 800, { priceBaniPerKg: r.price.mean, yieldKgPerHa: r.yield.mean });
    expect(f.productionKg).toBe(40_000);
    expect(f.income).toBe(4_200_000);
    expect(f.cost).toBe(3_400_000);
    expect(f.margin).toBe(800_000);
    expect(f.breakEvenPerKg).toBe(85);
  });

  it('drought yield at the mean price → loss on wheat', () => {
    const r = saleRanges(crop('grau'));
    const f = saleForecast(crop('grau'), 800, { priceBaniPerKg: r.price.mean, yieldKgPerHa: r.yield.min });
    expect(f.income).toBe(3_360_000); // 8 × 4 t × 1,05 (docs/07 §5)
    expect(f.margin).toBeLessThan(0);
    expect(f.breakEvenPerKg).toBeGreaterThan(r.price.mean);
  });

  it('no harvest: no break-even price, the whole cost is lost', () => {
    const f = saleForecast(crop('porumb'), 700, { priceBaniPerKg: 95, yieldKgPerHa: 0 });
    expect(f.breakEvenPerKg).toBe(0);
    expect(f.margin).toBe(-f.cost);
  });

  it('rejects fractional inputs', () => {
    expect(() => saleForecast(crop('grau'), 800, { priceBaniPerKg: 1.05, yieldKgPerHa: 5000 })).toThrow();
  });
});
