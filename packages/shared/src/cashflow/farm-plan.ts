import { isFallow, type AppData } from '../data';
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
import { gatheredWithLoss, lossShareFor, type AppliedLoss } from '../farm/crop-loss';
import { isOwnCrop } from '../farm/own-crops';
import { withCountyYields } from './county-yields';
import { costsByCrop, cropEconomics, payrollShortMonths, springNeed } from './insights';
import { rollingYears } from './scenarios';
import { plannedFigures, withFarmerHarvest } from './seasons';
import { maxSafeSalary, salaryToPay, suggestCredit, type SmoothingOptions } from './smoothing';
import { buildTimeline, nextHarvestYear, type AmountScenario, type ContractsInput, type RentInput, type Timeline } from './timeline';
import { taxProfileOf, type TaxProfile } from '../contracts/taxes';
import { dieselFromTransactions, exciseRefundClaims, type StoredExciseEnrollment } from './excise';

/**
 * The day of a payment window the plan counts on. The last day by default, so the plan holds when the
 * money comes late (plan-params.json forecast.apia_day, docs/11 P13).
 */
export const planTiming = (data: AppData) => data.params.forecast.apia_day.plan;

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
  /**
   * The farm's legal form, VAT status and micro tax, for the contracts' taxes (taxes.ts). Left out, it's read from
   * the row's `legal_form` / `vat_status` / `micro_tax` (migration 049). Until the farmer answers, VAT on what the
   * farm pays counts as a cost (the safe side: not got back), and VAT on its sales and the micro tax have no amount
   * and stay out of the plan.
   */
  tax_profile?: TaxProfile;
  /** The excise schemes the farm joined (migration 052). An approved diesel acord puts the refund in the plan. */
  farm_excise_schemes?: StoredExciseEnrollment[];
}

/**
 * The docs/data this farm plans with: its own crops are added (P30), yields come from its county's
 * history, and its own yield and price replace those (P26, P29).
 */
export function farmData(farm: Pick<StoredFarm, 'harvests'> & { county?: string | null }, data: AppData): AppData {
  const withOwn = withCountyYields(withOwnCrops(data, farm.harvests?.ownCrops), farm.county);
  /* Yield per harvested hectare: the year's lost hectares come off the gathered area. */
  const gathered = farm.harvests ? gatheredWithLoss(farm.harvests) : [];
  const figures = plannedFigures(gathered, farm.harvests?.expected ?? []);
  return figures.length ? withFarmerHarvest(withOwn, figures) : withOwn;
}

/**
 * The share of each crop the plan takes as lost, per harvest year (docs/crop-loss-plan.md).
 * A loss the farmer already reported for that year always counts: those hectares are gone.
 * Their usual share and the farm's history count only when the yield is the farmer's own
 * (gathered, expected, or an own crop). A county yield may already include lost fields (P33).
 */
export function farmLossShare(farm: Pick<StoredFarm, 'harvests'>, data: AppData): ((cropId: string, harvestYear: number) => number) | undefined {
  const loss = farmLoss(farm, data);
  return loss && ((cropId, year) => {
    const l = loss(cropId, year);
    return l.applied ? l.share : 0;
  });
}

/** The same, with where the share comes from, for the screens and the assistant to say it. */
export function farmLoss(farm: Pick<StoredFarm, 'harvests'>, data: AppData): ((cropId: string, harvestYear: number) => AppliedLoss) | undefined {
  const harvests = farm.harvests;
  if (!harvests?.years.length) return undefined;
  const ownYield = new Set(
    plannedFigures(gatheredWithLoss(harvests), harvests.expected ?? [])
      .filter((f) => f.yieldTPerHa != null)
      .map((f) => f.cropId),
  );
  const params = data.params.crop_loss;
  return (cropId, year) => {
    const loss = lossShareFor(harvests, cropId, year, params);
    return { ...loss, applied: loss.basis === 'this_year' || ownYield.has(cropId) || isOwnCrop(cropId) };
  };
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
  const fe = data.params.farmer_events;
  const farmerEvents = farm.farm_events?.length
    ? { events: farm.farm_events, carryDays: fe.carry_days.value, wholeHarvestWindowMonths: fe.whole_harvest_window_months.value }
    : undefined;
  const lossShare = farmLossShare(farm, data);
  const employees = farm.employees ?? [];
  const rent: RentInput = {
    contracts: farm.lease_contracts ?? [],
    county: farm.county ?? null,
    owners: Object.fromEntries((farm.landowners ?? []).map((o) => [o.id, o.name])),
  };
  const contracts: ContractsInput = {
    contracts: farm.contracts ?? [],
    payments: farm.contract_payments ?? [],
    parties: Object.fromEntries((farm.parties ?? []).map((p) => [p.id, p])),
    profile: farm.tax_profile ?? taxProfileOf(farm),
  };
  const exciseRefunds = farm.farm_excise_schemes?.length
    ? exciseRefundClaims(
        {
          enrollments: farm.farm_excise_schemes,
          diesel: dieselFromTransactions(farm.transactions ?? []),
          crops: (input.parcels ?? []).filter((p) => !isFallow(p.cropId)).map((p) => ({ cropId: p.cropId, areaHa: p.areaHa })),
        },
        data,
      )
    : [];
  return { subsidies, parcels, startBalance, extras, recorded, followed, stored, farmerEvents, lossShare, employees, rent, contracts, exciseRefunds };
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
    rollingYears(buildTimeline(input, data, { start: month, months, timing: planTiming(data), amounts }));
  return { bad: years('bad'), medium: years('medium'), good: years('good') };
}

/**
 * A bad harvest doesn't show when it comes: it shows in the months before the next one. This runs the
 * bad year long enough to reach them (forecast.after_bad_harvest_months). `lowest` is before salary
 * and pension, as on Prognoză. Null when no harvest is planned in that time.
 */
export function afterBadHarvest(farm: PlanFarm, baseData: AppData, { month, params }: FarmPlanOptions) {
  const data = farmData(farm, baseData);
  const input = timelineInput(farm, data, params);
  const months = data.params.forecast.after_bad_harvest_months.value;
  const run = (amounts: AmountScenario) =>
    buildTimeline(input, data, { start: month, months, timing: planTiming(data), amounts });
  const bad = run('bad');
  const firstSale = bad.months.findIndex((m) => m.entries.some((e) => e.kind === 'crop_sale' && e.id.startsWith('sale:')));
  if (firstSale < 0) return null;
  const after = bad.months.slice(firstSale);
  const low = after.reduce((lowest, m) => (m.balanceEnd < lowest.balanceEnd ? m : lowest), after[0]!);
  const smoothing = { pensionMonthly: activePensionMonthly(farm.pension_plans) };
  return {
    months,
    harvestMonth: bad.months[firstSale]!.key,
    lowest: { key: low.key, balance: low.balanceEnd },
    missing: Math.max(0, -low.balanceEnd),
    salary: maxSafeSalary(bad, smoothing, data).salary,
    normalSalary: maxSafeSalary(run('medium'), smoothing, data).salary,
  };
}

/**
 * The one calculation behind every figure: the screens, the AI and the salary Stripe pays.
 * It reads the farm and docs/data alone, so it keeps working offline once the farm is cached.
 */
export function buildFarmPlan(farm: PlanFarm, baseData: AppData, { month, params }: FarmPlanOptions) {
  const data = farmData(farm, baseData);
  const { subsidies, parcels, startBalance, extras, recorded, followed, stored, farmerEvents, lossShare, employees, rent, contracts, exciseRefunds } = timelineInput(farm, data, params);
  const opts = { start: month, months: data.params.forecast.plan_months.value, timing: planTiming(data) };
  const build = (amounts: AmountScenario, withExtras = true) =>
    buildTimeline(
      {
        parcels,
        subsidies,
        startBalance,
        extras: withExtras ? extras : [],
        recorded: withExtras ? recorded : [],
        stored: withExtras ? stored : [],
        farmerEvents: withExtras ? farmerEvents : undefined,
        followed,
        lossShare,
        employees,
        rent,
        contracts,
        exciseRefunds,
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
  const lossOf = farmLoss(farm, data);
  const economics = parcels.flatMap((p) => {
    const crop = crops.get(p.cropId);
    if (!crop || isFallow(crop)) return [];
    const loss = lossOf?.(crop.id, nextHarvestYear(crop, month));
    return [{ ...cropEconomics(crop, p.areaAri, loss?.applied ? loss.share : 0), ...(loss ? { loss } : {}) }];
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
    /** Months whose balance goes below zero with the people's pay in them, in a normal year (bad year below). */
    payrollShort: { medium: payrollShortMonths(timelines.medium), bad: payrollShortMonths(timelines.bad) },
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
      lossShare: farmLossShare(farm, data),
    },
    data,
    { start: month, months: 1, amounts: 'medium', timing: data.params.forecast.apia_day.demo_clock },
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
  const payrollDue = t.months
    .slice(0, monthsCovered)
    .flatMap((m) => m.entries)
    .filter((e) => e.kind === 'payroll')
    .reduce((s, e) => s + e.value, 0);
  const split = proposeAllocation({
    amount,
    isIncome,
    salary,
    pensionMonthly: smoothing.pensionMonthly ?? 0,
    monthsCovered,
    debtsDue,
    payrollDue,
  });
  return { split, monthsCovered };
}

/** The split for an amount of money, using this plan's salary and set-asides. */
export function proposeSplit(plan: FarmPlan, amount: Bani, isIncome: boolean) {
  const t = plan.timelines.medium;
  return splitMoney(t, t.months[0]!.key, plan.smoothing, plan.monthlySalary, amount, isIncome);
}
