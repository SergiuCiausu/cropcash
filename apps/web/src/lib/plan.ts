import { useMemo } from 'react';
import {
  buildTimeline,
  computeSubsidies,
  costsByCrop,
  cropEconomics,
  declaredCredits,
  envelopesFromStored,
  extrasFromStored,
  farmInputFromStored,
  loadData,
  maxSafeSalary,
  monthsUntilNextIncome,
  normalizeParcels,
  proposeAllocation,
  riskFundTarget,
  springNeed,
  suggestCredit,
  type AmountScenario,
  type SmoothingOptions,
  type StoredFarm,
  type Timeline,
} from '@cropcash/shared';
import { currentMonthKey } from './format';

const data = loadData();
/** Plan 12 months ahead; payments with a window are assumed late (conservative, docs/11 P13). */
const HORIZON_MONTHS = 12;

export interface Farm extends StoredFarm {
  name: string;
  county: string;
}

/**
 * Everything the screens show, computed on the device from the farm and docs/data.
 * No network: keeps working offline once the farm is cached.
 */
export function useFarmPlan(farm: Farm) {
  return useMemo(() => {
    const input = farmInputFromStored(farm, data.subsidies.meta.campaign_year);
    const subsidies = computeSubsidies(input, data);
    const parcels = normalizeParcels(input.parcels);
    const startBalance = farm.start_balance_bani ?? 0;
    const extras = extrasFromStored(farm.expected_payments ?? []);
    const month = currentMonthKey();
    const opts = { start: month, months: HORIZON_MONTHS, timing: 'late' as const };
    const build = (amounts: AmountScenario, withExtras = true) =>
      buildTimeline({ parcels, subsidies, startBalance, extras: withExtras ? extras : [] }, data, { ...opts, amounts });
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

    // ── Step 5: envelopes, salary, credit ───────────────────────────────────
    const envelopes = envelopesFromStored(farm.envelopes ?? []);
    // The fund size compares years without declared credits (they are the same in both).
    const riskTarget = riskFundTarget(build('medium', false), build('bad', false));
    const smoothing: SmoothingOptions = {
      pensionMonthly: 0, // the pension plan comes in step 7
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
    const proposal = proposeAllocation({
      amount: startBalance,
      isIncome: false,
      salary: salary.salary,
      pensionMonthly: smoothing.pensionMonthly ?? 0,
      riskPct: smoothing.riskPct ?? 0,
      riskRemaining: smoothing.riskRemaining ?? 0,
      monthsCovered,
      debtsDue,
    });

    return {
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
    };
  }, [farm]);
}

export type FarmPlan = ReturnType<typeof useFarmPlan>;

export const cropName = (id?: string) => data.crops.crops.find((c) => c.id === id)?.name_ro ?? '';
export const countyName = (code: string) => data.counties.counties.find((c) => c.code === code)?.name_ro ?? code;
export const eventTitle = (id?: string) => data.calendar.events.find((e) => e.id === id)?.title_ro ?? '';
