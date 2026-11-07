import type { AppData, CountyYield } from '../data';
import type { Bani } from '../money';

/**
 * The "ani proști" fund (docs/07 §5). The target itself is riskFundTarget() in
 * cashflow/insights (normal year minus bad year over the next 12 months).
 */

export interface RiskFundProgress {
  saved: Bani;
  target: Bani;
  /** What is still missing (0 once the target is reached). */
  missing: Bani;
  /** Progress in percent, 0–100, whole number. */
  pct: number;
  done: boolean;
}

export function riskFundProgress(saved: Bani, target: Bani): RiskFundProgress {
  const missing = Math.max(0, target - saved);
  const pct = target > 0 ? Math.min(100, Math.floor((saved * 100) / target)) : 100;
  return { saved, target, missing, pct, done: missing === 0 };
}

/**
 * How much of an income goes to the fund: pct of it, but never more than what is
 * still missing (P5).
 */
export function riskShareOfIncome(income: Bani, pctOfInflow: number, missing: Bani): Bani {
  if (income <= 0 || missing <= 0) return 0;
  return Math.min(missing, Math.round((income * pctOfInflow) / 100));
}

export interface BadYears {
  county: string;
  cropId: string;
  bad: number;
  total: number;
}

/**
 * How many of the last `windowYears` years were bad for a crop in a county: production
 * below thresholdPct of the mean over the same years. null without enough INS data
 * (county_history is DE-VERIFICAT, so the app never invents "3 din 10").
 */
export function badYears(
  history: CountyYield[],
  county: string,
  cropId: string,
  thresholdPct: number,
  windowYears: number,
): BadYears | null {
  const byYear = new Map<number, number>();
  for (const h of history) {
    if (h.county === county && h.crop_id === cropId) byYear.set(h.year, h.yield_t_per_ha);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a).slice(0, windowYears);
  if (years.length < windowYears) return null;
  const yields = years.map((y) => byYear.get(y)!);
  const mean = yields.reduce((s, v) => s + v, 0) / yields.length;
  const bad = yields.filter((v) => v * 100 < mean * thresholdPct).length;
  return { county, cropId, bad, total: years.length };
}

/** The riskiest of the farm's crops in its county (the one with most bad years), or null. */
export function worstBadYears(data: AppData, county: string | null | undefined, cropIds: string[]): BadYears | null {
  if (!county) return null;
  const p = data.params.bad_year;
  const found = [...new Set(cropIds)]
    .map((c) => badYears(data.crops.county_history.data, county, c, p.threshold_pct_of_mean.value, p.window_years.value))
    .filter((b): b is BadYears => b !== null);
  return found.sort((a, b) => b.bad - a.bad)[0] ?? null;
}
