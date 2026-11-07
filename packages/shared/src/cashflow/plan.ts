import type { AppData } from '../data';
import { computeSubsidies, normalizeParcels } from '../subsidies';
import {
  declaredCredits,
  envelopesFromStored,
  extrasFromStored,
  farmInputFromStored,
  type StoredFarm,
} from '../farm';
import { proposeAllocation, monthsUntilNextIncome } from './allocation';
import { costsByCrop, cropEconomics, riskFundTarget, springNeed } from './insights';
import { maxSafeSalary, suggestCredit, type SmoothingOptions } from './smoothing';
import { buildTimeline, costEntryId, type AmountScenario, type ReceivedIncome, type Timeline } from './timeline';

/** A money movement recorded through Stripe (DB `transactions`). */
export interface StoredTransaction {
  amount_bani: number;
  kind: 'apia_advance' | 'apia_balance' | 'crop_sale' | 'salary' | 'pension' | 'expense' | null;
  occurred_at: string;
  crop_id?: string | null;
}

export interface PlanFarm extends StoredFarm {
  demo_now?: string | null;
  transactions?: StoredTransaction[];
  pension_plans?: { monthly_bani: number; status: string } | { monthly_bani: number; status: string }[] | null;
}

/** Plan 12 months ahead; payments with a window are assumed late (conservative, docs/11 P13). */
export const HORIZON_MONTHS = 12;

const pad = (n: number) => String(n).padStart(2, '0');

/** "Today" for the plan: the demo clock when there is one, otherwise the real date (local). */
export function planToday(farm: PlanFarm, realNow = new Date()): { today: string; month: string } {
  const d = farm.demo_now ? new Date(farm.demo_now) : realNow;
  const today = farm.demo_now
    ? d.toISOString().slice(0, 10)
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { today, month: today.slice(0, 7) };
}

export function pensionMonthly(farm: PlanFarm): number {
  const p = Array.isArray(farm.pension_plans) ? farm.pension_plans[0] : farm.pension_plans;
  return p && p.status === 'active' ? p.monthly_bani : 0;
}

/**
 * Everything the app shows about a farm, from the stored farm and docs/data.
 * Pure: the web computes it on the device (offline) and the API computes the same
 * numbers when it pays the monthly salary.
 */
export function computeFarmPlan(farm: PlanFarm, data: AppData, realNow = new Date()) {
  const { today, month } = planToday(farm, realNow);
  const input = farmInputFromStored(farm, data.subsidies.meta.campaign_year);
  const subsidies = computeSubsidies(input, data);
  const parcels = normalizeParcels(input.parcels);
  const transactions = farm.transactions ?? [];
  const startBalance = (farm.start_balance_bani ?? 0) + transactions.reduce((s, t) => s + t.amount_bani, 0);
  const received: ReceivedIncome[] = transactions
    .filter((t) => t.kind === 'apia_advance' || t.kind === 'apia_balance' || t.kind === 'crop_sale')
    .map((t) => ({
      kind: t.kind as ReceivedIncome['kind'],
      date: t.occurred_at.slice(0, 10),
      cropId: t.crop_id ?? undefined,
    }));
  // Farm costs already paid (recorded when the demo clock moves) are not planned again.
  const paidCostIds = new Set(
    transactions
      .filter((t) => t.kind === 'expense' && t.crop_id)
      .map((t) => costEntryId(t.crop_id!, t.occurred_at.slice(0, 10))),
  );
  const extras = extrasFromStored(farm.expected_payments ?? []);
  const opts = { start: month, months: HORIZON_MONTHS, timing: 'late' as const };
  const build = (amounts: AmountScenario, withExtras = true) =>
    buildTimeline({ parcels, subsidies, startBalance, received, paidCostIds, extras: withExtras ? extras : [] }, data, {
      ...opts,
      amounts,
    });
  const timelines: Record<AmountScenario, Timeline> = { bad: build('bad'), medium: build('medium'), good: build('good') };
  const crops = new Map(data.crops.crops.map((c) => [c.id, c]));
  const economics = parcels.flatMap((p) => {
    const crop = crops.get(p.cropId);
    return crop ? [cropEconomics(crop, p.areaAri)] : [];
  });

  const envelopes = envelopesFromStored(farm.envelopes ?? []);
  // The fund size compares years without declared credits (they are the same in both).
  const riskTarget = riskFundTarget(build('medium', false), build('bad', false));
  const smoothing: SmoothingOptions = {
    pensionMonthly: pensionMonthly(farm),
    riskPct: data.params.risk_fund_pct_of_inflow.value,
    riskRemaining: Math.max(0, riskTarget - envelopes.risk_fund),
  };
  const salary = maxSafeSalary(timelines.medium, smoothing, data);
  const credits = declaredCredits(farm.expected_payments ?? []);
  const creditSuggestion = suggestCredit(
    timelines.medium,
    smoothing,
    subsidies.totals.lei.probable,
    data,
    credits.reduce((sum, c) => sum + c.amount, 0),
  );
  // Splitting money on hand: an income later this month (e.g. the APIA advance) counts.
  const monthsCovered = monthsUntilNextIncome(timelines.medium, month, true);
  const debtsDue = timelines.medium.months
    .slice(0, monthsCovered)
    .flatMap((m) => m.entries)
    .filter((e) => e.kind === 'loan_repayment')
    .reduce((s, e) => s + e.value, 0);
  // The bad-year fund gets its share of every income received (APIA, harvest), not of the
  // money the farmer started with (docs/11 P16).
  const incomeReceived = transactions
    .filter((t) => t.kind === 'apia_advance' || t.kind === 'apia_balance' || t.kind === 'crop_sale')
    .reduce((s, t) => s + t.amount_bani, 0);
  const proposal = proposeAllocation({
    amount: startBalance,
    isIncome: false,
    incomeForRisk: incomeReceived,
    salary: salary.salary,
    pensionMonthly: smoothing.pensionMonthly ?? 0,
    riskPct: smoothing.riskPct ?? 0,
    riskRemaining: smoothing.riskRemaining ?? 0,
    monthsCovered,
    debtsDue,
  });

  return {
    today,
    month,
    subsidies,
    startBalance,
    timelines,
    economics,
    totalHa: parcels.reduce((s, p) => s + p.areaAri, 0) / 100,
    riskTarget,
    spring: springNeed(timelines.medium),
    costs: costsByCrop(timelines.medium),
    envelopes,
    salary,
    credits,
    creditSuggestion,
    proposal,
    monthsCovered,
    riskPct: smoothing.riskPct ?? 0,
    pensionMonthly: smoothing.pensionMonthly ?? 0,
    received,
    transactions,
  };
}

export type FarmPlan = ReturnType<typeof computeFarmPlan>;
