import type { AppData } from '../data';
import { ageFromBirthYear, farmToday } from '../farm';
import { pensionParams, suggestSliderPension } from '../pension';
import { todayInRomania } from './dates';
import { buildFarmPlan, farmData, timelineInput, PLAN_HORIZON_MONTHS, type PlanFarm } from './farm-plan';
import { monthsToYearEnd, quarterlyProjection, salaryByScenario, SCENARIOS, yearlyTotals } from './scenarios';
import { buildTimeline, type AmountScenario, type ReceivedIncome } from './timeline';

export type { PlanFarm } from './farm-plan';

/** Plan 12 months ahead; payments with a window are assumed late (conservative, docs/11 P13). */
export const HORIZON_MONTHS = PLAN_HORIZON_MONTHS;
/** Quarterly projection: this year + 2 (docs/06 Should #6). */
export const PROJECTION_YEARS = 3;

/** "Today" for the plan: the demo clock when there is one, otherwise the date in Romania. */
export function planToday(farm: PlanFarm, realNow = new Date()): { today: string; month: string } {
  const today = farmToday(farm, todayInRomania(realNow));
  return { today, month: today.slice(0, 7) };
}

/**
 * The plan for today, with the views only the app's cards read. Every figure the two share
 * comes from buildFarmPlan, so what a screen shows is what the monthly payout uses.
 */
export function computeFarmPlan(farm: PlanFarm, baseData: AppData, realNow = new Date()) {
  const { today, month } = planToday(farm, realNow);
  const plan = buildFarmPlan(farm, baseData, { month });
  const data = farmData(farm, baseData);
  // A sale the farmer recorded counts like one that came through Stripe.
  const transactions = (farm.transactions ?? []).map((t) => (t.kind === 'sale' ? { ...t, kind: 'crop_sale' as const } : t));
  const received: ReceivedIncome[] = transactions
    .filter((t) => t.kind === 'apia_advance' || t.kind === 'apia_balance' || t.kind === 'crop_sale')
    .map((t) => ({
      kind: t.kind as ReceivedIncome['kind'],
      date: t.occurred_at.slice(0, 10),
      cropId: t.crop_id ?? undefined,
    }));
  const input = timelineInput(farm, data);
  // Long view by quarter, for each kind of year (as if every year were like that).
  const months = monthsToYearEnd(month, PROJECTION_YEARS);
  const projection = Object.fromEntries(
    SCENARIOS.map((s) => {
      const timeline = buildTimeline(input, data, { start: month, months, timing: 'late', amounts: s });
      const quarters = quarterlyProjection(timeline);
      return [s, { quarters, years: yearlyTotals(quarters) }];
    }),
  ) as Record<AmountScenario, { quarters: ReturnType<typeof quarterlyProjection>; years: ReturnType<typeof yearlyTotals> }>;
  const pension = pensionParams(data);

  return {
    ...plan,
    today,
    month,
    age: ageFromBirthYear(farm.birth_year, Number(today.slice(0, 4))),
    pension,
    pensionSuggested: suggestSliderPension(plan.monthlySalary, pension),
    salaries: salaryByScenario(plan.timelines, plan.smoothing, data),
    projection,
    pensionMonthly: plan.smoothing.pensionMonthly ?? 0,
    received,
    transactions,
  };
}

export type ScenarioPlan = ReturnType<typeof computeFarmPlan>;
