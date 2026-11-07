import { describe, expect, it } from 'vitest';
import { buildFarmPlan, farmData } from '../cashflow/farm-plan';
import { computeFarmPlan } from '../cashflow/plan';
import { CropSchema, loadData } from '../data';
import { HarvestsInputSchema, OwnCropSchema, validateHarvests, type OwnCrop } from './harvests';
import { ownCropToCrop, withOwnCrops } from './own-crops';

const data = loadData();
const orz: OwnCrop = {
  id: 'own-orz-1',
  name: 'Orz',
  yieldTPerHa: 5,
  badYieldTPerHa: 3.5,
  priceLeiPerKg: 0.9,
  costs: { sowingLeiPerHa: 1500, careLeiPerHa: 900, harvestLeiPerHa: 600 },
  sowingMonth: 10,
  harvestMonth: 7,
};
const year = { year: 2027, status: 'open' as const, openingBani: 0, parcels: [{ cropId: 'own-orz-1', areaHa: 4 }] };

describe('a crop of the farmer', () => {
  const crop = ownCropToCrop(orz);

  it('has the shape of a docs/data crop', () => {
    expect(CropSchema.safeParse(crop).success).toBe(true);
    expect(crop).toMatchObject({ name_ro: 'Orz', sale_month_default: 7, status: 'de-la-fermier' });
  });

  it('spends exactly what the farmer typed, over the months it grows', () => {
    const shares = crop.expense_months.reduce((sum, m) => sum + m.share_pct, 0);
    expect(shares).toBeCloseTo(100, 9);
    // October sowing, July harvest: care from November to June, eight months, across the new year.
    expect(crop.expense_months.map((m) => m.month)).toEqual([10, 11, 12, 1, 2, 3, 4, 5, 6, 7]);
    expect(crop.cost_lei_per_ha.mean).toBe(3000);
  });

  it('puts care costs at sowing when it is harvested the month after', () => {
    const quick = ownCropToCrop({ ...orz, sowingMonth: 4, harvestMonth: 5 });
    expect(quick.expense_months).toMatchObject([{ month: 4, what_ro: 'sămânță și semănat' }, { month: 5 }]);
    expect(quick.expense_months[0]!.share_pct).toBeCloseTo(80, 9);
  });

  it('has no costs when the farmer typed none', () => {
    const free = ownCropToCrop({ ...orz, costs: { sowingLeiPerHa: 0, careLeiPerHa: 0, harvestLeiPerHa: 0 } });
    expect(free.expense_months).toEqual([]);
  });

  it('makes a bad year the normal one when the farmer left it blank', () => {
    expect(ownCropToCrop({ ...orz, badYieldTPerHa: null }).yield_t_per_ha).toEqual({ min: 5, mean: 5, max: 5 });
    expect(crop.yield_t_per_ha).toEqual({ min: 3.5, mean: 5, max: 5 });
  });

  it('refuses a bad year above the normal one, and a harvest in the sowing month', () => {
    expect(OwnCropSchema.safeParse({ ...orz, badYieldTPerHa: 6 }).success).toBe(false);
    expect(OwnCropSchema.safeParse({ ...orz, harvestMonth: 10 }).success).toBe(false);
    expect(OwnCropSchema.safeParse({ ...orz, id: 'grau' }).success).toBe(false);
  });
});

describe('own crops in the data', () => {
  it('are added once, and never replace a docs/data crop', () => {
    const once = withOwnCrops(data, [orz]);
    expect(withOwnCrops(once, [orz])).toBe(once);
    expect(once.crops.crops).toHaveLength(data.crops.crops.length + 1);
    expect(withOwnCrops(data, [])).toBe(data);
  });

  it('are known to the harvests check, which refuses one described twice', () => {
    const doc = { years: [year], gathered: [], ownCrops: [orz] };
    expect(HarvestsInputSchema.safeParse(doc).success).toBe(true);
    expect(validateHarvests(doc, data)).toEqual([]);
    expect(validateHarvests({ years: [year], gathered: [] }, data)).toContain('unknown_crop');
    expect(validateHarvests({ ...doc, ownCrops: [orz, orz] }, data)).toContain('duplicate_crop');
  });
});

describe('a farm with its own crop', () => {
  const farm = {
    birth_year: 1971,
    start_balance_bani: 1_000_000,
    parcels: [
      { crop_id: 'grau', area_ari: 800, is_arable: true },
      { crop_id: 'own-orz-1', area_ari: 400, is_arable: true },
    ],
    harvests: { years: [year], gathered: [], ownCrops: [orz] },
  };
  const plan = buildFarmPlan(farm, data, { month: '2026-11' });
  const entries = plan.timelines.medium.months.flatMap((m) => m.entries).filter((e) => e.cropId === 'own-orz-1');

  it('sells and spends on the plan', () => {
    expect(entries.find((e) => e.kind === 'crop_sale')).toMatchObject({ value: 4 * 5 * 900 * 100, date: '2027-07-15' });
    expect(entries.filter((e) => e.kind === 'input_cost').length).toBeGreaterThan(0);
  });

  it('loses money in a bad year, by the bad yield the farmer typed', () => {
    const bad = plan.timelines.bad.months.flatMap((m) => m.entries).find((e) => e.cropId === 'own-orz-1' && e.kind === 'crop_sale');
    expect(bad!.value).toBe(4 * 3.5 * 900 * 100);
  });

  it('is paid the same as the screen shows', () => {
    expect(computeFarmPlan(farm, data).salary).toEqual(plan.salary);
  });

  it('is in the merged data, and the data without it is untouched', () => {
    expect(farmData(farm, data).crops.crops.some((c) => c.id === 'own-orz-1')).toBe(true);
    expect(data.crops.crops.some((c) => c.id === 'own-orz-1')).toBe(false);
  });
});
