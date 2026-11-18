import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import type { StoredFarm } from '../farm';
import { buildFarmPlan } from './plan';
import { findRead } from './registry';

const data = loadData();
const farm = {
  id: 'farm-1',
  name: 'Ion',
  county: 'TR',
  birth_year: data.subsidies.meta.campaign_year - 55,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
} as StoredFarm;
const today = '2026-11-07';
const plan = buildFarmPlan(farm, data, { month: '2026-11' });
const ctx = { farm, plan, data, today };
const check = (input: unknown) => findRead('check_purchase')!.execute(input, ctx).data as {
  salaryBefore: number;
  salaryAfter: number;
  month: string;
  lowestBefore: { balance: number };
  lowestAfter: { balance: number };
} | null;

describe('check_purchase', () => {
  it('lowers the lowest month by the price and never raises the salary', () => {
    const out = check({ amount: 200_000 })!;
    expect(out.month).toBe(plan.timelines.medium.months[0]!.key);
    expect(out.salaryAfter).toBeLessThanOrEqual(out.salaryBefore);
    expect(out.lowestAfter.balance).toBe(out.lowestBefore.balance - 200_000);
  });

  it('changes nothing in the saved farm', () => {
    check({ amount: 5_000_000 });
    expect(farm).not.toHaveProperty('expected_payments');
  });

  it('is null for a month outside the plan', () => {
    expect(check({ amount: 100_000, month: '2030-01' })).toBeNull();
  });

  it('refuses amounts that are not whole bani', () => {
    expect(() => check({ amount: 12.5 })).toThrow();
  });
});
