import type { AppData } from '../data';
import {
  activePensionMonthly,
  declaredCredits,
  envelopesFromStored,
  extrasFromStored,
  farmInputFromStored,
  recordedBalance,
  recordedFromStored,
  withOwnCrops,
  type MovedMoney,
  type StoredFarm,
} from '../farm';
import { applyPct, type Bani } from '../money';
import { computeSubsidies, normalizeParcels, withApiaDecision, type SubsidyParams } from '../subsidies';
import { monthsUntilNextIncome, proposeAllocation } from './allocation';
import { firstDay, type MonthKey } from './dates';
import { costsByCrop, cropEconomics, springNeed } from './insights';
import { rollingYears } from './scenarios';
import { plannedFigures, withFarmerHarvest } from './seasons';
import { maxSafeSalary, salaryToPay, suggestCredit, type SmoothingOptions } from './smoothing';
import { buildTimeline, type AmountScenario, type Timeline } from './timeline';

/** Plan 12 months ahead; payments with a window are assumed late (conservative, docs/11 P13). */
export const PLAN_HORIZON_MONTHS = 12;

export interface FarmPlanOptions {
  /** First month of the plan. The caller supplies it, so this stays pure. */
  month: MonthKey;
  params?: SubsidyParams;
}

/** The stored farm as a plan reads it. Money rows can carry only what the plan needs. */
export interface PlanFarm extends Omit<StoredFarm, 'transactions'> {
  /** County code (e.g. 'TR'), for the county yield history. */
  county?: string | null;
  transactions?: MovedMoney[];
}

/**
 * The docs/data this farm plans with: its own crops are added (P30), and its own yield and price
 * replace the averages (P26, P29).
 */
export function farmData(farm: Pick<StoredFarm, 'harvests'>, data: AppData): AppData {
  const withOwn = withOwnCrops(data, farm.harvests?.ownCrops);
  const figures = plannedFigures(farm.harvests?.gathered ?? [], farm.harvests?.expected ?? []);
  return figures.length ? withFarmerHarvest(withOwn, figures) : withOwn;
}

/** Grain in the barn, minus what sold since. A sale in the crop's usual month is the new harvest. */
export function grainInBarn(
  gathered: { cropId: string; storedTonnes?: number | null }[],
  transactions: MovedMoney[],
  data: AppData,
): { id: string; crop_id: string; kg: number }[] {
  return gathered.flatMap(({ cropId, storedTonnes }) => {
    const crop = data.crops.crops.find((c) => c.id === cropId);
    if (!crop || !storedTonnes) return [];
    const sold = transactions
      .filter((t) => (t.kind === 'sale' || t.kind === 'crop_sale') && t.crop_id === cropId)
      .filter((t) => Number(t.occurred_at.slice(5, 7)) !== crop.sale_month_default)
      .reduce((sum, t) => sum + t.amount_bani, 0);
    const kg = Math.round(storedTonnes * 1000 - sold / (crop.price_lei_per_kg.mean * 100));
    return [{ id: cropId, crop_id: cropId, kg: Math.max(0, kg) }];
  });
}

const INCOME_KINDS = new Set(['apia_advance', 'apia_balance', 'crop_sale', 'sale']);

/** What we pay each month: the fixed salary, lowered only if the money would run out. */
function salaryPaid(farm: PlanFarm, safe: Bani): Bani {
  const fixed = farm.salary_bani ?? null;
  if (fixed !== null) return Math.min(fixed, safe);
  const rows = farm.transactions ?? [];
  const last = rows
    .filter((t) => t.kind === 'salary')
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0];
  const incomeSince =
    !!last && rows.some((t) => INCOME_KINDS.has(t.kind ?? '') && Date.parse(t.occurred_at) > Date.parse(last.occurred_at));
  return salaryToPay(safe, last ? -last.amount_bani : null, incomeSince);
}

/** The subsidy this farm plans with: its own payment decision when it has one, otherwise the estimate. */
export function farmSubsidies(farm: PlanFarm, data: AppData, params?: SubsidyParams) {
  const year = data.subsidies.meta.campaign_year;
  const opens = data.calendar.events.find((e) => e.id === 'apia-avans')?.start ?? '';
  const advanceReceived = (farm.transactions ?? [])
    .filter((t) => (t.kind ?? t.category) === 'apia_advance' && t.occurred_at >= opens)
    .reduce((sum, t) => sum + t.amount_bani, 0);
  return withApiaDecision(computeSubsidies(farmInputFromStored(farm, year), data, params), farm.apia_decision, year, advanceReceived);
}

/** What every timeline of a farm is built from. `data` already carries the farm's own harvest. */
export function timelineInput(farm: PlanFarm, data: AppData, params?: SubsidyParams) {
  const input = farmInputFromStored(farm, data.subsidies.meta.campaign_year);
  const subsidies = farmSubsidies(farm, data, params);
  const parcels = normalizeParcels(input.parcels);
  const startBalance =
    (farm.start_balance_bani ?? 0) + recordedBalance(farm.transactions ?? []);
  // A credit already received or repaid is in the balance, so it isn't planned again.
  const settled = new Set((farm.transactions ?? []).map((t) => t.expected_payment_id).filter(Boolean));
  const extras = extrasFromStored(farm.expected_payments ?? []).filter((x) => !settled.has(x.id));
  const recorded = recordedFromStored(farm.transactions ?? []);
  const followed = (farm.opportunity_follows ?? []).flatMap(({ opportunities: o }) =>
    o?.deadline ? [{ id: o.id, title: o.title, date: o.deadline }] : [],
  );
  const barn = farm.stored_grain ?? grainInBarn(farm.harvests?.gathered ?? [], farm.transactions ?? [], data);
  const stored = barn.map((g) => ({ id: g.id, cropId: g.crop_id, kg: g.kg }));
  return { subsidies, parcels, startBalance, extras, recorded, followed, stored };
}

/**
 * Up to data.params.long_forecast.max_years of 12-month blocks for each kind of year.
 * Each column repeats one kind of year at today's prices, costs and subsidies (P21).
 */
export function longForecast(farm: PlanFarm, baseData: AppData, { month, params }: FarmPlanOptions) {
  const data = farmData(farm, baseData);
  const input = timelineInput(farm, data, params);
  const months = data.params.long_forecast.max_years.value * 12;
  const years = (amounts: AmountScenario) =>
    rollingYears(buildTimeline(input, data, { start: month, months, timing: 'late', amounts }));
  return { bad: years('bad'), medium: years('medium'), good: years('good') };
}

/**
 * The one calculation behind every figure: the screens, the AI and the salary Stripe pays.
 * It reads the farm and docs/data alone, so it keeps working offline once the farm is cached.
 */
export function buildFarmPlan(farm: PlanFarm, baseData: AppData, { month, params }: FarmPlanOptions) {
  const data = farmData(farm, baseData);
  const { subsidies, parcels, startBalance, extras, recorded, followed, stored } = timelineInput(farm, data, params);
  const opts = { start: month, months: PLAN_HORIZON_MONTHS, timing: 'late' as const };
  const build = (amounts: AmountScenario, withExtras = true) =>
    buildTimeline(
      {
        parcels,
        subsidies,
        startBalance,
        extras: withExtras ? extras : [],
        recorded: withExtras ? recorded : [],
        stored: withExtras ? stored : [],
        followed,
      },
      data,
      { ...opts, amounts },
    );
  const timelines: Record<AmountScenario, Timeline> = {
    bad: build('bad'),
    medium: build('medium'),
    good: build('good'),
  };
  const crops = new Map(data.crops.crops.map((c) => [c.id, c]));
  const economics = parcels.flatMap((p) => {
    const crop = crops.get(p.cropId);
    return crop ? [cropEconomics(crop, p.areaAri)] : [];
  });

  const envelopes = envelopesFromStored(farm.envelopes ?? []);
  const smoothing: SmoothingOptions = { pensionMonthly: activePensionMonthly(farm.pension_plans) };
  const salary = maxSafeSalary(timelines.medium, smoothing, data);
  const credits = declaredCredits(farm.expected_payments ?? []);
  const creditSuggestion = suggestCredit(
    timelines.medium,
    smoothing,
    subsidies.totals.lei.probable,
    data,
    credits.reduce((sum, c) => sum + c.amount, 0),
  );
  const monthlySalary = salaryPaid(farm, salary.salary);
  const { split: proposal, monthsCovered } = splitMoney(timelines.medium, month, smoothing, monthlySalary, startBalance, false);

  return {
    subsidies,
    startBalance,
    timelines,
    economics,
    totalHa: parcels.reduce((s, p) => s + p.areaAri, 0) / 100,
    spring: springNeed(timelines.medium),
    costs: costsByCrop(timelines.medium),
    envelopes,
    salary,
    monthlySalary,
    salaryFixed: farm.salary_bani ?? null,
    credits,
    creditSuggestion,
    proposal,
    monthsCovered,
    smoothing,
    subsidyParams: params ?? {},
  };
}

export type FarmPlan = ReturnType<typeof buildFarmPlan>;

/**
 * What the plan expects to happen in one month that hasn't been recorded yet, for the demo clock.
 * Windows use their middle, so the APIA balance lands in March as in the pitch.
 */
export function plannedForMonth(farm: PlanFarm, baseData: AppData, month: MonthKey, params?: SubsidyParams) {
  const data = farmData(farm, baseData);
  const input = farmInputFromStored(farm, data.subsidies.meta.campaign_year);
  const { months } = buildTimeline(
    {
      parcels: normalizeParcels(input.parcels),
      subsidies: farmSubsidies(farm, data, params),
      startBalance: 0,
      recorded: recordedFromStored(farm.transactions ?? []),
    },
    data,
    { start: month, months: 1, amounts: 'medium', timing: 'mid' },
  );
  const entries = months[0]!.entries.filter((e) => e.value > 0);
  return {
    day: firstDay(month),
    income: entries.filter((e) => e.direction === 'in'),
    costs: entries.filter((e) => e.kind === 'input_cost'),
  };
}

/** Splits money across envelopes for the months it has to last. */
function splitMoney(
  t: Timeline,
  month: MonthKey,
  smoothing: SmoothingOptions,
  salary: Bani,
  amount: Bani,
  isIncome: boolean,
) {
  // Money on hand: an income later this month (e.g. the APIA advance) counts.
  // A new income is that very payment, so it has to last until the next one.
  const monthsCovered = monthsUntilNextIncome(t, month, !isIncome);
  const debtsDue = t.months
    .slice(0, monthsCovered)
    .flatMap((m) => m.entries)
    .filter((e) => e.kind === 'loan_repayment')
    .reduce((s, e) => s + e.value, 0);
  const split = proposeAllocation({
    amount,
    isIncome,
    salary,
    pensionMonthly: smoothing.pensionMonthly ?? 0,
    monthsCovered,
    debtsDue,
  });
  return { split, monthsCovered };
}

/** The split for an amount of money, using this plan's salary and set-asides. */
export function proposeSplit(plan: FarmPlan, amount: Bani, isIncome: boolean) {
  const t = plan.timelines.medium;
  return splitMoney(t, t.months[0]!.key, plan.smoothing, plan.monthlySalary, amount, isIncome);
}
