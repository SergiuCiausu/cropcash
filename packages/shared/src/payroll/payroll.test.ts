import { describe, expect, it } from 'vitest';
import {
  EmployeeInputSchema,
  employeeRow,
  lastWorkDay,
  payrollMonth,
  payrollMonths,
  payrollYear,
  workMonthCost,
  type EmployeeInput,
  type StoredEmployee,
} from './index';

const person = (over: Partial<StoredEmployee> = {}): StoredEmployee => ({
  id: 'p1',
  name: 'Nelu',
  role: 'tractorist',
  kind: 'permanent',
  cost_bani: 600_000,
  pay_basis: 'month',
  days_per_month: null,
  active_months: null,
  pay_day: 10,
  starts_on: '2026-01-01',
  ends_on: null,
  archived_at: null,
  ...over,
});

const zilier = (over: Partial<StoredEmployee> = {}): StoredEmployee =>
  person({ id: 'z1', kind: 'zilier', pay_basis: 'day', cost_bani: 20_000, days_per_month: 10, active_months: [7, 8], ...over });

describe('EmployeeInputSchema', () => {
  const ok: EmployeeInput = { name: 'Nelu', kind: 'permanent', costLei: 6000, payBasis: 'month', startsOn: '2026-01-01' };

  it('takes a permanent employee and defaults the pay day to the 10th', () => {
    const parsed = EmployeeInputSchema.parse(ok);
    expect(parsed.payDay).toBe(10);
  });

  it('takes a zilier with days and months', () => {
    expect(
      EmployeeInputSchema.safeParse({ ...ok, kind: 'zilier', payBasis: 'day', costLei: 200, daysPerMonth: 12, activeMonths: [7, 8] }).success,
    ).toBe(true);
  });

  it.each([
    ['a zilier paid by the month', { kind: 'zilier' }],
    ['a permanent paid by the day', { payBasis: 'day', daysPerMonth: 20 }],
    ['pay by the day without days', { kind: 'seasonal', payBasis: 'day' }],
    ['days with pay by the month', { daysPerMonth: 20 }],
    ['a permanent with months', { activeMonths: [7] }],
    ['a month twice', { kind: 'seasonal', activeMonths: [7, 7] }],
    ['an end before the start', { endsOn: '2025-12-31' }],
    ['a cost of zero', { costLei: 0 }],
    ['a cost in bani', { costLei: 6000.5 }],
    ['a blank name', { name: '  ' }],
    ['a field it does not know', { cnp: '1234567890123' }],
  ])('refuses %s', (_what, change) => {
    expect(EmployeeInputSchema.safeParse({ ...ok, ...change }).success).toBe(false);
  });
});

describe('employeeRow', () => {
  it('stores bani and sorted months', () => {
    const row = employeeRow(EmployeeInputSchema.parse({ name: ' Ana ', kind: 'seasonal', costLei: 4500, payBasis: 'month', activeMonths: [9, 7, 8], startsOn: '2026-07-01' }));
    expect(row).toEqual({
      name: 'Ana',
      role: null,
      kind: 'seasonal',
      cost_bani: 450_000,
      pay_basis: 'month',
      days_per_month: null,
      active_months: [7, 8, 9],
      pay_day: 10,
      starts_on: '2026-07-01',
      ends_on: null,
    });
  });
});

describe('workMonthCost', () => {
  it('is the whole cost in a full month', () => {
    expect(workMonthCost(person(), '2026-03')).toBe(600_000);
  });

  it('is zero before the start and after the end', () => {
    const p = person({ starts_on: '2026-03-01', ends_on: '2026-05-31' });
    expect(workMonthCost(p, '2026-02')).toBe(0);
    expect(workMonthCost(p, '2026-06')).toBe(0);
    expect(workMonthCost(p, '2026-05')).toBe(600_000);
  });

  it('pays the share of the days when starting mid-month, rounded down', () => {
    // 15–30 April: 16 of 30 days.
    expect(workMonthCost(person({ starts_on: '2026-04-15' }), '2026-04')).toBe(320_000);
    // 10–31 March: 22 of 31 days = 425 806.45… -> 425 806.
    expect(workMonthCost(person({ starts_on: '2026-03-10' }), '2026-03')).toBe(425_806);
  });

  it('pays the share of the days when leaving mid-month', () => {
    expect(workMonthCost(person({ ends_on: '2026-02-14' }), '2026-02')).toBe(300_000);
  });

  it('stops on the archive day when there is no end date', () => {
    const p = person({ archived_at: '2026-06-30T08:00:00Z' });
    expect(lastWorkDay(p)).toBe('2026-06-30');
    expect(workMonthCost(p, '2026-06')).toBe(600_000);
    expect(workMonthCost(p, '2026-07')).toBe(0);
  });

  it('takes the earlier of the end date and the archive day', () => {
    expect(lastWorkDay(person({ ends_on: '2026-05-31', archived_at: '2026-08-01T00:00:00Z' }))).toBe('2026-05-31');
    expect(lastWorkDay(person({ ends_on: '2026-12-31', archived_at: '2026-08-01T00:00:00Z' }))).toBe('2026-08-01');
  });

  it('is zero for a seasonal person outside their months', () => {
    const s = person({ kind: 'seasonal', active_months: [7, 8] });
    expect(workMonthCost(s, '2026-06')).toBe(0);
    expect(workMonthCost(s, '2026-07')).toBe(600_000);
  });

  it('is days × day cost for a zilier, never more days than on the farm', () => {
    expect(workMonthCost(zilier(), '2026-07')).toBe(200_000);
    expect(workMonthCost(zilier(), '2026-09')).toBe(0);
    // Starts on 28 July: 4 days on the farm, fewer than the 10 planned.
    expect(workMonthCost(zilier({ starts_on: '2026-07-28' }), '2026-07')).toBe(80_000);
  });
});

describe('payrollMonth', () => {
  it('pays last month’s work on the pay day', () => {
    const m = payrollMonth([person()], '2026-04');
    expect(m.payments).toEqual([{ employeeId: 'p1', workMonth: '2026-03', date: '2026-04-10', amount: 600_000 }]);
    expect(m.total).toBe(600_000);
  });

  it('pays nothing in the month someone starts, and the last pay the month after they leave', () => {
    const p = person({ starts_on: '2026-03-01', ends_on: '2026-05-31' });
    expect(payrollMonth([p], '2026-03').total).toBe(0);
    expect(payrollMonth([p], '2026-06').total).toBe(600_000);
    expect(payrollMonth([p], '2026-07').total).toBe(0);
  });

  it('moves a 31 to the last day of a short month', () => {
    expect(payrollMonth([person({ pay_day: 31 })], '2026-02').payments[0]!.date).toBe('2026-02-28');
    expect(payrollMonth([person({ pay_day: 30 })], '2026-03').payments[0]!.date).toBe('2026-03-30');
  });

  it('pays a zilier in the month they work, on its last day', () => {
    const m = payrollMonth([zilier()], '2026-08');
    expect(m.payments).toEqual([{ employeeId: 'z1', workMonth: '2026-08', date: '2026-08-31', amount: 200_000 }]);
  });

  it('adds everyone up', () => {
    expect(payrollMonth([person(), person({ id: 'p2', cost_bani: 450_000 }), zilier()], '2026-08').total).toBe(1_250_000);
  });

  it('is empty with no people', () => {
    expect(payrollMonth([], '2026-08')).toEqual({ month: '2026-08', payments: [], total: 0 });
  });
});

describe('payrollMonths', () => {
  it('gives every month in the range, across a new year', () => {
    const months = payrollMonths([person()], '2026-11', '2027-02');
    expect(months.map((m) => m.month)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(months.every((m) => m.total === 600_000)).toBe(true);
  });
});

describe('payrollYear', () => {
  it('counts the work done in the year, whenever it is paid', () => {
    const y = payrollYear([person(), zilier()], 2026);
    // December's work is paid in January 2027, but it's still 2026's cost.
    expect(y.perEmployee).toEqual({ p1: 7_200_000, z1: 400_000 });
    expect(y.total).toBe(7_600_000);
  });

  it('counts only the months someone was there', () => {
    expect(payrollYear([person({ starts_on: '2026-10-01' })], 2026).total).toBe(1_800_000);
  });
});
