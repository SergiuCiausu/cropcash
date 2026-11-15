/**
 * The farm's people and what they cost (docs/employees-arenda-plan.md §1).
 *
 * The farmer types each person's **total** cost (pay + taxes + contributions), so no tax rate is
 * needed here (D2). Money is integer bani.
 *
 * When the money leaves:
 *  - paid by the month: the work of a month is paid on the pay day of the **next** month, as farms
 *    usually pay ("salariul pe octombrie, pe 10 noiembrie");
 *  - paid by the day (zilieri, day-paid seasonal people): paid as they work, so in the same month.
 *    The plan is monthly, so it's dated on the month's last day.
 */
import { z } from 'zod';
import { addMonths, dayInMonth, lastDay, type IsoDate, type MonthKey } from '../cashflow/dates';
import { leiToBani, type Bani } from '../money';
import { isFallow, type AppData } from '../data';
import type { StoredFarm } from '../farm';

export const EMPLOYEE_KINDS = ['permanent', 'seasonal', 'zilier'] as const;
export type EmployeeKind = (typeof EMPLOYEE_KINDS)[number];
export const PAY_BASES = ['month', 'day'] as const;
export type PayBasis = (typeof PAY_BASES)[number];

/** Guards against typos, not market limits: no one person costs more than this a month. */
const MAX_COST_LEI = 1_000_000;

const Day = z.iso.date();

const EmployeeFields = {
  name: z.string().trim().min(1).max(80),
  role: z.string().trim().min(1).max(60).optional(),
  kind: z.enum(EMPLOYEE_KINDS),
  /** The total the person costs the farm: per month, or per day when paid by the day. Whole lei. */
  costLei: z.number().int().positive().max(MAX_COST_LEI),
  payBasis: z.enum(PAY_BASES),
  /** Paid by the day: the days worked in a month when they work. */
  daysPerMonth: z.number().int().min(1).max(31).optional(),
  /** The months they work (1–12). Left out: every month. */
  activeMonths: z.array(z.number().int().min(1).max(12)).min(1).max(12).optional(),
  /** Paid by the month: the day of the next month the pay goes out. */
  payDay: z.number().int().min(1).max(31).default(10),
  startsOn: Day,
  endsOn: Day.optional(),
};

/** A person after validation (whole lei, pay day filled in). */
export type EmployeeShape = z.output<z.ZodObject<typeof EmployeeFields>>;

/** The rules between fields. Migration 026 checks the same ones. */
function checkEmployee<T extends EmployeeShape>(e: T, ctx: z.core.$RefinementCtx<T>): void {
  const fail = (message: string, path: keyof EmployeeShape) => ctx.addIssue({ code: 'custom', message, path: [path] });
  if (e.payBasis === 'day' && e.daysPerMonth === undefined) fail('days per month for pay by the day', 'daysPerMonth');
  if (e.payBasis === 'month' && e.daysPerMonth !== undefined) fail('days per month only for pay by the day', 'daysPerMonth');
  if (e.kind === 'zilier' && e.payBasis !== 'day') fail('a zilier is paid by the day', 'payBasis');
  if (e.kind === 'permanent' && e.payBasis !== 'month') fail('a permanent employee is paid by the month', 'payBasis');
  if (e.kind === 'permanent' && e.activeMonths !== undefined) fail('a permanent employee works every month', 'activeMonths');
  if (e.activeMonths && new Set(e.activeMonths).size !== e.activeMonths.length) fail('a month twice', 'activeMonths');
  if (e.endsOn && e.endsOn < e.startsOn) fail('ends before it starts', 'endsOn');
}

/** A person as the farmer types them. Validated on the phone and on the server. */
export const EmployeeInputSchema = z.strictObject(EmployeeFields).superRefine(checkEmployee);
export type EmployeeInput = z.input<typeof EmployeeInputSchema>;

/** "Adaugă un om". The phone's id makes a second send return the first row. */
export const AddEmployeeInputSchema = z.strictObject({ ...EmployeeFields, clientId: z.uuid().optional() }).superRefine(checkEmployee);
/** "Schimbă": every field again, so leaving one out clears it. */
export const UpdateEmployeeInputSchema = z.strictObject({ ...EmployeeFields, id: z.uuid() }).superRefine(checkEmployee);
/** "A plecat": archived, never deleted. Without a date the work stops on the day it's archived. */
export const ArchiveEmployeeInputSchema = z.strictObject({ id: z.uuid(), endsOn: Day.optional() });

/** A row of the `employees` table (migration 025). */
export interface StoredEmployee {
  id: string;
  name: string;
  role: string | null;
  kind: EmployeeKind;
  cost_bani: Bani;
  pay_basis: PayBasis;
  days_per_month: number | null;
  active_months: number[] | null;
  pay_day: number;
  starts_on: IsoDate;
  ends_on: IsoDate | null;
  /** Archived without an end date: the work stops on the day it was archived. */
  archived_at: string | null;
}

/** Input -> the row to insert or replace (without the id). Extra keys (id, clientId) are left out. */
export function employeeRow(input: EmployeeShape): Omit<StoredEmployee, 'id' | 'archived_at'> {
  const e = input;
  return {
    name: e.name,
    role: e.role ?? null,
    kind: e.kind,
    cost_bani: leiToBani(e.costLei),
    pay_basis: e.payBasis,
    days_per_month: e.daysPerMonth ?? null,
    active_months: e.activeMonths ? [...e.activeMonths].sort((a, b) => a - b) : null,
    pay_day: e.payDay,
    starts_on: e.startsOn,
    ends_on: e.endsOn ?? null,
  };
}

/** The last day the person works, or null while it's open. */
export function lastWorkDay(e: Pick<StoredEmployee, 'ends_on' | 'archived_at'>): IsoDate | null {
  const archived = e.archived_at?.slice(0, 10) ?? null;
  if (e.ends_on && archived) return e.ends_on < archived ? e.ends_on : archived;
  return e.ends_on ?? archived;
}

const dayOf = (d: IsoDate) => Number(d.slice(8, 10));

/** How many days of `month` the person is on the farm (0 when not at all). */
function daysEmployed(e: StoredEmployee, month: MonthKey): number {
  const first = dayInMonth(month, 1);
  const last = lastDay(month);
  const end = lastWorkDay(e);
  if (e.starts_on > last || (end !== null && end < first)) return 0;
  const from = e.starts_on > first ? dayOf(e.starts_on) : 1;
  const to = end !== null && end < last ? dayOf(end) : dayOf(last);
  return to - from + 1;
}

/**
 * What the work of `month` costs. Paid by the month: the whole cost, or the share of the days on the
 * farm (rounded down to the ban). Paid by the day: the day cost × the planned days, never more days
 * than they're on the farm. Zero in a month they don't work.
 */
export function workMonthCost(e: StoredEmployee, month: MonthKey): Bani {
  if (e.active_months && !e.active_months.includes(Number(month.slice(5, 7)))) return 0;
  const days = daysEmployed(e, month);
  if (days === 0) return 0;
  if (e.pay_basis === 'day') return e.cost_bani * Math.min(e.days_per_month ?? 0, days);
  const inMonth = dayOf(lastDay(month));
  return days === inMonth ? e.cost_bani : Math.floor((e.cost_bani * days) / inMonth);
}

/** The pay day in `month`; a 31 falls on the month's last day. */
function payDate(month: MonthKey, day: number): IsoDate {
  const last = lastDay(month);
  return day >= dayOf(last) ? last : dayInMonth(month, day);
}

export interface PayrollPayment {
  employeeId: string;
  /** The month the work was done. */
  workMonth: MonthKey;
  /** When the money leaves. */
  date: IsoDate;
  amount: Bani;
}

/** The payments of one person that leave in `month`. */
function paymentsIn(e: StoredEmployee, month: MonthKey): PayrollPayment[] {
  const workMonth = e.pay_basis === 'month' ? addMonths(month, -1) : month;
  const amount = workMonthCost(e, workMonth);
  if (amount === 0) return [];
  const date = e.pay_basis === 'month' ? payDate(month, e.pay_day) : lastDay(month);
  return [{ employeeId: e.id, workMonth, date, amount }];
}

export interface PayrollMonth {
  month: MonthKey;
  payments: PayrollPayment[];
  total: Bani;
}

/** Everything the farm pays its people in `month`. */
export function payrollMonth(employees: readonly StoredEmployee[], month: MonthKey): PayrollMonth {
  const payments = employees.flatMap((e) => paymentsIn(e, month));
  return { month, payments, total: payments.reduce((s, p) => s + p.amount, 0) };
}

/** The months from `from` to `to`, both included, for the plan. */
export function payrollMonths(employees: readonly StoredEmployee[], from: MonthKey, to: MonthKey): PayrollMonth[] {
  const out: PayrollMonth[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(payrollMonth(employees, m));
  return out;
}

/** "Cât mă costă oamenii pe an?": the work done in `year`, per person and in total, whenever it's paid. */
export function payrollYear(employees: readonly StoredEmployee[], year: number): { perEmployee: Record<string, Bani>; total: Bani } {
  const perEmployee: Record<string, Bani> = {};
  let total = 0;
  for (const e of employees) {
    let sum = 0;
    for (let m = 1; m <= 12; m++) sum += workMonthCost(e, `${year}-${String(m).padStart(2, '0')}`);
    perEmployee[e.id] = sum;
    total += sum;
  }
  return { perEmployee, total };
}

/** „Lucrările pe câmp le fac oamenii tăi?” (D3). Null on the farm means not asked yet. */
export const SetOwnFieldWorkInputSchema = z.strictObject({ ownFieldWork: z.boolean() });

/**
 * The crops whose planned cost may count the field work twice: the farm's own people do it (and are
 * paid in payroll), but the crop still plans with the average cost per ha, which includes paying
 * someone for it. The farmer's own cost per ha (Recolte, P31) fixes it, so those crops are left out,
 * and so are fallow land and the farmer's own crops (their costs are already the farmer's).
 * Empty unless the farmer said yes.
 */
export function cropsNeedingOwnCost(
  farm: Pick<StoredFarm, 'parcels' | 'harvests'> & { own_field_work?: boolean | null },
  data: AppData,
): string[] {
  if (farm.own_field_work !== true) return [];
  const typed = new Set((farm.harvests?.expected ?? []).filter((x) => x.costLeiPerHa != null).map((x) => x.cropId));
  const known = new Map(data.crops.crops.map((c) => [c.id, c]));
  const ids = new Set<string>();
  for (const p of farm.parcels) {
    const crop = known.get(p.crop_id);
    if (crop && !isFallow(crop) && !typed.has(p.crop_id)) ids.add(p.crop_id);
  }
  return [...ids];
}

/** A salary the farmer already noted: an expense in `salaries` that names the person. */
export interface RecordedPay {
  employee_id?: string | null;
  category?: string | null;
  kind?: string;
  amount_bani: Bani;
  occurred_at: string;
}

export interface PayToRecord extends PayrollPayment {
  name: string;
}

/**
 * „Am plătit salariile pe [luna]”: each person's pay that leaves in `month`, minus what was already noted
 * for them that month. The same rule the plan uses, so after saving, the plan stops counting it.
 */
export function payToRecord(employees: readonly StoredEmployee[], transactions: readonly RecordedPay[], month: MonthKey): PayToRecord[] {
  const paid = new Map<string, Bani>();
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.category !== 'salaries' || !t.employee_id || t.occurred_at.slice(0, 7) !== month) continue;
    paid.set(t.employee_id, (paid.get(t.employee_id) ?? 0) + Math.abs(t.amount_bani));
  }
  const names = new Map(employees.map((e) => [e.id, e.name]));
  return payrollMonth(employees, month).payments.flatMap((p) => {
    const used = Math.min(paid.get(p.employeeId) ?? 0, p.amount);
    paid.set(p.employeeId, (paid.get(p.employeeId) ?? 0) - used);
    const amount = p.amount - used;
    return amount > 0 ? [{ ...p, amount, name: names.get(p.employeeId) ?? '' }] : [];
  });
}

/** What a person costs in a month they work: the monthly cost, or the day cost × the days. */
export function monthlyCost(e: Pick<StoredEmployee, 'cost_bani' | 'pay_basis' | 'days_per_month'>): Bani {
  return e.pay_basis === 'day' ? e.cost_bani * (e.days_per_month ?? 0) : e.cost_bani;
}

/** The people still on the farm on `day` (not archived, not ended), and the ones who left. */
export function splitByActive(employees: readonly StoredEmployee[], day: IsoDate): { active: StoredEmployee[]; past: StoredEmployee[] } {
  const active: StoredEmployee[] = [];
  const past: StoredEmployee[] = [];
  for (const e of employees) {
    const end = lastWorkDay(e);
    (e.archived_at || (end !== null && end < day) ? past : active).push(e);
  }
  return { active, past };
}
