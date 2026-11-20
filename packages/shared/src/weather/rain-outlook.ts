import { z } from 'zod';
import type { PlanParamsFile } from '../data';

/**
 * Rain over the next years (docs/rain-outlook-plan.md). Nothing here predicts a given year:
 * the ranges come from the county's own history, moved only when the climate models agree
 * on a direction. The next months come from the seasonal forecast's anomaly. Pure, no I/O.
 */

export type RainOutlookParams = PlanParamsFile['rain_outlook'];
export type RainSeason = RainOutlookParams['seasons']['items'][number];

export interface DailyRain {
  date: string;
  mm: number | null;
}

const IsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Values = z.array(z.number().nullable());

// ── Parsing ──────────────────────────────────────────────────────────────────

const DailyRainResponseSchema = z.object({
  daily: z.object({ time: z.array(IsoDay).min(1), precipitation_sum: Values }),
});

/** The Historical API (ERA5) response for one point. */
export function parseDailyRain(raw: unknown): DailyRain[] {
  const { daily } = DailyRainResponseSchema.parse(raw);
  if (daily.precipitation_sum.length !== daily.time.length) throw new Error('open_meteo_uneven_lengths');
  return daily.time.map((date, i) => ({ date, mm: daily.precipitation_sum[i] ?? null }));
}

const MODEL_PREFIX = 'precipitation_sum_';

/** The Climate API response, one series per CMIP6 model. */
export function parseClimateModels(raw: unknown): Record<string, DailyRain[]> {
  const daily = z
    .object({ daily: z.object({ time: z.array(IsoDay).min(1) }).catchall(z.unknown()) })
    .parse(raw).daily;
  const out: Record<string, DailyRain[]> = {};
  for (const [key, value] of Object.entries(daily)) {
    if (!key.startsWith(MODEL_PREFIX)) continue;
    const values = Values.parse(value);
    if (values.length !== daily.time.length) throw new Error('open_meteo_uneven_lengths');
    out[key.slice(MODEL_PREFIX.length)] = daily.time.map((date, i) => ({ date, mm: values[i] ?? null }));
  }
  if (Object.keys(out).length === 0) throw new Error('open_meteo_no_models');
  return out;
}

export interface SeasonalMonth {
  /** YYYY-MM */
  month: string;
  /** Ensemble mean for the month, mm. */
  meanMm: number | null;
  /** Mean minus the model's own hindcast climatology, mm. */
  anomalyMm: number | null;
}

const SeasonalResponseSchema = z.object({
  monthly: z.object({
    time: z.array(IsoDay).min(1),
    precipitation_mean: Values,
    precipitation_anomaly: Values,
  }),
});

/** The Seasonal API with `monthly=precipitation_mean,precipitation_anomaly`. */
export function parseSeasonalMonthly(raw: unknown): SeasonalMonth[] {
  const { monthly } = SeasonalResponseSchema.parse(raw);
  const n = monthly.time.length;
  if (monthly.precipitation_mean.length !== n || monthly.precipitation_anomaly.length !== n) {
    throw new Error('open_meteo_uneven_lengths');
  }
  return monthly.time.map((t, i) => ({
    month: t.slice(0, 7),
    meanMm: monthly.precipitation_mean[i] ?? null,
    anomalyMm: monthly.precipitation_anomaly[i] ?? null,
  }));
}

// ── Sums and percentiles ─────────────────────────────────────────────────────

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Rain per year over a season's months. A year is left out unless every day of those
 * months is present and not null, so a half-fetched year never looks like a drought.
 */
export function seasonTotals(days: DailyRain[], season: Pick<RainSeason, 'from_month' | 'to_month'>): Map<number, number> {
  const sums = new Map<number, number>();
  const counts = new Map<number, number>();
  for (const d of days) {
    const month = Number(d.date.slice(5, 7));
    if (month < season.from_month || month > season.to_month || d.mm === null) continue;
    const year = Number(d.date.slice(0, 4));
    sums.set(year, (sums.get(year) ?? 0) + d.mm);
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  const out = new Map<number, number>();
  for (const [year, sum] of [...sums].sort(([a], [b]) => a - b)) {
    let expected = 0;
    for (let m = season.from_month; m <= season.to_month; m++) expected += daysInMonth(year, m);
    if (counts.get(year) === expected) out.set(year, sum);
  }
  return out;
}

/** Linear-interpolated percentile, p in 0–100. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) throw new Error('percentile_of_nothing');
  const sorted = [...values].sort((a, b) => a - b);
  const i = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
}

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;

// ── Climate-model trend ──────────────────────────────────────────────────────

export interface ModelTrend {
  /** Change of each model's average, future window vs reference, as a share (0.1 = +10%). */
  perModel: Record<string, number>;
  /** Median across models. */
  median: number;
  /** How many models go the same way as the median (zero counts as neither). */
  agreeing: number;
  models: number;
  /** True when enough models agree that the range is moved by the median. */
  applied: boolean;
}

/**
 * How the climate models see a season changing. Each model is compared only with itself,
 * so their own wet or dry bias cancels out. Returns null when no model has both windows.
 */
export function modelTrend(
  models: Record<string, DailyRain[]>,
  season: Pick<RainSeason, 'from_month' | 'to_month'>,
  reference: { from: number; to: number },
  future: { from: number; to: number },
  agreeMin: number,
): ModelTrend | null {
  return trendFromChanges(modelSeasonChanges(models, season, reference, future), agreeMin);
}

/** Each model's change, future window vs reference, as a share. Models missing a year are left out. */
export function modelSeasonChanges(
  models: Record<string, DailyRain[]>,
  season: Pick<RainSeason, 'from_month' | 'to_month'>,
  reference: { from: number; to: number },
  future: { from: number; to: number },
): Record<string, number> {
  const perModel: Record<string, number> = {};
  for (const [name, days] of Object.entries(models)) {
    const totals = seasonTotals(days, season);
    const pick = (w: { from: number; to: number }) =>
      [...totals].filter(([y]) => y >= w.from && y <= w.to).map(([, v]) => v);
    const ref = pick(reference);
    const fut = pick(future);
    // Every year of both windows must be there, or the comparison is lopsided.
    if (ref.length !== reference.to - reference.from + 1 || fut.length !== future.to - future.from + 1) continue;
    const refMean = mean(ref);
    if (refMean <= 0) continue;
    perModel[name] = mean(fut) / refMean - 1;
  }
  return perModel;
}

/** The median of the models' changes, applied only when `agreeMin` of them go its way. */
export function trendFromChanges(perModel: Record<string, number>, agreeMin: number): ModelTrend | null {
  const changes = Object.values(perModel);
  if (changes.length === 0) return null;
  const median = percentile(changes, 50);
  const sign = Math.sign(median);
  const agreeing = sign === 0 ? 0 : changes.filter((c) => Math.sign(c) === sign).length;
  return { perModel, median, agreeing, models: changes.length, applied: agreeing >= agreeMin };
}

// ── One season's outlook ─────────────────────────────────────────────────────

export interface SeasonOutlook {
  seasonId: string;
  /** Years of history used, first and last. */
  fromYear: number;
  toYear: number;
  years: number;
  lowMm: number;
  usualMm: number;
  highMm: number;
  /** Below this, the season counts as dry. */
  dryBelowMm: number;
  /** How many of the history years were that dry. */
  dryYears: number;
  /** The driest years, driest first, with their total. */
  driest: { year: number; mm: number }[];
  /** The model trend, or null when the models have no data for this county. */
  trend: ModelTrend | null;
}

const round = (mm: number) => Math.round(mm);

/**
 * The range for one season. History percentiles, multiplied by (1 + median change) only
 * when the models agree. The dry threshold moves the same way, so `dryYears` stays a
 * count of real past years against today's threshold.
 */
export function seasonOutlook(
  history: DailyRain[],
  season: RainSeason,
  trend: ModelTrend | null,
  params: RainOutlookParams,
  driestShown = 3,
): SeasonOutlook | null {
  return outlookFromTotals(seasonTotals(history, season), season.id, trend, params, driestShown);
}

/** The same, from season totals already summed (as stored in rain-climatology.json). */
export function outlookFromTotals(
  seasonTotalsByYear: Map<number, number>,
  seasonId: string,
  trend: ModelTrend | null,
  params: RainOutlookParams,
  driestShown = 3,
): SeasonOutlook | null {
  const totals = [...seasonTotalsByYear]
    .filter(([y]) => y >= params.history_from_year.value)
    .sort(([a], [b]) => a - b);
  if (totals.length === 0) return null;
  const values = totals.map(([, v]) => v);
  const factor = trend?.applied ? 1 + trend.median : 1;
  const dryBelowHistory = percentile(values, params.dry_percentile.value);
  return {
    seasonId,
    fromYear: totals[0]![0],
    toYear: totals.at(-1)![0],
    years: totals.length,
    lowMm: round(percentile(values, params.low_percentile.value) * factor),
    usualMm: round(percentile(values, 50) * factor),
    highMm: round(percentile(values, params.high_percentile.value) * factor),
    dryBelowMm: round(dryBelowHistory * factor),
    dryYears: values.filter((v) => v < dryBelowHistory).length,
    driest: [...totals]
      .sort(([, a], [, b]) => a - b)
      .slice(0, driestShown)
      .map(([year, mm]) => ({ year, mm: round(mm) })),
    trend,
  };
}

/**
 * The future window the models are averaged over: starts with the first outlook year
 * and lasts `model_window_years`.
 */
export function modelWindow(firstOutlookYear: number, params: RainOutlookParams): { from: number; to: number } {
  return { from: firstOutlookYear, to: firstOutlookYear + params.model_window_years.value - 1 };
}

// ── Next months ──────────────────────────────────────────────────────────────

/**
 * The Seasonal API request for one county: monthly mean and anomaly (vs the model's own
 * hindcast climatology), ~1 call. Pure, so the API and its tests build the same URL.
 */
export function seasonalUrl(baseUrl: string, point: { lat: number; lon: number }, apiKey?: string): string {
  const query: Record<string, string> = {
    latitude: String(point.lat),
    longitude: String(point.lon),
    monthly: 'precipitation_mean,precipitation_anomaly',
    timezone: 'Europe/Bucharest',
  };
  if (apiKey) query.apikey = apiKey;
  const encoded = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return `${baseUrl.replace(/\/+$/, '')}/v1/seasonal?${encoded.join('&')}`;
}

export type MonthLean = 'drier' | 'usual' | 'wetter';

export interface MonthOutlook {
  month: string;
  lean: MonthLean | null;
  /** Change vs the model's usual for that month, as a share; null when unknown. */
  change: number | null;
}

/**
 * Drier, usual or wetter than the model's own usual for that month. Inside the band it's
 * "usual". Null when the data is missing or the usual is zero (nothing to compare with).
 */
export function monthLean(month: SeasonalMonth, params: RainOutlookParams): MonthOutlook {
  const { meanMm, anomalyMm } = month;
  if (meanMm === null || anomalyMm === null) return { month: month.month, lean: null, change: null };
  const usual = meanMm - anomalyMm;
  if (usual <= 0) return { month: month.month, lean: null, change: null };
  const change = anomalyMm / usual;
  const band = params.seasonal_usual_band_pct.value / 100;
  const lean: MonthLean = change > band ? 'wetter' : change < -band ? 'drier' : 'usual';
  return { month: month.month, lean, change };
}

/**
 * Months still to come, from next month on, with their lean. The current month is left out: part of
 * it is already gone and the 7-day forecast covers the rest, so its seasonal value only confuses.
 */
export function upcomingMonths(months: SeasonalMonth[], today: string, params: RainOutlookParams): MonthOutlook[] {
  const current = today.slice(0, 7);
  return months.filter((m) => m.month > current).map((m) => monthLean(m, params));
}
