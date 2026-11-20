import { describe, expect, it } from 'vitest';
import livestockJson from '../../../../docs/data/livestock.json';
import fuelJson from '../../../../docs/data/fuel-excise.json';
import { apiaFacts } from './apia';
import { FuelExciseSchema } from './fuel';
import { animalFuel, headCount, LivestockFileSchema, livestockProblems, LivestockSchema, uvmMilli } from './livestock';

const file = LivestockFileSchema.parse(livestockJson);
const fuel = FuelExciseSchema.parse(fuelJson);
const herd = { counts: { bovine_over_2y: 10, bovine_under_6m: 5, sheep: 40, laying_hens: 100, bee_families: 20 } };

describe('livestock.json', () => {
  it('points every animal at a diesel group that exists', () => {
    const groups = new Set(fuel.caps_l_per_uvm.map((c) => c.id));
    for (const c of file.categories) if (c.fuel_group) expect(groups.has(c.fuel_group), c.id).toBe(true);
  });
});

describe('the herd', () => {
  it('counts heads without the bees, and UVM in thousandths', () => {
    expect(headCount(file, herd)).toBe(155);
    const u = uvmMilli(file, herd);
    /* 10 × 1 + 5 × 0,4 + 40 × 0,15 + 100 × 0,014 = 19,4 */
    expect(u.total).toBe(19_400);
    expect(u.byCategory.map((c) => c.id)).toEqual(['bovine_over_2y', 'bovine_under_6m', 'sheep', 'laying_hens']);
  });

  it('gives each diesel group its litres: UVM × the norm, bees per family', () => {
    const rows = animalFuel(file, fuel.caps_l_per_uvm, herd);
    const by = new Map(rows.map((r) => [r.group, r]));
    expect(by.get('bovine')).toMatchObject({ amount: 12_000, litresCl: 12 * 5600 });
    expect(by.get('ovine-caprine')).toMatchObject({ amount: 6000, litresCl: 6 * 675 });
    expect(by.get('albine')).toMatchObject({ perFamily: true, amount: 20, litresCl: 20 * 1800 });
    expect(by.has('porcine')).toBe(false);
  });

  it('refuses unknown categories and more dairy cows than cows', () => {
    expect(livestockProblems(file, { counts: { llamas: 1 } })).toEqual(['unknown category llamas']);
    expect(livestockProblems(file, { counts: { bovine_over_2y: 2 }, dairyCows: 3 })).toHaveLength(1);
    expect(LivestockSchema.safeParse({ counts: { sheep: 1.5 } }).success).toBe(false);
  });

  it('decides the animals fact: heads say yes, a saved empty herd says no', () => {
    const base = { landUses: ['TA'], cropSections: [], hasFallow: false, dieselExpenses: 0 };
    expect(apiaFacts({ ...base, heads: 3, answers: { animals: false } }).animals).toBe(true);
    expect(apiaFacts({ ...base, heads: 0 }).animals).toBe(false);
    expect(apiaFacts({ ...base, heads: 0, answers: { animals: true } }).animals).toBe(true);
    expect(apiaFacts({ ...base, heads: null }).animals).toBeNull();
  });
});
