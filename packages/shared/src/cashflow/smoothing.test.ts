import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { computeSubsidies, normalizeParcels } from '../subsidies';
import { buildTimeline, type TimelineInput, type TimelineOptions } from './timeline';
import {
  bridgeCreditNeeded,
  creditAvailableFrom,
  cumulativeAvailable,
  maxSafeSalary,
  suggestCredit,
  type SmoothingOptions,
} from './smoothing';
import { monthsUntilNextIncome, proposeAllocation } from './allocation';

const data = loadData();
const farm = { parcels: [{ cropId: 'grau', areaHa: 8 }, { cropId: 'porumb', areaHa: 7 }], age: 55 };
const subsidies = computeSubsidies(farm, data, { exchangeRates: { FEGA: 5.28 } });
const input: TimelineInput = { parcels: normalizeParcels(farm.parcels), subsidies, startBalance: 3_500_000 };

// The worked example in docs/07 §4: Nov 2026 – Sep 2027 (H = 11), normal year,
// APIA balance in the middle of its window (March), pension 200 lei.
const opts: TimelineOptions = { start: '2026-11', months: 11, amounts: 'medium', timing: 'mid' };
const tl = buildTimeline(input, data, opts);
const smooth: SmoothingOptions = { pensionMonthly: 20_000 };
const lei = (b: number) => b / 100;

describe('docs/07 §4 worked example', () => {
  it('cumulative money before salary matches the table', () => {
    const cum = cumulativeAvailable(tl, smooth).map(lei);
    expect(cum[0]).toBeCloseTo(47452.2, 2); // Nov
    expect(cum[4]).toBeCloseTo(37119.6, 2); // Mar
    expect(cum[7]).toBeCloseTo(6919.6, 2); // Jun
    expect(cum[10]).toBeCloseTo(38119.6, 2); // Sep
  });

  it('without credit: 850 lei a month, limited by June', () => {
    const r = maxSafeSalary(tl, smooth, data);
    expect(lei(r.salary)).toBe(850);
    expect(r.bindingMonth).toBe('2027-06');
    expect(r.deficit).toBe(false);
  });

  it('for 2,400 lei a month: 12,300 lei credit, needed from May', () => {
    const c = bridgeCreditNeeded(tl, smooth, 240_000, data);
    expect(lei(c.amount)).toBe(12300);
    expect(c.takeMonth).toBe('2027-05');
  });

  it('a credit is not needed for the safe salary', () => {
    expect(bridgeCreditNeeded(tl, smooth, 85_000, data).amount).toBe(0);
  });
});

describe('suggestCredit (decision A)', () => {
  it('the APIA certificate exists from March (next application window)', () => {
    expect(creditAvailableFrom(tl, data)).toBe('2027-03');
  });

  it('suggests the best salary whose credit stays within 90% of the subsidy', () => {
    const s = suggestCredit(tl, smooth, subsidies.totals.lei.probable, data)!;
    expect(s).not.toBeNull();
    expect(s.capacity).toBe(Math.round(subsidies.totals.lei.probable * 0.9));
    expect(s.credit.amount).toBeLessThanOrEqual(s.capacity);
    expect(lei(s.salary)).toBe(2750);
    expect(lei(s.credit.amount)).toBe(15100);
    expect(s.credit.takeMonth).toBe('2027-04');
  });

  it('declaring that credit makes the suggested salary safe', () => {
    const s = suggestCredit(tl, smooth, subsidies.totals.lei.probable, data)!;
    const withCredit = buildTimeline(
      {
        ...input,
        extras: [{ id: 'c1', kind: 'credit', direction: 'in', amount: s.credit.amount, date: '2027-04-01' }],
      },
      data,
      opts,
    );
    expect(maxSafeSalary(withCredit, smooth, data).salary).toBeGreaterThanOrEqual(s.salary);
  });

  it('a credit already declared uses up the same certificate: no second big credit', () => {
    const s = suggestCredit(tl, smooth, subsidies.totals.lei.probable, data)!;
    const withCredit = buildTimeline(
      { ...input, extras: [{ id: 'c1', kind: 'credit', direction: 'in', amount: s.credit.amount, date: '2027-04-01' }] },
      data,
      opts,
    );
    const again = suggestCredit(withCredit, smooth, subsidies.totals.lei.probable, data, s.credit.amount);
    const total = s.credit.amount + (again?.credit.amount ?? 0);
    expect(total).toBeLessThanOrEqual(s.capacity);
  });

  it('no suggestion when the farm never runs short', () => {
    const rich = buildTimeline({ ...input, startBalance: 50_000_000 }, data, opts);
    expect(suggestCredit(rich, smooth, subsidies.totals.lei.probable, data)).toBeNull();
  });
});

describe('edge cases', () => {
  it('money runs out even with no salary: salary 0 and deficit', () => {
    const poor = buildTimeline({ ...input, startBalance: 0 }, data, { ...opts, amounts: 'bad', timing: 'late' });
    const r = maxSafeSalary(poor, smooth, data);
    expect(r.salary).toBe(0);
    expect(r.deficit).toBe(true);
  });

  it('a declared repayment inside the horizon lowers the salary', () => {
    const withRepay = buildTimeline(
      {
        ...input,
        extras: [{ id: 'r', kind: 'loan_repayment', direction: 'out', amount: 500_000, date: '2027-02-10' }],
      },
      data,
      opts,
    );
    expect(maxSafeSalary(withRepay, smooth, data).salary).toBeLessThan(maxSafeSalary(tl, smooth, data).salary);
  });

  it('salary is always a multiple of 50 lei', () => {
    for (const startBalance of [0, 1_234_567, 3_500_000, 9_999_999]) {
      const s = maxSafeSalary(buildTimeline({ ...input, startBalance }, data, opts), smooth, data).salary;
      expect(s % 5_000).toBe(0);
    }
  });
});

describe('proposeAllocation', () => {
  it('splits the APIA advance: pension and salary until the next income, rest for costs', () => {
    const months = monthsUntilNextIncome(tl, '2026-11');
    expect(months).toBe(4); // next income: APIA balance in March
    // Money on hand before the advance only has to last until the advance (this month).
    expect(monthsUntilNextIncome(tl, '2026-11', true)).toBe(1);
    const env = proposeAllocation({
      amount: 1_265_220,
      isIncome: true,
      salary: 65_000,
      pensionMonthly: 20_000,
      monthsCovered: months,
      debtsDue: 0,
    });
    expect(env).not.toHaveProperty('risk_fund');
    expect(env.pension).toBe(80_000);
    expect(env.salary).toBe(260_000);
    expect(Object.values(env).reduce((a, b) => a + b, 0)).toBe(1_265_220);
  });

  it('money already on hand: salary for the month, the rest for costs', () => {
    const env = proposeAllocation({
      amount: 3_500_000,
      isIncome: false,
      salary: 65_000,
      pensionMonthly: 0,
      monthsCovered: 1,
      debtsDue: 0,
    });
    expect(env.salary).toBe(65_000);
    expect(env.spring_inputs).toBe(3_435_000);
  });

  it('never allocates more than the amount', () => {
    const env = proposeAllocation({
      amount: 10_000,
      isIncome: true,
      salary: 65_000,
      pensionMonthly: 20_000,
      monthsCovered: 3,
      debtsDue: 50_000,
    });
    expect(Object.values(env).reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(env.debts).toBe(10_000);
  });
});
