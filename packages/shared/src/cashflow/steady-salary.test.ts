import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import type { MovedMoney } from '../farm';
import { computeFarmPlan, type PlanFarm } from './plan';
import { salaryToPay } from './smoothing';

const data = loadData();
const ion: PlanFarm = {
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
  demo_now: '2026-11-15T10:00:00Z',
};
const salary = (date: string, amount: number): MovedMoney => ({
  amount_bani: -amount,
  kind: 'salary',
  occurred_at: `${date}T08:00:00Z`,
});
const safeSalary = (transactions: MovedMoney[]) => computeFarmPlan({ ...ion, transactions }, data).salary.salary;

describe('salaryToPay', () => {
  it('starts from the safe salary', () => {
    expect(salaryToPay(95_000, null, false)).toBe(95_000);
  });

  it('holds between incomes, even if more looks safe', () => {
    expect(salaryToPay(110_000, 95_000, false)).toBe(95_000);
  });

  it('is recalculated when income arrives', () => {
    expect(salaryToPay(110_000, 95_000, true)).toBe(110_000);
    expect(salaryToPay(80_000, 95_000, true)).toBe(80_000);
  });

  it('drops at once if the money would otherwise run out', () => {
    expect(salaryToPay(60_000, 95_000, false)).toBe(60_000);
  });
});

describe('the salary in the plan', () => {
  const low = 1_000;

  it('keeps last month’s salary when no income came', () => {
    const transactions = [salary('2026-11-01', low)];
    expect(safeSalary(transactions)).toBeGreaterThan(low);
    expect(computeFarmPlan({ ...ion, transactions }, data).monthlySalary).toBe(low);
  });

  it('is recalculated after income', () => {
    const transactions: MovedMoney[] = [
      salary('2026-11-01', low),
      { amount_bani: 1_264_932, kind: 'apia_advance', occurred_at: '2026-11-05T09:00:00Z' },
    ];
    expect(computeFarmPlan({ ...ion, transactions }, data).monthlySalary).toBe(safeSalary(transactions));
  });

  it('income before the last salary is already counted in it', () => {
    const transactions: MovedMoney[] = [
      { amount_bani: 1_264_932, kind: 'apia_advance', occurred_at: '2026-10-20T09:00:00Z' },
      salary('2026-11-01', low),
    ];
    expect(computeFarmPlan({ ...ion, transactions }, data).monthlySalary).toBe(low);
  });

  it('never pays more than is safe', () => {
    const transactions = [salary('2026-11-01', 99_999_900)];
    expect(computeFarmPlan({ ...ion, transactions }, data).monthlySalary).toBe(safeSalary(transactions));
  });

  it('leaves an accepted salary to its own rule', () => {
    const fixed = 2_000;
    const plan = computeFarmPlan({ ...ion, salary_bani: fixed, transactions: [salary('2026-11-01', low)] }, data);
    expect(plan.monthlySalary).toBe(fixed);
  });

  it('starts from the safe salary before anything was paid', () => {
    expect(computeFarmPlan(ion, data).monthlySalary).toBe(safeSalary([]));
  });
});
