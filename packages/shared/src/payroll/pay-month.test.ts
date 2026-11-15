import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { buildFarmPlan, type PlanFarm } from '../cashflow/farm-plan';
import { findRead } from '../functions/registry';
import { peopleCost, whatIfHire } from '../functions/whatIf';
import { monthlyCost, payToRecord, splitByActive, type StoredEmployee } from './index';

const data = loadData();

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
const vasile = person({ id: 'p2', name: 'Vasile', kind: 'zilier', pay_basis: 'day', cost_bani: 20_000, days_per_month: 12, active_months: [11] });
const salary = (employee_id: string | null, lei: number, day = '2026-11-09') => ({ kind: 'expense', category: 'salaries', employee_id, amount_bani: -lei * 100, occurred_at: `${day}T12:00:00Z` });

describe('payToRecord („Am plătit salariile”)', () => {
  it('lists each person paid this month, with the month of the work', () => {
    expect(payToRecord([person(), vasile], [], '2026-11')).toEqual([
      { employeeId: 'p1', name: 'Nelu', workMonth: '2026-10', date: '2026-11-10', amount: 750_000 },
      { employeeId: 'p2', name: 'Vasile', workMonth: '2026-11', date: '2026-11-30', amount: 240_000 },
    ]);
  });

  it('leaves out what was already noted for the person that month, and only that', () => {
    const noted = [salary('p1', 7500), salary('p2', 1000), salary(null, 9999), salary('p1', 7500, '2026-10-10'), { ...salary('p1', 100), category: 'diesel' }];
    expect(payToRecord([person(), vasile], noted, '2026-11')).toEqual([{ employeeId: 'p2', name: 'Vasile', workMonth: '2026-11', date: '2026-11-30', amount: 140_000 }]);
  });

  it('is empty without people', () => {
    expect(payToRecord([], [], '2026-11')).toEqual([]);
  });
});

describe('the people list', () => {
  it('costs a month: the monthly cost, or the day cost times the days', () => {
    expect(monthlyCost(person())).toBe(750_000);
    expect(monthlyCost(vasile)).toBe(240_000);
  });

  it('splits who is still on the farm from who left', () => {
    const left = person({ id: 'p3', archived_at: '2026-10-01T08:00:00Z' });
    const ended = person({ id: 'p4', ends_on: '2026-11-01' });
    const ending = person({ id: 'p5', ends_on: '2026-12-31' });
    const { active, past } = splitByActive([person(), left, ended, ending], '2026-11-14');
    expect(active.map((e) => e.id)).toEqual(['p1', 'p5']);
    expect(past.map((e) => e.id)).toEqual(['p3', 'p4']);
  });
});

const farm: PlanFarm = {
  birth_year: data.subsidies.meta.campaign_year - 55,
  start_balance_bani: 50_000_000,
  parcels: [
    { crop_id: 'grau', area_ari: 6_000, is_arable: true },
    { crop_id: 'porumb', area_ari: 4_000, is_arable: true },
  ],
  employees: [person()],
};

describe('„Îmi permit încă un om?” (what_if_hire)', () => {
  const plan = buildFarmPlan(farm, data, { month: '2026-11' });
  const tractorist = { name: 'Tractorist nou', kind: 'permanent' as const, costLei: 6_000, payBasis: 'month' as const, startsOn: '2027-03-01' };

  it('shows the salary before and after, without saving anything', () => {
    const r = whatIfHire(plan, farm as never, data, tractorist);
    expect(r.salaryBefore).toBe(plan.salary.salary);
    expect(r.salaryAfter).toBeLessThan(r.salaryBefore);
    // The plan runs Nov 2026 – Oct 2027: work from March to September, paid April to October, is 7 payments.
    expect(r.costInPlan).toBe(7 * 600_000);
    expect(r.costThisYear).toBe(0);
    expect(farm.employees).toHaveLength(1);
  });

  it('refuses a person that breaks the rules', () => {
    expect(() => whatIfHire(plan, farm as never, data, { ...tractorist, kind: 'zilier' })).toThrow();
  });

  it('is an assistant read, information only', () => {
    const fn = findRead('what_if_hire')!;
    const out = fn.execute(tractorist, { farm: farm as never, plan, data, today: '2026-11-14' });
    expect(out.data).toMatchObject({ salaryBefore: plan.salary.salary });
  });
});

describe('„Cât mă costă oamenii pe an?” (get_people_cost)', () => {
  it('adds up each person’s work in the year', () => {
    const r = peopleCost({ ...farm, employees: [person(), vasile] } as never, 2026);
    expect(r.total).toBe(12 * 750_000 + 240_000);
    expect(r.people).toEqual([
      { name: 'Nelu', role: 'tractorist', kind: 'permanent', left: false, cost: 9_000_000 },
      { name: 'Vasile', role: 'tractorist', kind: 'zilier', left: false, cost: 240_000 },
    ]);
  });

  it('defaults to the plan’s year', () => {
    const plan = buildFarmPlan(farm, data, { month: '2026-11' });
    const out = findRead('get_people_cost')!.execute({}, { farm: farm as never, plan, data, today: '2026-11-14' });
    expect(out.data).toMatchObject({ year: 2026, total: 9_000_000 });
  });
});
