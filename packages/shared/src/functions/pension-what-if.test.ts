import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import type { StoredFarm } from '../farm';
import { computeFarmPlan } from '../cashflow/plan';
import type { ReadContext } from './define';
import { buildFarmPlan } from './plan';
import { whatIfPensionFn } from './registry';
import { whatIfPension } from './whatIf';

const data = loadData();
const month = '2026-11';
const ion = (over: Partial<StoredFarm> = {}): StoredFarm =>
  ({
    county: 'TR',
    birth_year: data.subsidies.meta.campaign_year - 55,
    start_balance_bani: 3_500_000,
    demo_now: '2026-11-15T00:00:00Z',
    parcels: [
      { crop_id: 'grau', area_ari: 800, is_arable: true },
      { crop_id: 'porumb', area_ari: 700, is_arable: true },
    ],
    transactions: [],
    ...over,
  }) as StoredFarm;
const planOf = (farm: StoredFarm) => buildFarmPlan(farm, data, { month });
const started = (bani: number) => ion({ pension_plans: { monthly_bani: bani, status: 'active' } });

describe('whatIfPension', () => {
  const farm = ion();
  const plan = planOf(farm);

  it('takes the pension out of the salary, as in the docs example', () => {
    const w = whatIfPension(plan, farm, data, 20_000);
    expect(w.salaryBefore).toBe(105_000);
    expect(w.salaryAfter).toBe(85_000);
  });

  it('changes nothing with no pension', () => {
    const w = whatIfPension(plan, farm, data, 0);
    expect(w.salaryAfter).toBe(w.salaryBefore);
    expect(w.salaryAfter).toBe(w.paidBefore);
  });

  it('never raises the salary as the pension grows', () => {
    const salaries = [0, 5_000, 20_000, 50_000].map((m) => whatIfPension(plan, farm, data, m).salaryAfter);
    salaries.slice(1).forEach((s, i) => expect(s).toBeLessThanOrEqual(salaries[i]!));
  });

  it('gives the salary the payout would pay once the pension starts', () => {
    const w = whatIfPension(plan, farm, data, 20_000);
    expect(w.salaryAfter).toBe(planOf(started(20_000)).salary.salary);
    expect(w.salaryAfter).toBe(computeFarmPlan(started(20_000), data).salary.salary);
  });

  it('replaces a pension already running, and stopping it gives the money back', () => {
    const running = started(20_000);
    const runningPlan = planOf(running);
    expect(whatIfPension(runningPlan, running, data, 20_000).salaryAfter).toBe(runningPlan.salary.salary);
    const stopped = whatIfPension(runningPlan, running, data, 0);
    expect(stopped.pensionBefore).toBe(20_000);
    expect(stopped.salaryAfter).toBe(plan.salary.salary);
  });

  it('shows a fixed salary as paid now, and the salary it is fixed at after the change', () => {
    const fixed = ion({ salary_bani: 70_000 });
    const w = whatIfPension(planOf(fixed), fixed, data, 0);
    expect(w.paidBefore).toBe(70_000);
    expect(w.salaryAfter).toBe(105_000);
  });

  it('says when the amount is under the minimum of the fund', () => {
    expect(whatIfPension(plan, farm, data, 3_000).underMinimum).toBe(true);
    expect(whatIfPension(plan, farm, data, 3_000, 'esential').underMinimum).toBe(false);
    expect(whatIfPension(plan, farm, data, 0).underMinimum).toBe(false);
    expect(whatIfPension(plan, ion({ pension_fund_id: 'esential' }), data, 3_000).minimum).toBe(3_000);
  });
});

describe('what_if_pension', () => {
  const farm = ion();
  const ctx: ReadContext = { farm, plan: planOf(farm), data, today: '2026-11-15' };

  it('takes whole lei and answers in bani', () => {
    expect(whatIfPensionFn.execute({ monthlyLei: 200 }, ctx).data!.salaryAfter).toBe(85_000);
  });

  it('refuses a float, a negative amount and an unknown fund', () => {
    for (const bad of [{ monthlyLei: 12.5 }, { monthlyLei: -1 }, { monthlyLei: 100, fundId: 'nu-exista' }]) {
      expect(() => whatIfPensionFn.execute(bad, ctx)).toThrow();
    }
  });

  it('flags a fund minimum that is not confirmed', () => {
    const shaky = data.pensionFunds.funds.find((f) => f.status === 'DE-VERIFICAT')!;
    expect(whatIfPensionFn.execute({ monthlyLei: 100, fundId: shaky.id }, ctx).unverified).toContain('pension_fund_minimum');
    expect(whatIfPensionFn.execute({ monthlyLei: 100, fundId: 'esential' }, ctx).unverified).not.toContain('pension_fund_minimum');
  });

  it('saves nothing and is open to the AI', () => {
    expect(whatIfPensionFn.access).toBe('read');
  });
});
