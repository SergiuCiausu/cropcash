import { creditAvailableFrom, creditCapacity, type MonthKey } from '../cashflow';
import type { AppData } from '../data';
import { farmInputFromStored, type CreditInput, type StoredFarm } from '../farm';
import { activePensionMonthly } from '../farm/plan-inputs';
import { leiToBani, type Bani } from '../money';
import { pensionMinimum } from '../pension';
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
