import type { AppData } from '../data';
import type { Bani, Range } from '../money';
import { simulatePensionScenarios } from '../pension';
import { afterBadHarvest, type PlanFarm } from './farm-plan';
import { computeFarmPlan, type ScenarioPlan } from './plan';
import type { MonthKey } from './dates';

/*
 * What a change to docs/data does to one farm, before it's published (docs/admin-panel-plan.md):
 * the figures a farmer sees first, worked out with the same calculation the app and Stripe use.
 */

export interface PlanSummary {
  /** What the farmer is paid each month. */
  monthlySalary: Bani;
  /** The highest salary the normal year allows. */
  safeSalary: Bani;
  /** The month that sets it. */
  bindingMonth: MonthKey;
  /** Lowest month-end balance, before salary (normal year). */
  lowest: { key: MonthKey; balance: Bani };
  /**
   * Balance at the end of the plan, before salary (normal year). It shows a change to a harvest that
   * comes after the lowest point, which moves none of the figures above.
   */
  endBalance: Bani;
  /** APIA subsidy, low / probable / high, in bani. */
  subsidy: Range;
  /** The credit the app suggests, null when none is. */
  credit: Bani | null;
  /** The salary that holds after one bad harvest ("An slab"), null when no harvest is planned. */
  salaryAfterBadHarvest: Bani | null;
  /** The pension saved by the target age at the probable growth, null past that age. */
  pensionAtTarget: Bani | null;
}

export function planSummary(farm: PlanFarm, data: AppData, realNow = new Date()): PlanSummary {
  return summarizePlan(computeFarmPlan(farm, data, realNow), farm, data);
}

/** planSummary on a plan already worked out (the admin preview also draws its months). */
export function summarizePlan(plan: ScenarioPlan, farm: PlanFarm, data: AppData): PlanSummary {
  const monthlyPension = plan.pensionMonthly || plan.pensionSuggested;
  const pension = plan.age === null || plan.age === undefined ? null : simulatePensionScenarios(plan.age, monthlyPension, plan.pension);
  return {
    monthlySalary: plan.monthlySalary,
    safeSalary: plan.salary.salary,
    bindingMonth: plan.salary.bindingMonth,
    lowest: plan.timelines.medium.lowest,
    endBalance: plan.timelines.medium.months.at(-1)?.balanceEnd ?? plan.startBalance,
    subsidy: plan.subsidies.totals.lei,
    credit: plan.creditSuggestion?.credit.amount || null,
    salaryAfterBadHarvest: afterBadHarvest(farm, data, { month: plan.month as MonthKey })?.salary ?? null,
    pensionAtTarget: pension?.atTarget.probable ?? null,
  };
}

export type SummaryKey = keyof PlanSummary;

export interface PlanDiff {
  before: PlanSummary;
  after: PlanSummary;
  /** The figures that differ, in PlanSummary's order. */
  changed: SummaryKey[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** One farm under two versions of the data: usually the published one, then the admin's draft. */
export function diffPlans(farm: PlanFarm, before: AppData, after: AppData, realNow = new Date()): PlanDiff {
  const a = planSummary(farm, before, realNow);
  const b = planSummary(farm, after, realNow);
  const changed = (Object.keys(a) as SummaryKey[]).filter((k) => !same(a[k], b[k]));
  return { before: a, after: b, changed };
}
