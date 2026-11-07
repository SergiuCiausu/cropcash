import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { longForecast } from '../functions/plan';
import { computeSubsidies, normalizeParcels } from '../subsidies';
import { firstYearsTotal, rollingYears } from './scenarios';
import {
  cropSeason,
  firstSaleMonth,
  gatheredSeason,
  growingMonths,
  growingSeason,
  harvestFigures,
  nextSowing,
  withFarmerHarvest,
} from './seasons';
import { buildTimeline, type AmountScenario, type TimelineInput } from './timeline';

const data = loadData();
const crop = (id: string) => data.crops.crops.find((c) => c.id === id)!;
const farm = { parcels: [{ cropId: 'grau', areaHa: 8 }, { cropId: 'porumb', areaHa: 7 }], age: 55 };
const subsidies = computeSubsidies(farm, data, { exchangeRates: { FEGA: 5.28 } });
const input: TimelineInput = { parcels: normalizeParcels(farm.parcels), subsidies, startBalance: 3_500_000 };
const build = (i: TimelineInput, amounts: AmountScenario = 'medium', months = 12, d = data) =>
  buildTimeline(i, d, { start: '2026-11', months, timing: 'late', amounts });
const saleMonths = (i: TimelineInput, cropId: string, months = 24) =>
  build(i, 'medium', months).months.flatMap((m) =>
    m.entries.some((e) => e.kind === 'crop_sale' && e.cropId === cropId) ? [m.key] : [],
  );
const stored = {
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
};

describe('crop seasons', () => {
  it('depend on the crop', () => {
    expect(growingMonths(crop('grau'))).toBe(9);
    expect(growingMonths(crop('porumb'))).toBe(6);
    expect(growingMonths(crop('floarea-soarelui'))).toBe(5);
  });

  it('wheat sown in October is cut the next July', () => {
    expect(cropSeason(crop('grau'), '2025-10')).toEqual({ sown: '2025-10', harvest: '2026-07', sale: '2026-07' });
  });

  it('on 7 Nov 2026 the wheat gathered was sown in 2025, the maize in 2026', () => {
    expect(gatheredSeason(crop('grau'), '2026-11').sown).toBe('2025-10');
    expect(gatheredSeason(crop('porumb'), '2026-11').sown).toBe('2026-04');
  });

  it('in November wheat is in the ground and maize waits for April', () => {
    expect(growingSeason(crop('grau'), '2026-11')?.harvest).toBe('2027-07');
    expect(growingSeason(crop('porumb'), '2026-11')).toBeNull();
    expect(nextSowing(crop('porumb'), '2026-11')).toBe('2027-04');
  });

  it('in June the wheat still counts as last year\'s crop not gathered', () => {
    expect(gatheredSeason(crop('grau'), '2027-06').sown).toBe('2025-10');
    expect(growingSeason(crop('grau'), '2027-06')?.harvest).toBe('2027-07');
  });
});

describe('a planted parcel moves its first sale', () => {
  const planted = (plantedMonth: string): TimelineInput => ({
    ...input,
    parcels: normalizeParcels([{ cropId: 'grau', areaHa: 8, plantedMonth }, { cropId: 'porumb', areaHa: 7 }]),
  });

  it('sown on time changes nothing', () => {
    expect(build(planted('2026-10')).months).toEqual(build(input).months);
  });

  it('sown late sells late, once, then goes back to the usual month', () => {
    expect(saleMonths(planted('2026-11'), 'grau', 36)).toEqual(['2027-08', '2029-07', '2028-07'].sort());
  });

  it('a crop past its date and not sold counts from the first month', () => {
    expect(firstSaleMonth(crop('porumb'), '2026-04', '2026-11')).toBe('2026-11');
  });
});

describe('grain in the barn', () => {
  const grain: TimelineInput = { ...input, stored: [{ id: 'a', cropId: 'porumb', kg: 10_000 }] };

  it('adds one sale in the first month, at the crop price', () => {
    const extra = build(grain).months[0]!.in - build(input).months[0]!.in;
    expect(extra).toBe(Math.round(10_000 * crop('porumb').price_lei_per_kg.mean * 100));
    expect(build(grain).months[1]).toEqual(expect.objectContaining({ in: build(input).months[1]!.in }));
  });

  it('a bad year uses the mean price, like a yearly sale', () => {
    expect(build(grain, 'bad').months[0]!.in - build(input, 'bad').months[0]!.in).toBe(
      build(grain).months[0]!.in - build(input).months[0]!.in,
    );
  });
});

describe('the farmer\'s own harvest', () => {
  it('yield by area, price by tonnes', () => {
    const [wheat] = harvestFigures([
      { cropId: 'grau', areaHa: 5, tonnes: 30, priceLeiPerKg: 1 },
      { cropId: 'grau', areaHa: 3, tonnes: 10, priceLeiPerKg: 1.4 },
    ]);
    expect(wheat).toEqual({ cropId: 'grau', yieldTPerHa: 5, priceLeiPerKg: 1.1 });
  });

  it('unknown figures stay null', () => {
    expect(harvestFigures([{ cropId: 'grau', areaHa: 8, tonnes: null, priceLeiPerKg: null }])[0]).toEqual({
      cropId: 'grau',
      yieldTPerHa: null,
      priceLeiPerKg: null,
    });
  });

  it('becomes the normal year and keeps the distance to good and bad', () => {
    const own = withFarmerHarvest(data, [{ cropId: 'grau', yieldTPerHa: 6, priceLeiPerKg: null }]);
    const wheat = own.crops.crops.find((c) => c.id === 'grau')!;
    expect(wheat.yield_t_per_ha.mean).toBe(6);
    expect(wheat.yield_t_per_ha.min).toBeCloseTo(4.8);
    expect(wheat.yield_t_per_ha.max).toBeCloseTo(7.2);
    expect(wheat.price_lei_per_kg).toEqual(crop('grau').price_lei_per_kg);
    expect(wheat.cost_lei_per_ha).toEqual(crop('grau').cost_lei_per_ha);
  });

  it('does not change the original data', () => {
    withFarmerHarvest(data, [{ cropId: 'grau', yieldTPerHa: 6, priceLeiPerKg: 2 }]);
    expect(crop('grau').yield_t_per_ha.mean).toBe(5);
  });

  it('moves the sale: 8 ha at 6 t/ha at 1,05 lei is 50.400 lei', () => {
    const own = withFarmerHarvest(data, [{ cropId: 'grau', yieldTPerHa: 6, priceLeiPerKg: null }]);
    const sale = build(input, 'medium', 12, own).months.flatMap((m) => m.entries).find((e) => e.kind === 'crop_sale' && e.cropId === 'grau');
    expect(sale?.value).toBe(5_040_000);
  });
});

describe('long forecast', () => {
  const long = longForecast(stored, data, { month: '2026-11' });

  it('covers every year on the slider, each of 12 months', () => {
    const max = data.params.long_forecast.max_years.value;
    for (const s of ['bad', 'medium', 'good'] as const) expect(long[s]).toHaveLength(max);
    expect(long.medium[0]).toEqual(expect.objectContaining({ from: '2026-11', to: '2027-10' }));
    expect(long.medium.at(-1)).toEqual(expect.objectContaining({ from: '2035-11', to: '2036-10' }));
  });

  it('subsidies keep coming after year 3, so every normal year is the same', () => {
    expect(new Set(long.medium.map((y) => y.in)).size).toBe(1);
    expect(new Set(long.bad.map((y) => y.in)).size).toBe(1);
    expect(new Set(long.good.map((y) => y.in)).size).toBe(1);
  });

  it('Ion: 102.091 in and 69.000 out in a normal year', () => {
    expect(Math.round(long.medium[0]!.in / 100)).toBe(102_091);
    expect(long.medium[0]!.out).toBe(6_900_000);
    expect(long.medium[0]!.left).toBe(long.medium[0]!.in - long.medium[0]!.out);
  });

  it('whole bani, and good > normal > bad', () => {
    for (const y of [...long.bad, ...long.medium, ...long.good]) expect(Number.isInteger(y.in)).toBe(true);
    expect(long.good[0]!.in).toBeGreaterThan(long.medium[0]!.in);
    expect(long.medium[0]!.in).toBeGreaterThan(long.bad[0]!.in);
  });

  it('adds up the first years', () => {
    expect(firstYearsTotal(long.medium, 3).in).toBe(long.medium[0]!.in * 3);
    expect(firstYearsTotal(long.medium, 0)).toEqual({ in: 0, out: 0, left: 0 });
  });

  it('a partial block is left out', () => {
    expect(rollingYears(build(input, 'medium', 18))).toHaveLength(1);
  });
});
