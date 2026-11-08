/* The month-by-month money chart on Prognoză and Acasă: its rows and words (web/legacy/chart.js).
   The drawing is components/app/FarmChart.tsx. */
import type { FarmPlan } from '../../../packages/shared/src/functions/plan';

export type Year = 'bad' | 'medium' | 'good';
export const YEARS: [Year, string][] = [
  ['bad', 'An slab'],
  ['medium', 'An normal'],
  ['good', 'An bun'],
];

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const SHORT = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
const monthNo = (key: string) => +key.split('-')[1] - 1;
export const monthName = (key: string) => `${MONTHS[monthNo(key)]} ${key.slice(0, 4)}`;
export const yearName = (k: Year) => YEARS.find(([y]) => y === k)![1];

/** One point: the short month under the axis, its full name, the chosen year's balance, and all three. */
export interface ChartRow {
  m: string;
  long: string;
  v: number;
  bad: number;
  medium: number;
  good: number;
}

export function chartRows(plan: Pick<FarmPlan, 'timelines'>, year: Year): ChartRow[] {
  const pick = (k: Year) => plan.timelines[k].months.map((m) => m.balanceEnd);
  const bad = pick('bad');
  const medium = pick('medium');
  const good = pick('good');
  const chosen = pick(year);
  return plan.timelines[year].months.map((m, i) => ({ m: SHORT[monthNo(m.key)], long: monthName(m.key), v: chosen[i], bad: bad[i], medium: medium[i], good: good[i] }));
}

/** A crop has no balance of its own, so its line is what it has brought in less what it has cost so far. */
export function cropChartRows(plan: Pick<FarmPlan, 'timelines'>, months: (t: FarmPlan['timelines'][Year]) => { key: string; in: number; out: number }[], year: Year): ChartRow[] {
  const running = (k: Year) => {
    let sum = 0;
    return months(plan.timelines[k]).map((m) => (sum += m.in - m.out));
  };
  const bad = running('bad');
  const medium = running('medium');
  const good = running('good');
  const chosen = running(year);
  return months(plan.timelines[year]).map((m, i) => ({ m: SHORT[monthNo(m.key)], long: monthName(m.key), v: chosen[i], bad: bad[i], medium: medium[i], good: good[i] }));
}

/** The two years not chosen, highest at the end first, so their names sit above and below the lines. */
export const otherYears = (rows: ChartRow[], year: Year): Year[] =>
  YEARS.map(([k]) => k)
    .filter((k) => k !== year)
    .sort((a, b) => rows[rows.length - 1][b] - rows[rows.length - 1][a]);

export const lowest = (rows: ChartRow[]) => Math.min(0, ...rows.flatMap((r) => [r.bad, r.medium, r.good]));
export const highest = (rows: ChartRow[]) => Math.max(0, ...rows.flatMap((r) => [r.bad, r.medium, r.good]));

/** "An slab: 1.200 lei, An bun: 9.800 lei", for the chart's label. `lei` prints a signed amount. */
export const yearEnds = (rows: ChartRow[], year: Year, lei: (bani: number) => string) =>
  otherYears(rows, year)
    .map((k) => `${yearName(k)}: ${lei(rows[rows.length - 1][k])}`)
    .join(', ');
