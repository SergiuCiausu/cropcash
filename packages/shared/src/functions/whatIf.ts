import { creditAvailableFrom, creditCapacity, type MonthKey } from '../cashflow';
import type { AppData } from '../data';
import { farmInputFromStored, type CreditInput, type StoredFarm } from '../farm';
import { activePensionMonthly } from '../farm/plan-inputs';
import { leiToBani, type Bani } from '../money';
import { pensionMinimum } from '../pension';
import { EmployeeInputSchema, employeeRow, payrollYear, type EmployeeInput, type StoredEmployee } from '../payroll';
import { computeSubsidies, type ParcelInput } from '../subsidies';
import { buildFarmPlan, type FarmPlan } from './plan';

export interface SubsidyChange {
  parcels?: ParcelInput[];
  age?: number;
}

/** What the subsidy would be with other land or another age. Null for an unknown crop. */
export function whatIfSubsidy(plan: FarmPlan, farm: StoredFarm, data: AppData, change: SubsidyChange) {
  const known = new Set(data.crops.crops.map((c) => c.id));
  if (change.parcels?.some((p) => !known.has(p.cropId))) return null;
  const today = farmInputFromStored(farm, data.subsidies.meta.campaign_year);
  const changed = { ...today, ...change };
  const after = computeSubsidies(changed, data, plan.subsidyParams);
  // Estimates compare with estimates, so a payment decision can't show up as a change.
  const before = computeSubsidies(today, data, plan.subsidyParams);
  const codes = (r: typeof after) => r.schemes.map((s) => s.code);
  return {
    before: before.totals.lei,
    after: after.totals.lei,
    difference: after.totals.lei.probable - before.totals.lei.probable,
    gained: codes(after).filter((c) => !codes(before).includes(c)),
    lost: codes(before).filter((c) => !codes(after).includes(c)),
  };
}

/** The salary with a credit that isn't saved yet, built the way a saved one would be. */
export function whatIfCredit(plan: FarmPlan, farm: StoredFarm, data: AppData, credit: CreditInput) {
  const amount = leiToBani(credit.amountLei);
  const row = (id: string, kind: string, direction: 'in' | 'out', month: MonthKey) => ({
    id,
    group_id: 'what-if',
    kind,
    direction,
    amount_probable_bani: amount,
    window_start: `${month}-01`,
    status: 'planned',
  });
  const t = plan.timelines.medium;
  const withCredit = buildFarmPlan(
    {
      ...farm,
      expected_payments: [
        ...(farm.expected_payments ?? []),
        row('what-if-in', 'credit', 'in', credit.takeMonth),
        row('what-if-out', 'loan_repayment', 'out', credit.repayMonth),
      ],
    },
    data,
    { month: t.months[0]!.key, params: plan.subsidyParams },
  );
  const borrowed = plan.credits.reduce((sum, c) => sum + c.amount, 0);
  const capacity = creditCapacity(plan.subsidies.totals.lei.probable, data, borrowed);
  const availableFrom = creditAvailableFrom(t, data);
  return {
    amount,
    salaryBefore: plan.salary.salary,
    salaryAfter: withCredit.salary.salary,
    limitingMonth: withCredit.salary.bindingMonth,
    capacity,
    withinLimit: amount <= capacity,
    /** The APIA certificate doesn't exist before this month. */
    availableFrom,
    inTime: availableFrom !== null && credit.takeMonth >= availableFrom,
  };
}

/**
 * "Pot să-mi iau…?": the salary and the lowest month with one purchase paid in `month`.
 * Shows the effect only, never a yes or no. Null for a month outside the plan's 12 months.
 * The purchase goes in as a planned outflow with no group, so it can't look like a declared credit.
 */
export function checkPurchase(plan: FarmPlan, farm: StoredFarm, data: AppData, amount: Bani, month?: MonthKey) {
  const t = plan.timelines.medium;
  const first = t.months[0]!.key;
  const key = month ?? first;
  if (!t.months.some((m) => m.key === key)) return null;
  const withPurchase = buildFarmPlan(
    {
      ...farm,
      expected_payments: [
        ...(farm.expected_payments ?? []),
        {
          id: 'what-if-purchase',
          group_id: null,
          kind: 'loan_repayment',
          direction: 'out',
          amount_probable_bani: amount,
          window_start: `${key}-01`,
          status: 'planned',
        },
      ],
    },
    data,
    { month: first, params: plan.subsidyParams },
  );
  const after = withPurchase.timelines.medium;
  return {
    amount,
    month: key,
    salaryBefore: plan.salary.salary,
    salaryAfter: withPurchase.salary.salary,
    limitingMonth: withPurchase.salary.bindingMonth,
    lowestBefore: t.lowest,
    lowestAfter: after.lowest,
    /** True when the lowest point drops below zero only because of the purchase. */
    goesShort: t.lowest.balance >= 0 && after.lowest.balance < 0,
  };
}

/**
 * The salary with another monthly pension, built the way a started one would be, so the screen and
 * the payout can't disagree. 0 means no pension. Pension money comes out of the salary.
 */
export function whatIfPension(plan: FarmPlan, farm: StoredFarm, data: AppData, monthly: Bani, fundId?: string | null) {
  const withPension = buildFarmPlan(
    { ...farm, pension_plans: monthly > 0 ? { monthly_bani: monthly, status: 'active' } : null },
    data,
    { month: plan.timelines.medium.months[0]!.key, params: plan.subsidyParams },
  );
  const minimum = pensionMinimum(data, fundId ?? farm.pension_fund_id);
  return {
    monthly,
    pensionBefore: activePensionMonthly(farm.pension_plans),
    /** The most the plan can pay safely now. */
    salaryBefore: plan.salary.salary,
    /** What is paid now, which a fixed salary can keep below the safe one. */
    paidBefore: plan.monthlySalary,
    /** What is paid after: starting, changing or stopping the pension fixes the salary again at this. */
    salaryAfter: withPension.salary.salary,
    limitingMonth: withPension.salary.bindingMonth,
    minimum: minimum.amount,
    minimumVerified: minimum.verified,
    underMinimum: monthly > 0 && monthly < minimum.amount,
  };
}

/**
 * „Îmi permit încă un om din martie?”: the salary and the lowest month with one more person, built the
 * way a saved one would be (same payroll rules). Information only, never a yes or no. The input is a
 * person as the farmer types them; a bad one throws.
 */
export function whatIfHire(plan: FarmPlan, farm: StoredFarm, data: AppData, person: EmployeeInput) {
  const row = employeeRow(EmployeeInputSchema.parse(person));
  const t = plan.timelines.medium;
  const hired: StoredEmployee = { ...row, id: 'what-if-person', archived_at: null };
  const withPerson = buildFarmPlan({ ...farm, employees: [...(farm.employees ?? []), hired] }, data, { month: t.months[0]!.key, params: plan.subsidyParams });
  const after = withPerson.timelines.medium;
  const firstYear = Number(t.months[0]!.key.slice(0, 4));
  return {
    /** What they cost in the next 12 months of the plan, all paid. */
    costInPlan: after.months.flatMap((m) => m.entries).filter((e) => e.employeeId === hired.id).reduce((s, e) => s + e.value, 0),
    costThisYear: payrollYear([hired], firstYear).total,
    salaryBefore: plan.salary.salary,
    salaryAfter: withPerson.salary.salary,
    limitingMonth: withPerson.salary.bindingMonth,
    lowestBefore: t.lowest,
    lowestAfter: after.lowest,
    goesShort: t.lowest.balance >= 0 && after.lowest.balance < 0,
    /** Months where the people's pay no longer fits, with this person. */
    payrollShort: withPerson.payrollShort.medium,
  };
}

/** „Cât mă costă oamenii pe an?”: each person's work in `year`, and the total. */
export function peopleCost(farm: StoredFarm, year: number) {
  const people = farm.employees ?? [];
  const { perEmployee, total } = payrollYear(people, year);
  return {
    year,
    total,
    people: people.map((e) => ({ name: e.name, role: e.role, kind: e.kind, left: !!e.archived_at, cost: perEmployee[e.id] ?? 0 })),
  };
}
