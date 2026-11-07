import type { Timeline, TimelineEntry } from '@cropcash/shared';
import type { ForecastSeries } from '../components/ForecastChart';
import type { FarmPlan } from './plan';
import { formatMonthShort } from './format';

/** Balance today, then at each month end. */
export const balanceSeries = (t: Timeline) => [t.startBalance, ...t.months.map((m) => m.balanceEnd)];

export function forecastSeries(plan: FarmPlan): ForecastSeries {
  return {
    lo: balanceSeries(plan.timelines.bad),
    mid: balanceSeries(plan.timelines.medium),
    hi: balanceSeries(plan.timelines.good),
  };
}

export const monthLabels = (t: Timeline) => t.months.map((m) => formatMonthShort(m.key).replace('.', ''));

/** Next money going out from `today` (for "Următoarea plată"). */
export function nextBill(t: Timeline, today: string): TimelineEntry | null {
  return t.months.flatMap((m) => m.entries).find((e) => e.direction === 'out' && e.date >= today) ?? null;
}

export const scenarioKey = { bad: 'lo', medium: 'mid', good: 'hi' } as const;
