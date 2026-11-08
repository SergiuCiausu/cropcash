import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { computeSubsidies } from '../subsidies';
import type { ReadContext } from './define';
import { salaryBreakdown, salaryMonths } from './explain';
import { buildFarmPlan } from './plan';
import {
  explainSalaryFn,
  explainSubsidyFn,
  simulatePensionFn,
  suggestPensionFn,
  whatIfCreditFn,
  whatIfSubsidyFn,
} from './registry';

const data = loadData();
const year = data.subsidies.meta.campaign_year;
const farm = {
  birth_year: year - 55,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
};
const plan = buildFarmPlan(farm, data, { month: '2026-11' });
const ctx: ReadContext = { farm, plan, data, today: '2026-11-07' };

describe('explain_salary', () => {
  const e = explainSalaryFn.execute({}, ctx).data!;

  it('names the month that limits the salary', () => {
    expect(e.salary).toBe(105_000);
    expect(e.limitingMonth).toBe(plan.salary.bindingMonth);
    expect(e.reason).not.toBe('money_runs_out');
  });

  it('adds up: the salary fits the limiting month and one rounding step more does not', () => {
    expect(e.salary * e.monthsUntilLimit).toBeLessThanOrEqual(e.availableByThen);
    expect((e.salary + e.roundedDownTo) * e.monthsUntilLimit).toBeGreaterThan(e.availableByThen);
  });

  it('says when money runs out even with no salary', () => {
    const poor = { ...farm, start_balance_bani: 0 };
    const c = { ...ctx, farm: poor, plan: buildFarmPlan(poor, data, { month: '2026-11' }) };
    const r = explainSalaryFn.execute({ scenario: 'bad' }, c).data!;
    expect(r).toMatchObject({ reason: 'money_runs_out', salary: 0 });
    expect(r.availableByThen).toBeLessThan(0);
  });
});

describe('salary breakdown', () => {
  const scenarios = ['bad', 'medium', 'good'] as const;
  const credit = (id: string, kind: string, direction: 'in' | 'out', month: string) => ({
    id,
    group_id: 'c',
    kind,
    direction,
    amount_probable_bani: 1_000_000,
    window_start: `${month}-01`,
    status: 'planned',
  });
  const farms = {
    plain: farm,
    pension: { ...farm, pension_plans: { monthly_bani: 20_000, status: 'active' } },
    'one crop': { ...farm, parcels: [{ crop_id: 'porumb', area_ari: 1500, is_arable: true }] },
    'no money': { ...farm, start_balance_bani: 0 },
    credit: { ...farm, expected_payments: [credit('in', 'credit', 'in', '2027-04'), credit('out', 'loan_repayment', 'out', '2027-07')] },
  };
  const total = (lines: { amount: number }[]) => lines.reduce((sum, l) => sum + l.amount, 0);

  describe.each(Object.entries(farms))('%s', (_, f) => {
    const p = buildFarmPlan(f, data, { month: '2026-11' });

    it.each(scenarios)('adds up to the ban in a %s year', (scenario) => {
      const b = salaryBreakdown(p, scenario, data);
      expect(b.opening + total(b.income) - total(b.costs) - b.pension).toBe(b.available);
    });

    it.each(scenarios)('agrees with explain_salary in a %s year', (scenario) => {
      const b = salaryBreakdown(p, scenario, data);
      const e = explainSalaryFn.execute({ scenario }, { ...ctx, farm: f, plan: p }).data!;
      expect(b.available).toBe(e.availableByThen);
      expect(b.months).toBe(e.monthsUntilLimit);
    });

    it.each(scenarios)('leaves in the limiting month what the breakdown says, in a %s year', (scenario) => {
      const b = salaryBreakdown(p, scenario, data);
      const { months, salary } = salaryMonths(p, scenario, data);
      expect(months.find((m) => m.key === b.limitingMonth)!.left).toBe(b.available - b.months * salary);
    });
  });

  const ion = buildFarmPlan(farms.pension, data, { month: '2026-11' });

  it('names the income that ends the squeeze', () => {
    const b = salaryBreakdown(ion, 'medium', data);
    expect(b.limitingMonth).toBe('2027-06');
    expect(b.nextIncome).toMatchObject({ month: '2027-07', amount: 4_200_000 });
    expect(b.nextIncome!.lines).toMatchObject([{ kind: 'crop_sale', cropId: 'grau' }]);
  });

  it('keeps each crop on one line, across the months of its work', () => {
    const { costs } = salaryBreakdown(ion, 'medium', data);
    expect(costs.map((c) => c.cropId).sort()).toEqual(['grau', 'porumb']);
    expect(costs.find((c) => c.cropId === 'grau')).toMatchObject({ amount: 1_360_000, firstMonth: '2027-03', lastMonth: '2027-04' });
  });

  it('says the money runs out, and what is left with nothing set aside', () => {
    const empty = buildFarmPlan({ ...farm, start_balance_bani: 0, pension_plans: { monthly_bani: 20_000, status: 'active' } }, data, { month: '2026-11' });
    const b = salaryBreakdown(empty, 'bad', data);
    expect(b).toMatchObject({ deficit: true, salary: 0, exact: 0 });
    expect(b.available).toBeLessThan(b.withoutSetAsides);
  });

  it('has no next income when the plan ends on the limiting month', () => {
    const rich = buildFarmPlan({ ...farm, start_balance_bani: 50_000_000 }, data, { month: '2026-11' });
    expect(salaryBreakdown(rich, 'medium', data).nextIncome).toBeNull();
  });

  it('lets a test salary replace the plan one', () => {
    expect(salaryMonths(ion, 'bad', data, 250_000).salary).toBe(250_000);
  });
});

describe('explain_subsidy', () => {
  it('shows the sum for a scheme that counts', () => {
    const r = explainSubsidyFn.execute({ code: 'PD-01' }, ctx);
    expect(r.data).toMatchObject({ counted: true, units: 1500, amountEurPerUnit: 101.03, fund: 'FEGA' });
    expect(r.sources).toHaveLength(1);
  });

  it('keeps an unknown rate null and says why it is left out', () => {
    // PD-28 needs unproductive land, which saved farms don't record, so the farm here
    // is one it accepts: eligible, but with no 2026 rate to pay it at.
    const subsidies = computeSubsidies({ age: 55, unproductiveHa: 1, parcels: [{ cropId: 'grau', areaHa: 8 }] }, data);
    const c = { ...ctx, plan: { ...plan, subsidies } };
    expect(explainSubsidyFn.execute({ code: 'PD-28' }, c).data).toMatchObject({
      counted: false,
      reason: 'amount_unknown',
      amountEurPerUnit: null,
    });
    expect(explainSubsidyFn.execute({ code: 'PD-28' }, ctx).data).toMatchObject({ reason: 'not_eligible' });
  });

  it('gives the failed conditions when the farm does not qualify', () => {
    const small = { ...farm, parcels: [{ crop_id: 'grau', area_ari: 500, is_arable: true }] };
    const c = { ...ctx, farm: small, plan: buildFarmPlan(small, data, { month: '2026-11' }) };
    const r = explainSubsidyFn.execute({ code: 'PD-04' }, c).data;
    expect(r).toMatchObject({ counted: false, reason: 'not_eligible' });
    expect(r && !r.counted && r.failed.length).toBeGreaterThan(0);
  });

  it('separates schemes outside the app, and unknown codes', () => {
    expect(explainSubsidyFn.execute({ code: 'CPL-VACI-LAPTE' }, ctx).data).toMatchObject({ reason: 'not_in_app' });
    expect(explainSubsidyFn.execute({ code: 'NOPE' }, ctx).data).toBeNull();
  });
});

describe('what_if_subsidy', () => {
  it('shows nothing changing for the same farm', () => {
    const same = [
      { cropId: 'grau', areaHa: 8 },
      { cropId: 'porumb', areaHa: 7 },
    ];
    const r = whatIfSubsidyFn.execute({ parcels: same }, ctx).data!;
    expect(r).toMatchObject({ difference: 0, gained: [], lost: [] });
  });

  it('finds the cliff when the farm drops to 10 ha', () => {
    const r = whatIfSubsidyFn.execute({ parcels: [{ cropId: 'grau', areaHa: 5 }, { cropId: 'porumb', areaHa: 5 }] }, ctx).data!;
    expect(r.lost).toContain('PD-04');
    expect(r.difference).toBeLessThan(0);
  });

  it('does not change the saved plan', () => {
    const before = JSON.stringify(plan);
    whatIfSubsidyFn.execute({ parcels: [{ cropId: 'grau', areaHa: 1 }] }, ctx);
    expect(JSON.stringify(plan)).toBe(before);
  });

  it('returns null for an unknown crop and refuses a bad area', () => {
    expect(whatIfSubsidyFn.execute({ parcels: [{ cropId: 'nope', areaHa: 5 }] }, ctx).data).toBeNull();
    expect(() => whatIfSubsidyFn.execute({ parcels: [{ cropId: 'grau', areaHa: -1 }] }, ctx)).toThrow();
  });
});

describe('what_if_credit', () => {
  const april = { amountLei: 15_100, takeMonth: '2027-04', repayMonth: '2027-12' };

  it('matches the suggested credit: 2.950 lei with 15.100 lei in April', () => {
    const r = whatIfCreditFn.execute(april, ctx).data!;
    expect(r.salaryBefore).toBe(105_000);
    expect(r.salaryAfter).toBe(295_000);
    expect(r).toMatchObject({ withinLimit: true, inTime: true, availableFrom: '2027-03' });
  });

  it('flags a credit over the 90% limit', () => {
    expect(whatIfCreditFn.execute({ ...april, amountLei: 16_000 }, ctx).data!.withinLimit).toBe(false);
  });

  it('flags a credit before the APIA certificate exists', () => {
    expect(whatIfCreditFn.execute({ ...april, takeMonth: '2027-01' }, ctx).data!.inTime).toBe(false);
  });

  it('refuses a repayment before the credit', () => {
    expect(() => whatIfCreditFn.execute({ ...april, repayMonth: '2027-02' }, ctx)).toThrow();
  });
});

describe('simulate_pension', () => {
  it('gives the docs example at 4%, with the range around it', () => {
    const r = simulatePensionFn.execute({ monthly: 20_000 }, ctx).data!;
    expect(r.results.map((x) => x.returnPct)).toEqual([2, 4, 6]);
    const probable = r.results[1]!;
    expect(r).toMatchObject({ months: 120, paidIn: 2_400_000, targetAge: 65, illustrative: true });
    expect(probable.total / 100).toBeCloseTo(29449.96, 0);
    expect(r.results[0]!.total).toBeLessThan(probable.total);
    expect(r.results[2]!.total).toBeGreaterThan(probable.total);
  });

  it('takes one chosen return', () => {
    const r = simulatePensionFn.execute({ monthly: 20_000, returnPct: 3 }, ctx).data!;
    expect(r.results.map((x) => x.returnPct)).toEqual([3]);
  });

  it('returns null from 65 on', () => {
    const old = { ...farm, birth_year: year - 65 };
    expect(simulatePensionFn.execute({ monthly: 20_000 }, { ...ctx, farm: old }).data).toBeNull();
  });

  it('refuses a fractional or zero amount', () => {
    expect(() => simulatePensionFn.execute({ monthly: 10.5 }, ctx)).toThrow();
    expect(() => simulatePensionFn.execute({ monthly: 0 }, ctx)).toThrow();
  });
});

describe('suggest_pension', () => {
  it('uses the current salary and says what it was based on', () => {
    expect(suggestPensionFn.execute({}, ctx).data).toEqual({
      monthly: 5_000,
      salary: 105_000,
      maxPctOfSalary: 5,
      aboveShare: false,
      minimum: 5_000,
      minimumVerified: true,
      fundId: null,
      fundName: null,
    });
  });
});
