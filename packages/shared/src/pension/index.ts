import type { AppData, PensionFund } from '../data';
import { applyPct, floorTo, leiToBani, type Bani } from '../money';

/** Monthly contributions with monthly compounding (docs/05 section 4). */
export interface PensionInput {
  age: number;
  monthly: Bani;
  annualPct: number;
  targetAge: number;
}

export interface PensionResult {
  months: number;
  paidIn: Bani;
  total: Bani;
  /** The total spread over as many months as it took to save. An illustration, not an annuity. */
  monthlyEquivalent: Bani;
}

export function simulatePension({ age, monthly, annualPct, targetAge }: PensionInput): PensionResult {
  const months = Math.max(0, (targetAge - age) * 12);
  const rate = annualPct / 100 / 12;
  const factor = rate === 0 ? months : ((1 + rate) ** months - 1) / rate;
  const total = Math.round(monthly * factor);
  return {
    months,
    paidIn: monthly * months,
    total,
    monthlyEquivalent: months === 0 ? 0 : Math.round(total / months),
  };
}

export interface PensionMinimum {
  amount: Bani;
  fund: PensionFund | null;
  /** False when the chosen fund's minimum is unconfirmed or missing. */
  verified: boolean;
}

/**
 * The least that can go in each month: the chosen fund's own minimum, or our default suggestion
 * when no fund is chosen or the fund's figure is missing.
 */
export function pensionMinimum(data: AppData, fundId?: string | null): PensionMinimum {
  const fund = data.pensionFunds.funds.find((f) => f.id === fundId) ?? null;
  const lei = fund?.min_monthly_lei ?? data.params.pension_suggest_min_lei.value;
  return { amount: leiToBani(lei), fund, verified: !fund || fund.status !== 'DE-VERIFICAT' };
}

export interface PensionSuggestion extends PensionMinimum {
  monthly: Bani;
  /** True when the minimum pushes the suggestion past the usual share of the salary. */
  aboveShare: boolean;
}

/**
 * The usual share of the salary, rounded down, but never less than the minimum: an amount the
 * fund would refuse is no use. With no salary there's nothing to suggest.
 */
export function suggestPension(salary: Bani, data: AppData, fundId?: string | null): PensionSuggestion {
  const minimum = pensionMinimum(data, fundId);
  if (salary <= 0) return { ...minimum, monthly: 0, aboveShare: false };
  const share = applyPct(salary, data.params.pension_suggest_max_pct_of_salary.value);
  const rounded = floorTo(share, leiToBani(data.params.pension_round_lei.value));
  const monthly = Math.max(rounded, minimum.amount);
  return { ...minimum, monthly, aboveShare: monthly > share };
}

// Slider scenarios used by the money cards (low, probable, high).
/**
 * Old-age savings simulation (docs/05 §4). Illustrative only: the returns are product
 * assumptions from plan-params.json (P6), not promises.
 */

export type ReturnScenario = 'low' | 'probable' | 'high';

export interface PensionParams {
  targetAge: number;
  returnsPct: Record<ReturnScenario, number>;
  payoutYears: number;
  roundLei: number;
  sliderMinLei: number;
  sliderMaxLei: number;
  sliderStepLei: number;
  suggestMaxPctOfSalary: number;
}

export function pensionParams(data: AppData): PensionParams {
  const p = data.params.pension;
  return {
    targetAge: p.target_age.value,
    returnsPct: {
      low: p.annual_return_pct.low,
      probable: p.annual_return_pct.probable,
      high: p.annual_return_pct.high,
    },
    payoutYears: p.payout_years.value,
    roundLei: p.round_lei.value,
    sliderMinLei: p.slider_min_lei.value,
    sliderMaxLei: p.slider_max_lei.value,
    sliderStepLei: p.slider_step_lei.value,
    suggestMaxPctOfSalary: data.params.pension_suggest_max_pct_of_salary.value,
  };
}

/**
 * Value after `months` monthly contributions paid at the end of each month, with
 * monthly compounding at annualPct / 12. Integer bani: interest is rounded every month,
 * so the result stays within a few bani of C × ((1 + i)^n − 1) / i.
 */
export function futureValue(monthly: Bani, months: number, annualPct: number): Bani {
  if (!Number.isSafeInteger(monthly) || monthly < 0) throw new Error(`monthly must be a non-negative integer, got ${monthly}`);
  let balance = 0;
  for (let k = 0; k < months; k++) {
    balance += Math.round((balance * annualPct) / 1200) + monthly;
  }
  return balance;
}

export interface PensionSimulation {
  /** Months left until the target age. */
  months: number;
  /** What the farmer puts in himself. */
  paidIn: Bani;
  /** Value at the target age, per return scenario. */
  atTarget: Record<ReturnScenario, Bani>;
  /** "Most likely" value spread over payoutYears, per month (a simple illustration). */
  perMonthAfter: Bani;
}

/** null when the farmer is already at or past the target age. */
export function simulatePensionScenarios(age: number, monthly: Bani, params: PensionParams): PensionSimulation | null {
  const months = (params.targetAge - age) * 12;
  if (months <= 0) return null;
  const fv = (s: ReturnScenario) => futureValue(monthly, months, params.returnsPct[s]);
  const atTarget = { low: fv('low'), probable: fv('probable'), high: fv('high') };
  return {
    months,
    paidIn: monthly * months,
    atTarget,
    perMonthAfter: Math.round(atTarget.probable / (params.payoutYears * 12)),
  };
}

/** One point a year on the way to the target age, for the pension chart. */
export interface PensionPathPoint {
  age: number;
  /** What the farmer has put in by this age. */
  paidIn: Bani;
  /** Value at this age, per return scenario. */
  value: Record<ReturnScenario, Bani>;
}

/**
 * The same sums as simulatePensionScenarios, year by year: the first point is today (all 0),
 * the last one is the target age and equals atTarget. Empty at or past the target age.
 */
export function pensionPath(age: number, monthly: Bani, params: PensionParams): PensionPathPoint[] {
  const years = params.targetAge - age;
  if (years <= 0) return [];
  if (!Number.isSafeInteger(monthly) || monthly < 0) throw new Error(`monthly must be a non-negative integer, got ${monthly}`);
  const scenarios: ReturnScenario[] = ['low', 'probable', 'high'];
  const balance: Record<ReturnScenario, Bani> = { low: 0, probable: 0, high: 0 };
  const points: PensionPathPoint[] = [{ age, paidIn: 0, value: { ...balance } }];
  for (let year = 1; year <= years; year++) {
    for (let m = 0; m < 12; m++) {
      for (const sc of scenarios) balance[sc] += Math.round((balance[sc] * params.returnsPct[sc]) / 1200) + monthly;
    }
    points.push({ age: age + year, paidIn: monthly * 12 * year, value: { ...balance } });
  }
  return points;
}

/**
 * Suggested contribution: at most N% of the monthly salary, rounded down to round_lei,
 * kept inside the slider range (P7).
 */
export function suggestSliderPension(salary: Bani, params: PensionParams): Bani {
  const step = leiToBani(params.roundLei);
  const raw = Math.floor((salary * params.suggestMaxPctOfSalary) / 100 / step) * step;
  return Math.min(leiToBani(params.sliderMaxLei), Math.max(leiToBani(params.sliderMinLei), raw));
}

export * from './options';
