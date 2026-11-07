import type { AppData } from '../data';
import { leiToBani, type Bani } from '../money';

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
export function simulatePension(age: number, monthly: Bani, params: PensionParams): PensionSimulation | null {
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

/**
 * Suggested contribution: at most N% of the monthly salary, rounded down to round_lei,
 * kept inside the slider range (P7).
 */
export function suggestPension(salary: Bani, params: PensionParams): Bani {
  const step = leiToBani(params.roundLei);
  const raw = Math.floor((salary * params.suggestMaxPctOfSalary) / 100 / step) * step;
  return Math.min(leiToBani(params.sliderMaxLei), Math.max(leiToBani(params.sliderMinLei), raw));
}
