import { describe, expect, it } from 'vitest';
import { applyOverrides, loadData, type Override } from '../data';
import type { PlanFarm } from './farm-plan';
import { diffPlans, planSummary } from './plan-diff';
import { computeFarmPlan } from './plan';

const data = loadData();
const change = (path: string, value: Override['value']): Override => ({ path, value, reason: 'test' });
const ion: PlanFarm = {
  county: 'TR',
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  demo_now: '2026-11-15T00:00:00Z',
  salary_bani: null,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
  transactions: [],
};

describe('planSummary', () => {
  it('shows what the app shows', () => {
    const plan = computeFarmPlan(ion, data);
    const s = planSummary(ion, data);
    expect(s.monthlySalary).toBe(plan.monthlySalary);
    expect(s.lowest).toEqual(plan.timelines.medium.lowest);
    expect(s.subsidy).toEqual(plan.subsidies.totals.lei);
    expect(s.pensionAtTarget).toBeGreaterThan(0);
  });
});

describe('diffPlans', () => {
  it('finds nothing when the data is the same', () => {
    expect(diffPlans(ion, data, data).changed).toEqual([]);
  });

  it('a higher wheat price shows at the end of the plan, after the July sale', () => {
    // Ion's lowest point and salary limit come before the harvest, so only the end balance moves.
    const d = diffPlans(ion, data, applyOverrides([change('crops.crops[id=grau].price_lei_per_kg.mean', 1.15)]));
    expect(d.changed).toEqual(['endBalance']);
    expect(d.after.endBalance).toBeGreaterThan(d.before.endBalance);
  });

  it('a higher wheat cost lowers the salary and the lowest point', () => {
    const d = diffPlans(ion, data, applyOverrides([change('crops.crops[id=grau].cost_lei_per_ha.mean', 4800)]));
    expect(d.changed).toEqual(expect.arrayContaining(['monthlySalary', 'safeSalary', 'lowest', 'endBalance']));
    expect(d.changed).not.toContain('subsidy');
    expect(d.after.monthlySalary).toBeLessThan(d.before.monthlySalary);
  });

  it('a higher PD-01 sum raises the subsidy', () => {
    const d = diffPlans(ion, data, applyOverrides([change('subsidies.schemes[code=PD-01].amount_eur', 120)]));
    expect(d.changed).toContain('subsidy');
    expect(d.after.subsidy.probable).toBeGreaterThan(d.before.subsidy.probable);
  });
});
