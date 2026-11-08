import { describe, expect, it } from 'vitest';
import demoIon from '../../docs/data/demo-ion.json';
import { demoAccount } from './demo-account';

const plan = {
  proposal: { salary: 300_000, spring_inputs: 2_000_000, debts: 0, pension: 50_000 },
  monthlySalary: 150_000,
  smoothing: { pensionMonthly: 25_000 },
};

describe('demoAccount', () => {
  it('lists the next salaries on the 1st of each month, as scheduled', () => {
    expect(demoAccount(plan, '2026-11-08', 3).payouts).toEqual([
      { scheduled_for: '2026-12-01', amount_bani: 150_000, status: 'scheduled' },
      { scheduled_for: '2027-01-01', amount_bani: 150_000, status: 'scheduled' },
      { scheduled_for: '2027-02-01', amount_bani: 150_000, status: 'scheduled' },
    ]);
  });

  it('starts after today, even on a payday', () => {
    expect(demoAccount(plan, '2026-12-01', 1).payouts.map((p) => p.scheduled_for)).toEqual(['2027-01-01']);
  });

  it('shows the proposed split as the pots, and the plan’s pension', () => {
    const account = demoAccount(plan, '2026-11-08', 3);
    expect(account.envelopes).toBe(plan.proposal);
    expect(account.pensionMonthly).toBe(25_000);
  });

  it('lists no salary when the plan can’t pay one', () => {
    expect(demoAccount({ ...plan, monthlySalary: 0 }, '2026-11-08', 3).payouts).toEqual([]);
  });

  it('refuses a count that isn’t a whole number', () => {
    expect(() => demoAccount(plan, '2026-11-08', 1.5)).toThrow();
    expect(() => demoAccount(plan, '2026-11-08', -1)).toThrow();
  });

  it('reads its count from docs/data', () => {
    expect(Number.isInteger(demoIon.demo_account.payouts_shown.value)).toBe(true);
  });
});
