import type { AmountScenario } from '../cashflow';
import type { FarmPlan } from '../cashflow/farm-plan';
import type { SubsidyResult } from '../subsidies';

export {
  PLAN_HORIZON_MONTHS,
  buildFarmPlan,
  farmSubsidies,
  farmData,
  grainInBarn,
  longForecast,
  plannedForMonth,
  proposeSplit,
  type FarmPlan,
  type FarmPlanOptions,
} from '../cashflow/farm-plan';

/** What get_plan returns: one scenario's months, plus the plan-wide figures. */
export function planView(plan: FarmPlan, scenario: AmountScenario) {
  return {
    scenario,
    timeline: plan.timelines[scenario],
    salary: plan.salary,
    monthlySalary: plan.monthlySalary,
    creditSuggestion: plan.creditSuggestion,
    credits: plan.credits,
    spring: plan.spring,
    envelopes: plan.envelopes,
    subsidyTotals: plan.subsidies.totals,
  };
}

/** The inputs behind a plan that aren't confirmed yet. */
export function planUnverified(subsidies: SubsidyResult): string[] {
  const rates = Object.entries(subsidies.rates)
    .filter(([, rate]) => !rate.confirmed)
    .map(([fund]) => `exchange_rate:${fund}`);
  const schemes = subsidies.schemes
    .filter((s) => s.schemeStatus === 'DE-VERIFICAT' || s.unverified.length > 0)
    .map((s) => `scheme:${s.code}`);
  return [...rates, ...schemes];
}
