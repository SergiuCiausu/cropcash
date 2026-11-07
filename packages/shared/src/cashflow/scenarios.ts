import type { AppData, Crop } from '../data';
import type { Bani } from '../money';
import type { MonthKey } from './dates';
import { maxSafeSalary, type SalaryResult, type SmoothingOptions } from './smoothing';
import type { AmountScenario, Timeline } from './timeline';

/**
 * Scenario views (docs/07 §5, screens Î1 and Î4). Pure: the phone recomputes them
 * offline when the farmer flips good / normal / drought or moves a slider.
 */

export const SCENARIOS: AmountScenario[] = ['good', 'medium', 'bad'];

/** The safe monthly salary in each kind of year. */
export function salaryByScenario(
  timelines: Record<AmountScenario, Timeline>,
  opts: SmoothingOptions,
  data: AppData,
): Record<AmountScenario, SalaryResult> {
  return {
    good: maxSafeSalary(timelines.good, opts, data),
    medium: maxSafeSalary(timelines.medium, opts, data),
    bad: maxSafeSalary(timelines.bad, opts, data),
  };
}

export interface QuarterPlan {
  /** "2027-T1" */
  key: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  /** Months of this quarter inside the horizon (the first one can be partial). */
  months: number;
  in: Bani;
  out: Bani;
  net: Bani;
  /** Farm balance at the end of the quarter (no salary, no envelopes). */
  balanceEnd: Bani;
}

export interface YearPlan {
  year: number;
  in: Bani;
  out: Bani;
  net: Bani;
}

/** Months from `start` to the end of the year `years - 1` years later ("this year + 2" = 3). */
export function monthsToYearEnd(start: string, years: number): number {
  const m = Number(start.slice(5, 7));
  return (years - 1) * 12 + (12 - m + 1);
}

/** Groups a (long) timeline by calendar quarter. */
export function quarterlyProjection(t: Timeline): QuarterPlan[] {
  const out: QuarterPlan[] = [];
  for (const m of t.months) {
    const year = Number(m.key.slice(0, 4));
    const quarter = (Math.floor((Number(m.key.slice(5, 7)) - 1) / 3) + 1) as QuarterPlan['quarter'];
    const key = `${year}-T${quarter}`;
    let q = out.at(-1);
    if (!q || q.key !== key) {
      q = { key, year, quarter, months: 0, in: 0, out: 0, net: 0, balanceEnd: 0 };
      out.push(q);
    }
    q.months += 1;
    q.in += m.in;
    q.out += m.out;
    q.net += m.net;
    q.balanceEnd = m.balanceEnd;
  }
  return out;
}

export function yearlyTotals(quarters: QuarterPlan[]): YearPlan[] {
  const out: YearPlan[] = [];
  for (const q of quarters) {
    let y = out.at(-1);
    if (!y || y.year !== q.year) {
      y = { year: q.year, in: 0, out: 0, net: 0 };
      out.push(y);
    }
    y.in += q.in;
    y.out += q.out;
    y.net += q.net;
  }
  return out;
}

/* ── Î4: selling the harvest ─────────────────────────────────────────────── */

export interface SaleForecastInput {
  /** Price in bani per kg (e.g. 105 = 1,05 lei/kg). */
  priceBaniPerKg: number;
  /** Yield in kg per hectare (e.g. 5000 = 5 t/ha). */
  yieldKgPerHa: number;
}

export interface SaleForecast {
  productionKg: number;
  income: Bani;
  /** Mean cost of the crop on this area (crops-reference.json). */
  cost: Bani;
  /** income − cost; negative = loss. */
  margin: Bani;
  /** Price per kg at which this harvest pays the costs, in bani (rounded up). */
  breakEvenPerKg: number;
}

/** Slider bounds and defaults from crops-reference.json (min / mean / max). */
export function saleRanges(crop: Crop) {
  const kg = (t: number) => Math.round(t * 1000);
  const bani = (lei: number) => Math.round(lei * 100);
  return {
    price: { min: bani(crop.price_lei_per_kg.min), mean: bani(crop.price_lei_per_kg.mean), max: bani(crop.price_lei_per_kg.max) },
    yield: { min: kg(crop.yield_t_per_ha.min), mean: kg(crop.yield_t_per_ha.mean), max: kg(crop.yield_t_per_ha.max) },
  };
}

export function saleForecast(crop: Crop, areaAri: number, input: SaleForecastInput): SaleForecast {
  for (const [k, v] of Object.entries(input)) {
    if (!Number.isSafeInteger(v) || v < 0) throw new Error(`${k} must be a non-negative integer, got ${v}`);
  }
  const productionKg = Math.round((areaAri * input.yieldKgPerHa) / 100);
  const income = productionKg * input.priceBaniPerKg;
  const cost = Math.round(areaAri * crop.cost_lei_per_ha.mean);
  return {
    productionKg,
    income,
    cost,
    margin: income - cost,
    breakEvenPerKg: productionKg > 0 ? Math.ceil(cost / productionKg) : 0,
  };
}

/** One 12-month block from the plan's first month, so no block is a partial calendar year. */
export interface RollingYear {
  from: MonthKey;
  to: MonthKey;
  in: Bani;
  out: Bani;
  /** What comes in minus what goes out, before salary and pension. */
  left: Bani;
}

export function rollingYears(timeline: Timeline): RollingYear[] {
  const years: RollingYear[] = [];
  for (let i = 0; i + 12 <= timeline.months.length; i += 12) {
    const block = timeline.months.slice(i, i + 12);
    const total = block.reduce((sum, m) => ({ in: sum.in + m.in, out: sum.out + m.out }), { in: 0, out: 0 });
    years.push({ from: block[0]!.key, to: block[11]!.key, ...total, left: total.in - total.out });
  }
  return years;
}

/** The first `count` years added up. */
export function firstYearsTotal(years: RollingYear[], count: number) {
  return years.slice(0, count).reduce(
    (sum, y) => ({ in: sum.in + y.in, out: sum.out + y.out, left: sum.left + y.left }),
    { in: 0, out: 0, left: 0 },
  );
}
