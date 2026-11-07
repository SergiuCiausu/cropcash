import type { AppData } from '../data';
import { applyPct, ceilTo, floorTo, leiToBani, type Bani } from '../money';
import type { MonthKey } from './dates';
import type { Timeline } from './timeline';

/**
 * The monthly "salary": the largest constant amount the farmer can take every month
 * so the money never runs below zero before the horizon ends. docs/07 §4.
 */

export interface SmoothingOptions {
  /** Pension contribution taken every month (bani). */
  pensionMonthly?: Bani;
}

export interface MonthFixed {
  key: MonthKey;
  pension: Bani;
}

/** Real income in a month (APIA, harvest). A credit is borrowed money, not income. */
export function monthIncome(m: Timeline['months'][number]): Bani {
  return m.entries.filter((e) => e.direction === 'in' && e.kind !== 'credit').reduce((s, e) => s + e.value, 0);
}

/** Fixed set-asides per month: the pension, every month. */
export function monthlyFixed(t: Timeline, opts: SmoothingOptions): MonthFixed[] {
  return t.months.map((m) => ({ key: m.key, pension: opts.pensionMonthly ?? 0 }));
}

/** Cumulative money available at each month end, after fixed set-asides and before salary. */
export function cumulativeAvailable(t: Timeline, opts: SmoothingOptions): Bani[] {
  const fixed = monthlyFixed(t, opts);
  let cum = t.startBalance;
  return t.months.map((m, i) => {
    const f = fixed[i]!;
    cum += m.in - m.out - f.pension;
    return cum;
  });
}

export interface SalaryResult {
  /** Monthly salary in bani, rounded down to the configured step. 0 if money runs out. */
  salary: Bani;
  /** The month that limits the salary ("din cauza lui iunie"). */
  bindingMonth: MonthKey;
  /** True when money runs out even with no salary at all. */
  deficit: boolean;
  /** Unrounded cap (bani), for explanations and tests. */
  exact: number;
}

/**
 * A salary not fixed by the farmer still holds steady: it's recalculated when real income
 * arrives, and it only drops between incomes if the money would otherwise run out (docs/07 §4).
 */
export function salaryToPay(safe: Bani, previous: Bani | null, incomeArrived: boolean): Bani {
  if (previous === null || incomeArrived || safe < previous) return safe;
  return previous;
}

export function maxSafeSalary(t: Timeline, opts: SmoothingOptions, data: AppData): SalaryResult {
  const cum = cumulativeAvailable(t, opts);
  let best = Number.POSITIVE_INFINITY;
  let binding = 0;
  cum.forEach((c, i) => {
    const cap = c / (i + 1);
    if (cap < best) {
      best = cap;
      binding = i;
    }
  });
  if (cum.length === 0) return { salary: 0, bindingMonth: '', deficit: false, exact: 0 };
  const step = leiToBani(data.params.salary_round_lei.value);
  return {
    salary: floorTo(Math.max(0, best), step),
    bindingMonth: t.months[binding]!.key,
    deficit: best < 0,
    exact: best,
  };
}

export interface BridgeCredit {
  /** Credit needed (bani), rounded up to the configured step. 0 = not needed. */
  amount: Bani;
  /** First month where money would fall short: take the credit then. */
  takeMonth: MonthKey | null;
}

/** How much credit, taken before the first short month, makes `target` salary possible. */
export function bridgeCreditNeeded(t: Timeline, opts: SmoothingOptions, target: Bani, data: AppData): BridgeCredit {
  const cum = cumulativeAvailable(t, opts);
  let need = 0;
  let first: number | null = null;
  cum.forEach((c, i) => {
    const short = (i + 1) * target - c;
    if (short > 0) {
      need = Math.max(need, short);
      first ??= i;
    }
  });
  const step = leiToBani(data.params.credit_round_lei.value);
  return { amount: need > 0 ? ceilTo(need, step) : 0, takeMonth: first === null ? null : t.months[first]!.key };
}

/** The most a credit on the APIA certificate can be, after credits already declared on it. */
export function creditCapacity(subsidyProbable: Bani, data: AppData, alreadyBorrowed: Bani = 0): Bani {
  return Math.max(0, applyPct(subsidyProbable, data.params.credit.max_pct_of_subsidy.value) - alreadyBorrowed);
}

export interface CreditSuggestion {
  /** Salary possible with the credit (bani). */
  salary: Bani;
  credit: BridgeCredit;
  /** Maximum credit on the APIA certificate (bani). */
  capacity: Bani;
}

/**
 * First month in the timeline when a credit on the APIA certificate exists: the
 * certificate is issued once the next APIA application is filed, so it is the
 * month the application window opens (from calendar data, projected yearly).
 */
export function creditAvailableFrom(t: Timeline, data: AppData): MonthKey | null {
  const cerere = data.calendar.events.find((e) => e.id === 'apia-cerere');
  if (!cerere?.start || t.months.length === 0) return null;
  const first = t.months[0]!.key;
  for (let k = 0; k <= 2; k++) {
    const key = `${Number(cerere.start.slice(0, 4)) + k}${cerere.start.slice(4, 7)}`;
    if (key >= first) return t.months.some((m) => m.key === key) ? key : null;
  }
  return null;
}

/**
 * The best salary reachable with a credit on the APIA certificate (docs/11 decision A).
 * The credit can't exceed `max_pct_of_subsidy` of the expected subsidy (also after
 * rounding) and only exists from `creditAvailableFrom`. Returns null when it doesn't help.
 */
export function suggestCredit(
  t: Timeline,
  opts: SmoothingOptions,
  subsidyProbable: Bani,
  data: AppData,
  /** Credits already declared on the same APIA certificate (bani). */
  alreadyBorrowed: Bani = 0,
): CreditSuggestion | null {
  const base = maxSafeSalary(t, opts, data);
  // A bridge credit only makes sense to get through a dip: there must be hard months,
  // and the salary must be limited by a month before the end of the plan (when the
  // limit is the last month, the farmer simply has less money, and a credit would
  // just be borrowing to spend more).
  if (t.hardMonths.length === 0 || base.bindingMonth === t.months.at(-1)?.key) return null;
  const capacity = creditCapacity(subsidyProbable, data, alreadyBorrowed);
  const from = creditAvailableFrom(t, data);
  if (capacity <= 0 || !from) return null;
  const k = t.months.findIndex((m) => m.key === from);
  const cum = cumulativeAvailable(t, opts);
  const step = leiToBani(data.params.salary_round_lei.value);

  let best = Number.POSITIVE_INFINITY;
  cum.forEach((c, i) => {
    best = Math.min(best, (c + (i >= k ? capacity : 0)) / (i + 1));
  });
  let salary = floorTo(Math.max(0, best), step);
  let credit = bridgeCreditNeeded(t, opts, salary, data);
  // Rounding the credit up must not push it over the legal maximum.
  while (salary > base.salary && credit.amount > capacity) {
    salary -= step;
    credit = bridgeCreditNeeded(t, opts, salary, data);
  }
  if (salary <= base.salary || credit.amount === 0) return null;
  // The credit can't be taken before the certificate exists.
  if (credit.takeMonth && credit.takeMonth < from) credit = { ...credit, takeMonth: from };
  return { salary, credit, capacity };
}
