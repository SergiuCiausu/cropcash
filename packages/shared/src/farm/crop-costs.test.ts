import { describe, expect, it } from 'vitest';
import { buildFarmPlan } from '../cashflow/farm-plan';
import { loadData } from '../data';
import {
  SetCropCostInputSchema,
  areaShare,
  cropCostsPerHa,
  finishedCost,
  harvestCosts,
  latestFinishedCost,
  planCostLei,
  storedHarvestCosts,
  withCropCost,
} from './crop-costs';
import type { HarvestsInput } from './harvests';
import type { StoredFarm } from './index';

const data = loadData();
const crops = data.crops.crops;
const parcels = [
  { cropId: 'grau', areaHa: 10 },
  { cropId: 'porumb', areaHa: 8 },
  { cropId: 'floarea-soarelui', areaHa: 6 },
];
const wheat = <T extends { cropId: string }>(rows: T[]) => rows.find((c) => c.cropId === 'grau')!;

describe('what a crop cost per hectare', () => {
  it('adds what was noted for the crop and its part of whole-farm costs by hectares', () => {
    const { crops: costs } = cropCostsPerHa(parcels, [
      { cropId: 'grau', category: 'seeds', amountBani: -800_000 },
      { cropId: null, category: 'diesel', amountBani: -240_000 },
    ]);
    const c = wheat(costs);
    expect(c.direct).toBe(800_000);
    expect(c.shared).toBe(100_000); // 10 of 24 ha
    expect(c.total).toBe(900_000);
    expect(c.perHa).toBe(90_000); // 900 lei
    expect(c.categories.map((k) => [k.category, k.direct, k.shared, k.perHa])).toEqual([
      ['seeds', 800_000, 0, 80_000],
      ['diesel', 0, 100_000, 10_000],
    ]);
  });

  it('never loses a ban when a shared cost is split', () => {
    const { crops: costs } = cropCostsPerHa(parcels, [{ category: 'diesel', amountBani: -100 }]);
    expect(costs.reduce((s, c) => s + c.shared, 0)).toBe(100);
    expect(areaShare(100, parcels, 'absent')).toBe(0);
  });

  it('gives the same result whatever order the rows come in', () => {
    const records = [
      { cropId: 'grau', category: 'seeds', amountBani: -123_457 },
      { cropId: null, category: 'diesel', amountBani: -100_001 },
      { cropId: null, category: 'rent', amountBani: -77_777 },
      { cropId: 'porumb', category: 'fertilizer', amountBani: -55_555 },
    ];
    expect(cropCostsPerHa([...parcels].reverse(), [...records].reverse())).toEqual(cropCostsPerHa(parcels, records));
  });

  it('keeps rent, repairs and other out of the plan cost, because they would count twice', () => {
    const c = wheat(
      cropCostsPerHa(parcels, [
        { cropId: 'grau', category: 'fertilizer', amountBani: -1_000_000 },
        { cropId: 'grau', category: 'rent', amountBani: -500_000 },
        { cropId: 'grau', category: 'repairs', amountBani: -100_000 },
        { cropId: 'grau', category: 'other', amountBani: -100_000 },
      ]).crops,
    );
    expect(c.perHa).toBe(170_000);
    expect(c.planPerHa).toBe(100_000);
    expect(planCostLei(c)).toBe(1000);
  });

  it('skips a row with no category, and counts a crop outside the harvest apart', () => {
    const { crops: costs, elsewhere } = cropCostsPerHa(parcels, [
      { cropId: 'grau', category: null, amountBani: -999_999 },
      { cropId: 'sfecla', category: 'seeds', amountBani: -5_000 },
    ]);
    expect(wheat(costs).total).toBe(0);
    expect(elsewhere).toBe(5_000);
    expect(planCostLei(wheat(costs))).toBeNull();
  });
});

describe('when a season counts as finished', () => {
  const harvest = (status: 'open' | 'closed') => ({ year: 2027, status, parcels: [{ cropId: 'grau', areaHa: 10 }], records: [] });

  it('is over once closed, or once its harvest month has passed', () => {
    expect(harvestCosts(harvest('open'), crops, '2027-07-20').crops[0]!.seasonDone).toBe(false);
    expect(harvestCosts(harvest('open'), crops, '2027-08-01').crops[0]!.seasonDone).toBe(true);
    expect(harvestCosts(harvest('closed'), crops, '2026-12-01').crops[0]!.seasonDone).toBe(true);
  });
});

describe('a stored farm', () => {
  const farm = (transactions: object[], harvests: HarvestsInput | null = null) =>
    ({ parcels: [{ crop_id: 'grau', area_ari: 1000, is_arable: true }], transactions, harvests }) as unknown as Pick<StoredFarm, 'parcels' | 'transactions' | 'harvests'>;
  const expense = (occurred_at: string, more: object = {}) => ({ kind: 'expense', category: 'seeds', crop_id: 'grau', amount_bani: -400_000, occurred_at, ...more });
  const of = (f: ReturnType<typeof farm>, year: number, today = '2026-11-15') => storedHarvestCosts(f, data, today).find((h) => h.year === year);
  const years = [
    { year: 2026, status: 'closed' as const, openingBani: 0, parcels: [{ cropId: 'grau', areaHa: 10 }] },
    { year: 2027, status: 'open' as const, openingBani: 0, parcels: [{ cropId: 'grau', areaHa: 10 }] },
  ];

  it('files wheat sown in October under the harvest cut next July', () => {
    expect(wheat(of(farm([expense('2026-10-10T12:00:00Z')]), 2027)!.crops).total).toBe(400_000);
  });

  it('lets the year the farmer chose win', () => {
    const f = farm([expense('2026-10-10T12:00:00Z', { harvest_year: 2026 })], { years, gathered: [] });
    expect(wheat(of(f, 2026)!.crops).total).toBe(400_000);
    expect(wheat(of(f, 2027)!.crops).total).toBe(0);
  });

  it('counts only expenses', () => {
    const f = farm([
      { kind: 'sale', crop_id: 'grau', amount_bani: 900_000, occurred_at: '2026-11-02T12:00:00Z', category: null },
      { kind: 'salary', amount_bani: -100_000, occurred_at: '2026-11-03T12:00:00Z', category: null },
      expense('2026-11-04T12:00:00Z', { category: null }), // what the demo clock pays: the plan's own average
    ]);
    expect(wheat(of(f, 2027)!.crops).total).toBe(0);
  });

  it('offers the latest finished harvest, and only a finished one', () => {
    const f = farm(
      [
        expense('2025-10-10T12:00:00Z', { harvest_year: 2026 }), // 400 lei/ha
        expense('2026-11-10T12:00:00Z', { harvest_year: 2027, amount_bani: -9_000_000 }), // season still running
      ],
      { years, gathered: [] },
    );
    const all = storedHarvestCosts(f, data, '2026-11-15');
    expect(latestFinishedCost(all, 'grau')).toEqual({ year: 2026, leiPerHa: 400 });
    expect(finishedCost(all, 'grau', 2027)).toBeNull();
    expect(latestFinishedCost(all, 'porumb')).toBeNull();
  });
});

describe('the cost saved on the document', () => {
  const doc: HarvestsInput = {
    years: [{ year: 2027, status: 'open', openingBani: 0, parcels: [{ cropId: 'grau', areaHa: 1 }] }],
    gathered: [],
    expected: [
      { cropId: 'grau', yieldTPerHa: 6, priceLeiPerKg: null },
      { cropId: 'porumb', yieldTPerHa: null, priceLeiPerKg: null, costLeiPerHa: 4000 },
    ],
  };

  it('changes one crop and keeps its yield and the other crops', () => {
    const next = withCropCost(doc, 'grau', 3800);
    expect(next.expected).toContainEqual({ cropId: 'grau', yieldTPerHa: 6, priceLeiPerKg: null, costLeiPerHa: 3800 });
    expect(next.expected).toContainEqual(doc.expected![1]);
    expect(next.years).toBe(doc.years);
  });

  it('goes back to the average, dropping a row that holds nothing else', () => {
    expect(withCropCost(doc, 'grau', null).expected).toContainEqual({ cropId: 'grau', yieldTPerHa: 6, priceLeiPerKg: null });
    expect(withCropCost(doc, 'porumb', null).expected!.map((r) => r.cropId)).toEqual(['grau']);
  });

  it('takes a figure or a harvest, never both or neither', () => {
    const ok = (v: object) => SetCropCostInputSchema.safeParse({ cropId: 'grau', ...v }).success;
    expect(ok({ costLeiPerHa: 3800 })).toBe(true);
    expect(ok({ costLeiPerHa: null })).toBe(true);
    expect(ok({ fromHarvestYear: 2026 })).toBe(true);
    expect(ok({})).toBe(false);
    expect(ok({ costLeiPerHa: 3800, fromHarvestYear: 2026 })).toBe(false);
    expect(ok({ costLeiPerHa: 0 })).toBe(false);
    expect(ok({ costLeiPerHa: 12.5 })).toBe(false);
  });
});

describe("the farmer's own cost in the plan", () => {
  const stored = (costLeiPerHa?: number) =>
    ({
      county: 'TR',
      birth_year: 1970,
      start_balance_bani: 3_500_000,
      parcels: [{ crop_id: 'grau', area_ari: 1000, is_arable: true }],
      harvests: {
        years: [{ year: 2027, status: 'open', openingBani: 0, parcels: [{ cropId: 'grau', areaHa: 10 }] }],
        gathered: [],
        expected: costLeiPerHa ? [{ cropId: 'grau', yieldTPerHa: null, priceLeiPerKg: null, costLeiPerHa }] : [],
      },
    }) as unknown as StoredFarm;
  const plan = (cost?: number) => buildFarmPlan(stored(cost), data, { month: '2026-11' });
  const costs = (cost?: number) => plan(cost).timelines.medium.months.flatMap((m) => m.entries).filter((e) => e.kind === 'input_cost').reduce((s, e) => s + e.value, 0);

  it('uses the average without one', () => {
    expect(plan().economics[0]!.cost).toBe(4_250_000); // 10 ha × 4.250 lei
  });

  it('reaches the table, the break-even price and the monthly costs', () => {
    const before = plan().economics[0]!;
    const after = plan(3000).economics[0]!;
    expect(after.cost).toBe(3_000_000);
    expect(after.costPerHa).toBe(300_000);
    expect(after.breakEvenPerKg).toBeLessThan(before.breakEvenPerKg);
    expect(costs(3000)).toBe(Math.round((costs() * 3000) / 4250));
  });
});
