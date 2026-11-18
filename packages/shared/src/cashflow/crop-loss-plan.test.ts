/* The plan with lost hectares (docs/crop-loss-plan.md, step 4): only the sale shrinks, a loss already
   known for a harvest beats the history, and the history only counts on the farmer's own yield (P33). */
import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import type { HarvestsInput } from '../farm/harvests';
import type { StoredFarm } from '../farm';
import { buildFarmPlan, farmData, farmLossShare, planTiming, timelineInput } from './farm-plan';
import { cropEconomics } from './insights';
import { saleForecast } from './scenarios';
import { buildTimeline, cropSaleRange, harvestedAri, nextHarvestYear, saleHarvestYear } from './timeline';

const data = loadData();
type Year = HarvestsInput['years'][number];

const maizeYear = (year: number, areaHa: number, lostHa?: number): Year => ({
  year,
  status: 'open',
  openingBani: 0,
  parcels: [{ cropId: 'porumb', areaHa, ...(lostHa === undefined ? {} : { lost: { ha: lostHa } }) }],
});

/** Ion-like: maize only, in Teleorman, the plan starting November 2026. */
const farm = (areaHa: number, years: Year[], expected: HarvestsInput['expected'] = []) =>
  ({
    county: 'TR',
    birth_year: 1970,
    start_balance_bani: 3_500_000,
    parcels: [{ crop_id: 'porumb', area_ari: areaHa * 100, is_arable: true }],
    harvests: { years, gathered: [], expected },
  }) as unknown as StoredFarm;

const OWN_YIELD = [{ cropId: 'porumb', yieldTPerHa: 7, priceLeiPerKg: null }];
const MONTH = '2026-11';

const entries = (f: StoredFarm, kind: 'crop_sale' | 'input_cost') =>
  buildFarmPlan(f, data, { month: MONTH })
    .timelines.medium.months.flatMap((m) => m.entries)
    .filter((e) => e.kind === kind);
const total = (rows: { value: number }[]) => rows.reduce((s, e) => s + e.value, 0);

/** The sales over 24 months, by year, at the probable amount. */
const twoYears = (f: StoredFarm) => {
  const d = farmData(f, data);
  const sales = buildTimeline(timelineInput(f, d), d, { start: MONTH, months: 24, timing: planTiming(d), amounts: 'medium' })
    .months.flatMap((m) => m.entries)
    .filter((e) => e.kind === 'crop_sale');
  return { d, sales: sales.map((e) => ({ month: e.date.slice(0, 7), value: e.value })) };
};
const maizeSale = (f: StoredFarm, ari: number) => {
  const d = farmData(f, data);
  return cropSaleRange(d.crops.crops.find((c) => c.id === 'porumb')!, ari, d.params.forecast.years).probable;
};

describe('which harvest a sale belongs to', () => {
  const maize = data.crops.crops.find((c) => c.id === 'porumb')!;
  it('a sale comes from the last harvest on or before it, the economics from the next one', () => {
    expect(saleHarvestYear(maize, '2027-10')).toBe(2027);
    expect(saleHarvestYear(maize, '2027-09')).toBe(2026);
    expect(nextHarvestYear(maize, '2026-11')).toBe(2027);
    expect(nextHarvestYear(maize, '2027-10')).toBe(2027);
  });
});

describe('a known loss in the plan', () => {
  it('lowers the sale and leaves the costs alone', () => {
    const lost = farm(8, [maizeYear(2027, 8, 3)]);
    const none = farm(8, [maizeYear(2027, 8)]);
    const sale = total(entries(lost, 'crop_sale'));
    expect(sale).toBeGreaterThan(0);
    expect(sale).toBe(total(entries(farm(5, [maizeYear(2027, 5)]), 'crop_sale')));
    expect(sale).toBeLessThan(total(entries(none, 'crop_sale')));
    expect(total(entries(lost, 'input_cost'))).toBe(total(entries(none, 'input_cost')));
  });

  it('counts this year even on a county yield (those hectares are gone)', () => {
    expect(farmLossShare(farm(8, [maizeYear(2027, 8, 3)]), data)!('porumb', 2027)).toBe(3 / 8);
  });

  it('beats the farmer\'s usual share and the history', () => {
    const f = farm(8, [maizeYear(2025, 8, 4), maizeYear(2026, 8, 4), maizeYear(2027, 8, 1)], [{ ...OWN_YIELD[0]!, lossPct: 40 }]);
    expect(farmLossShare(f, data)!('porumb', 2027)).toBe(1 / 8);
    expect(farmLossShare(f, data)!('porumb', 2028)).toBe(0.4);
  });

  it('shows in the economics: less grain, same cost, a higher break-even price', () => {
    const plain = buildFarmPlan(farm(8, [maizeYear(2027, 8)]), data, { month: MONTH }).economics[0]!;
    const lost = buildFarmPlan(farm(8, [maizeYear(2027, 8, 2)]), data, { month: MONTH }).economics[0]!;
    expect(lost.lossShare).toBe(0.25);
    expect(lost.cost).toBe(plain.cost);
    expect(lost.productionT).toBeCloseTo(plain.productionT * 0.75, 1);
    expect(lost.breakEvenPerKg!).toBeGreaterThan(plain.breakEvenPerKg!);
  });
});

describe('the next harvests', () => {
  /* 2026 and 2027 answered: the history before 2028 is (2 + 3) ÷ (8 + 8). */
  const years = [maizeYear(2026, 8, 2), maizeYear(2027, 8, 3)];

  it('uses the real loss in year 1 and the history in year 2', () => {
    const f = farm(8, years, OWN_YIELD);
    const { sales } = twoYears(f);
    expect(sales.map((s) => s.month)).toEqual(['2027-10', '2028-10']);
    expect(sales[0]!.value).toBe(maizeSale(f, 500));
    expect(sales[1]!.value).toBe(maizeSale(f, harvestedAri(800, 5 / 16)));
  });

  it('subtracts no history on a county yield (P33)', () => {
    const f = farm(8, years);
    const { sales } = twoYears(f);
    expect(sales[0]!.value).toBe(maizeSale(f, 500));
    expect(sales[1]!.value).toBe(maizeSale(f, 800));
  });

  it('a farm with no harvests document plans the whole field', () => {
    const f = { ...farm(8, []), harvests: null } as unknown as StoredFarm;
    expect(farmLossShare(f, data)).toBeUndefined();
    expect(twoYears(f).sales[0]!.value).toBe(maizeSale(f, 800));
  });
});

describe('the per-crop figures', () => {
  const maize = data.crops.crops.find((c) => c.id === 'porumb')!;

  it('cropEconomics: income on harvested hectares, cost on sown, no break-even when nothing is left', () => {
    const whole = cropEconomics(maize, 800);
    const quarter = cropEconomics(maize, 800, 0.25);
    expect(quarter.cost).toBe(whole.cost);
    expect(quarter.income).toBe(cropEconomics(maize, 600).income);
    expect(quarter.breakEvenPerKg).toBe(Math.round(whole.breakEvenPerKg! / 0.75));
    expect(cropEconomics(maize, 800, 1).breakEvenPerKg).toBeNull();
  });

  it('saleForecast: production shrinks, the cost doesn\'t', () => {
    const input = { priceBaniPerKg: 95, yieldKgPerHa: 6500 };
    const whole = saleForecast(maize, 800, input);
    const lost = saleForecast(maize, 800, input, 3 / 8);
    expect(lost.productionKg).toBe(32_500);
    expect(lost.cost).toBe(whole.cost);
    expect(lost.breakEvenPerKg).toBeGreaterThan(whole.breakEvenPerKg);
    expect(() => saleForecast(maize, 800, input, 1.5)).toThrow();
  });
});

describe('where the share comes from (docs/crop-loss-plan.md, step 6)', () => {
  const economics = (f: StoredFarm) => buildFarmPlan(f, data, { month: MONTH }).economics.find((c) => c.cropId === 'porumb')!;

  it('says it is the history, over which harvests, on the farmer\'s own yield', () => {
    const e = economics(farm(8, [maizeYear(2024, 8, 2), maizeYear(2025, 8, 0), maizeYear(2026, 8, 2)], OWN_YIELD));
    expect(e.loss).toMatchObject({ basis: 'history', from: 2024, to: 2026, applied: true });
    expect(e.loss!.share).toBeCloseTo(4 / 24);
    expect(e.lossShare).toBeCloseTo(4 / 24);
  });

  it('keeps the history on a county yield but doesn\'t subtract it (P33)', () => {
    const e = economics(farm(8, [maizeYear(2024, 8, 2), maizeYear(2025, 8, 2)]));
    expect(e.loss).toMatchObject({ basis: 'history', applied: false });
    expect(e.lossShare).toBe(0);
  });

  it('the farmer\'s own % beats the history', () => {
    const e = economics(farm(8, [maizeYear(2024, 8, 2), maizeYear(2025, 8, 2)], [{ ...OWN_YIELD[0]!, lossPct: 10 }]));
    expect(e.loss).toMatchObject({ basis: 'farmer', share: 0.1, applied: true });
    expect(e.lossShare).toBe(0.1);
  });

  it('a farm without harvest years has no loss line', () => {
    expect(economics(farm(8, [])).loss).toBeUndefined();
  });
});
