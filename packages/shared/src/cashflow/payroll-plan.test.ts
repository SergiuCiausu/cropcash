import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import type { StoredEmployee } from '../payroll';
import { cropsNeedingOwnCost } from '../payroll';
import { proposeAllocation } from './allocation';
import { planDrivers } from './drivers';
import { buildFarmPlan, proposeSplit, type PlanFarm } from './farm-plan';
import { payrollShortMonths } from './insights';
import { finishTimeline } from './timeline';

const data = loadData();
const MONTH = '2026-11';

const person = (over: Partial<StoredEmployee> = {}): StoredEmployee => ({
  id: 'p1',
  name: 'Nelu',
  role: 'tractorist',
  kind: 'permanent',
  cost_bani: 750_000,
  pay_basis: 'month',
  days_per_month: null,
  active_months: null,
  pay_day: 10,
  starts_on: '2026-01-01',
  ends_on: null,
  archived_at: null,
  ...over,
});

const farm = (over: Partial<PlanFarm> = {}): PlanFarm => ({
  birth_year: data.subsidies.meta.campaign_year - 55,
  start_balance_bani: 50_000_000,
  parcels: [
    { crop_id: 'grau', area_ari: 6_000, is_arable: true },
    { crop_id: 'porumb', area_ari: 4_000, is_arable: true },
  ],
  ...over,
});

const entries = (plan: ReturnType<typeof buildFarmPlan>) => plan.timelines.medium.months.flatMap((m) => m.entries);
const payroll = (plan: ReturnType<typeof buildFarmPlan>) => entries(plan).filter((e) => e.kind === 'payroll');

describe('the people in the plan', () => {
  it('pays each person on their pay day, with their name, the same in every kind of year', () => {
    const plan = buildFarmPlan(farm({ employees: [person()] }), data, { month: MONTH });
    const months = data.params.forecast.plan_months.value;
    const lines = payroll(plan);
    expect(lines).toHaveLength(months);
    expect(lines[0]).toMatchObject({
      id: 'payroll:p1:2026-10',
      direction: 'out',
      value: 750_000,
      date: '2026-11-10',
      employeeId: 'p1',
      what: 'Nelu',
      estimated: false,
      unverified: false,
    });
    for (const kind of ['bad', 'good'] as const) {
      expect(plan.timelines[kind].months.flatMap((m) => m.entries).filter((e) => e.kind === 'payroll').map((e) => e.value)).toEqual(lines.map((e) => e.value));
    }
  });

  it('comes before the farmer’s own salary: the safe salary drops by the pay', () => {
    const without = buildFarmPlan(farm(), data, { month: MONTH });
    const withNelu = buildFarmPlan(farm({ employees: [person()] }), data, { month: MONTH });
    expect(withNelu.salary.exact).toBeCloseTo(without.salary.exact - 750_000, 0);
    expect(withNelu.salary.salary).toBeLessThan(without.salary.salary);
  });

  it('has nothing for a farm without people', () => {
    expect(payroll(buildFarmPlan(farm(), data, { month: MONTH }))).toEqual([]);
    expect(payroll(buildFarmPlan(farm({ employees: [] }), data, { month: MONTH }))).toEqual([]);
  });

  it('lets a recorded salary with the person replace their pay of that month', () => {
    const paid = farm({
      employees: [person()],
      transactions: [{ id: 't1', kind: 'expense', category: 'salaries', employee_id: 'p1', crop_id: null, amount_bani: -750_000, occurred_at: '2026-11-09T12:00:00Z', note: null }],
    });
    const lines = payroll(buildFarmPlan(paid, data, { month: MONTH }));
    expect(lines.find((e) => e.date.startsWith('2026-11'))).toBeUndefined();
    expect(lines.find((e) => e.date.startsWith('2026-12'))?.value).toBe(750_000);
  });

  it('takes only what was paid when the record is smaller', () => {
    const part = farm({
      employees: [person()],
      transactions: [{ id: 't1', kind: 'expense', category: 'salaries', employee_id: 'p1', crop_id: null, amount_bani: -500_000, occurred_at: '2026-11-09T12:00:00Z', note: null }],
    });
    expect(payroll(buildFarmPlan(part, data, { month: MONTH }))[0]).toMatchObject({ date: '2026-11-10', value: 250_000 });
  });

  it('keeps the planned pay when the salary expense names no one, or someone else', () => {
    for (const employee_id of [null, 'p2']) {
      const other = farm({
        employees: [person()],
        transactions: [{ id: 't1', kind: 'expense', category: 'salaries', employee_id, crop_id: null, amount_bani: -750_000, occurred_at: '2026-11-09T12:00:00Z', note: null }],
      });
      expect(payroll(buildFarmPlan(other, data, { month: MONTH }))[0]).toMatchObject({ date: '2026-11-10', value: 750_000 });
    }
  });

  it('never lets a salary expense lower a crop’s planned cost', () => {
    const base = buildFarmPlan(farm({ employees: [person()] }), data, { month: MONTH });
    const recorded = buildFarmPlan(
      farm({
        employees: [person()],
        transactions: [{ id: 't1', kind: 'expense', category: 'salaries', employee_id: null, crop_id: null, amount_bani: -750_000, occurred_at: '2026-11-09T12:00:00Z', note: null }],
      }),
      data,
      { month: MONTH },
    );
    const costs = (p: typeof base) => entries(p).filter((e) => e.kind === 'input_cost').reduce((s, e) => s + e.value, 0);
    expect(costs(recorded)).toBe(costs(base));
  });
});

describe('the payroll envelope', () => {
  it('takes the pay due before the next income, after debts and before pension and salary', () => {
    const split = proposeAllocation({ amount: 1_000, isIncome: true, salary: 100, pensionMonthly: 50, monthsCovered: 2, debtsDue: 200, payrollDue: 300 });
    expect(split).toEqual({ debts: 200, payroll: 300, pension: 100, salary: 200, spring_inputs: 200 });
  });

  it('gives what is left when the money is short, in that order', () => {
    expect(proposeAllocation({ amount: 250, isIncome: true, salary: 100, pensionMonthly: 50, monthsCovered: 2, debtsDue: 200, payrollDue: 300 })).toEqual({
      debts: 200,
      payroll: 50,
      pension: 0,
      salary: 0,
      spring_inputs: 0,
    });
  });

  it('is 0 without people', () => {
    expect(proposeAllocation({ amount: 1_000, isIncome: true, salary: 100, pensionMonthly: 0, monthsCovered: 1, debtsDue: 0 }).payroll).toBe(0);
  });

  it('fills from the farm plan with the months the money has to last', () => {
    const plan = buildFarmPlan(farm({ employees: [person()] }), data, { month: MONTH });
    const { split, monthsCovered } = proposeSplit(plan, 100_000_000, true);
    const due = plan.timelines.medium.months
      .slice(0, monthsCovered)
      .flatMap((m) => m.entries)
      .filter((e) => e.kind === 'payroll')
      .reduce((s, e) => s + e.value, 0);
    expect(due).toBeGreaterThan(0);
    expect(split.payroll).toBe(due);
    expect(Object.values(split).reduce((s, v) => s + v, 0)).toBe(100_000_000);
  });
});

describe('„nu ajung banii de salariile oamenilor”', () => {
  it('lists the months that pay people and end below zero', () => {
    const t = finishTimeline(
      [
        { id: 'payroll:p1:2026-10', kind: 'payroll', direction: 'out', amount: null, value: 300, date: '2026-11-10', window: null, estimated: false, unverified: false },
        { id: 'x', kind: 'input_cost', direction: 'out', amount: null, value: 900, date: '2026-12-15', window: null, estimated: false, unverified: false },
        { id: 'payroll:p1:2026-11', kind: 'payroll', direction: 'out', amount: null, value: 300, date: '2026-12-10', window: null, estimated: false, unverified: false },
      ],
      ['2026-11', '2026-12', '2027-01'],
      1_000,
    );
    // November ends at 700; December at -500 with pay in it; January has no pay.
    expect(payrollShortMonths(t)).toEqual([{ key: '2026-12', payroll: 300, missing: 500 }]);
  });

  it('is on the farm plan, empty when the money is enough', () => {
    const rich = buildFarmPlan(farm({ employees: [person()] }), data, { month: MONTH });
    expect(rich.payrollShort.medium).toEqual([]);
    const poor = buildFarmPlan(farm({ start_balance_bani: 0, employees: [person({ cost_bani: 50_000_000 })] }), data, { month: MONTH });
    expect(poor.payrollShort.medium.length).toBeGreaterThan(0);
    expect(poor.payrollShort.medium[0]!.missing).toBeGreaterThan(0);
  });
});

describe('the payroll driver', () => {
  it('is one row for all the people, without a person’s name, and lowers the salary', () => {
    const plan = buildFarmPlan(farm({ employees: [person(), person({ id: 'p2', name: 'Ana', cost_bani: 500_000 })] }), data, { month: MONTH });
    const rows = planDrivers(plan, data).filter((d) => d.kind === 'payroll');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'payroll', direction: 'out', title: null, own: false });
    expect(rows[0]!.total).toBe(1_250_000 * data.params.forecast.plan_months.value);
    expect(rows[0]!.salaryEffect).toBeLessThan(0);
    expect(rows[0]!.spread).toBe(0);
  });
});

describe('cropsNeedingOwnCost (D3)', () => {
  const base = { parcels: farm().parcels, harvests: null };

  it('is empty until the farmer says their people do the field work', () => {
    expect(cropsNeedingOwnCost({ ...base }, data)).toEqual([]);
    expect(cropsNeedingOwnCost({ ...base, own_field_work: null }, data)).toEqual([]);
    expect(cropsNeedingOwnCost({ ...base, own_field_work: false }, data)).toEqual([]);
  });

  it('lists the crops still on the average cost, once each', () => {
    const twice = { ...base, parcels: [...base.parcels, { crop_id: 'grau', area_ari: 100, is_arable: true }], own_field_work: true };
    expect(cropsNeedingOwnCost(twice, data)).toEqual(['grau', 'porumb']);
  });

  it('leaves out crops with the farmer’s own cost, fallow land and unknown crops', () => {
    const fallow = data.crops.crops.find((c) => c.cost_lei_per_ha.mean === 0)!.id;
    const typed = {
      parcels: [...base.parcels, { crop_id: fallow, area_ari: 100, is_arable: true }, { crop_id: 'own-ceva', area_ari: 100, is_arable: true }],
      harvests: { years: [], gathered: [], expected: [{ cropId: 'grau', yieldTPerHa: null, priceLeiPerKg: null, costLeiPerHa: 3_900 }] },
      own_field_work: true,
    } as Parameters<typeof cropsNeedingOwnCost>[0];
    expect(cropsNeedingOwnCost(typed, data)).toEqual(['porumb']);
  });
});
