import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { NATIONAL_AREA, withCountyYields, yieldRange } from './county-yields';
import { afterBadHarvest, buildFarmPlan, type PlanFarm } from './farm-plan';
import { withFarmerHarvest } from './seasons';

const data = loadData();
const history = data.crops.county_history;
const params = data.params.yield_history;
const CROPS = ['grau', 'porumb', 'floarea-soarelui'];
const crop = (d: typeof data, id: string) => d.crops.crops.find((c) => c.id === id)!;

describe('yields by county', () => {
  it('has a usable national row and a row for every county', () => {
    for (const id of CROPS) expect(yieldRange(history, NATIONAL_AREA, id, params)).not.toBeNull();
    for (const c of data.counties.counties) expect(history.data[c.code], c.code).toBeDefined();
  });

  it('every county gets ordered yields for every crop, its own or the national ones', () => {
    for (const { code } of data.counties.counties) {
      const local = withCountyYields(data, code);
      for (const id of CROPS) {
        const { min, mean, max } = crop(local, id).yield_t_per_ha;
        expect(min, `${code} ${id}`).toBeGreaterThan(0);
        expect(min, `${code} ${id}`).toBeLessThanOrEqual(mean);
        expect(mean, `${code} ${id}`).toBeLessThanOrEqual(max);
        expect(crop(local, id).yield_basis, `${code} ${id}`).toBeDefined();
      }
    }
  });

  it('Teleorman maize: worst 3, median and best 3 of 2011 to 2025', () => {
    expect(yieldRange(history, 'TR', 'porumb', params)).toEqual({
      range: { min: 1.469, mean: 4.005, max: 7.09 },
      basis: { area: 'TR', from: 2011, to: 2025 },
    });
  });

  it('counties differ', () => {
    expect(crop(withCountyYields(data, 'TM'), 'grau').yield_t_per_ha.mean).not.toBe(crop(withCountyYields(data, 'SV'), 'grau').yield_t_per_ha.mean);
  });

  it('falls back to the country when a county has too few harvests', () => {
    expect(crop(withCountyYields(data, 'B'), 'grau').yield_basis?.area).toBe(NATIONAL_AREA);
  });

  it('with no county, nothing changes', () => {
    expect(withCountyYields(data, null)).toBe(data);
  });

  it("a second pass keeps the farmer's own yield", () => {
    const own = withFarmerHarvest(withCountyYields(data, 'TR'), [{ cropId: 'porumb', yieldTPerHa: 6, priceLeiPerKg: null }]);
    expect(crop(withCountyYields(own, 'TR'), 'porumb').yield_t_per_ha.mean).toBe(6);
  });

  it("the farmer's own yield keeps the county's ratio for a bad year", () => {
    const own = withFarmerHarvest(withCountyYields(data, 'TR'), [{ cropId: 'porumb', yieldTPerHa: 6, priceLeiPerKg: null }]);
    expect(crop(own, 'porumb').yield_t_per_ha.min).toBeCloseTo((1.469 / 4.005) * 6, 5);
  });
});

describe('a kind of year on a real farm', () => {
  const ion = {
    county: 'TR',
    birth_year: data.subsidies.meta.campaign_year - 55,
    start_balance_bani: 3_500_000,
    parcels: [
      { crop_id: 'grau', area_ari: 800, is_arable: true, planted_month: '2026-10' },
      { crop_id: 'porumb', area_ari: 700, is_arable: true },
    ],
    pension_plans: { monthly_bani: 20_000, status: 'active' },
  } as unknown as PlanFarm;
  const options = { month: '2026-11' };
  const plan = buildFarmPlan(ion, data, options);
  const totalOut = (k: 'bad' | 'medium' | 'good') => plan.timelines[k].months.reduce((sum, m) => sum + m.out, 0);
  const totalIn = (k: 'bad' | 'medium' | 'good') => plan.timelines[k].months.reduce((sum, m) => sum + m.in, 0);

  it('the harvest changes what comes in, and costs stay the same', () => {
    expect(totalIn('bad')).toBeLessThan(totalIn('medium'));
    expect(totalIn('medium')).toBeLessThan(totalIn('good'));
    expect(totalOut('bad')).toBe(totalOut('medium'));
    expect(totalOut('good')).toBe(totalOut('medium'));
  });

  it("the plan uses the farm's county", () => {
    const elsewhere = buildFarmPlan({ ...ion, county: 'TM' }, data, options);
    expect(elsewhere.timelines.medium.months.at(-1)!.balanceEnd).not.toBe(plan.timelines.medium.months.at(-1)!.balanceEnd);
  });

  it('a bad harvest shows in the spring after it', () => {
    const after = afterBadHarvest(ion, data, options)!;
    expect(after.harvestMonth).toBe('2027-07');
    expect(after.lowest.key).toBe('2028-06');
    expect(after.lowest.balance).toBeLessThan(0);
    expect(after.missing).toBe(-after.lowest.balance);
    expect(after.salary).toBeLessThan(after.normalSalary);
  });

  it('with no harvest planned there is nothing to show', () => {
    expect(afterBadHarvest({ ...ion, parcels: [] }, data, options)).toBeNull();
  });
});
