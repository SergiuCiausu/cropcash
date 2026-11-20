import { z } from 'zod';
import type { CropsFile } from '../data';
import {
  modelSeasonChanges,
  outlookFromTotals,
  percentile,
  seasonTotals,
  trendFromChanges,
  type DailyRain,
  type RainOutlookParams,
  type RainSeason,
  type SeasonOutlook,
} from './rain-outlook';

/**
 * docs/data/rain-climatology.json, written by scripts/build-rain-climatology.ts.
 *
 * It keeps the raw season totals per year and each model's change, not the ranges, so the
 * percentiles, the dry threshold and the agreement rule stay live in plan-params. Changing a
 * season's months, the history start, the model reference or the model window needs a rebuild:
 * the file records what it was built with, and a season built with other months is ignored.
 */

const Window = z.object({ from: z.number().int(), to: z.number().int() });

const SeasonEntrySchema = z.object({
  /** Year → mm over the season's months. Only complete years. */
  totals: z.record(z.string().regex(/^\d{4}$/), z.number().min(0)),
  /** Model → change of its season average, model window vs reference, as a share. */
  models: z.record(z.string(), z.number()),
});

export const RainCountySchema = z.object({
  code: z.string().min(1),
  /** The ERA5 grid point Open-Meteo used for the county seat. */
  grid: z.object({ lat: z.number(), lon: z.number() }),
  seasons: z.record(z.string(), SeasonEntrySchema),
});
export type RainCounty = z.infer<typeof RainCountySchema>;

export const RainClimatologySchema = z.object({
  meta: z.object({
    built_at: z.string(),
    history_years: Window,
    model_reference: Window,
    model_window: Window,
    seasons: z.array(z.object({ id: z.string(), from_month: z.number().int(), to_month: z.number().int() })),
    sources: z.array(z.string()),
    attribution: z.string(),
    /** Counties in counties.json not in `counties` yet (rate limits stop a run part way). */
    missing: z.array(z.string()),
  }),
  counties: z.array(RainCountySchema),
});
export type RainClimatology = z.infer<typeof RainClimatologySchema>;

const round1 = (x: number) => Math.round(x * 10) / 10;
const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

/** One county's entry from its ERA5 history and CMIP6 series. Pure, so the script and tests share it. */
export function buildRainCounty(
  code: string,
  grid: { lat: number; lon: number },
  history: DailyRain[],
  models: Record<string, DailyRain[]>,
  seasons: RainSeason[],
  windows: { history: { from: number; to: number }; reference: { from: number; to: number }; future: { from: number; to: number } },
): RainCounty {
  const out: RainCounty['seasons'] = {};
  for (const season of seasons) {
    const totals: Record<string, number> = {};
    for (const [year, mm] of seasonTotals(history, season)) {
      if (year >= windows.history.from && year <= windows.history.to) totals[String(year)] = round1(mm);
    }
    const changes = modelSeasonChanges(models, season, windows.reference, windows.future);
    out[season.id] = {
      totals,
      models: Object.fromEntries(Object.entries(changes).map(([m, c]) => [m, round4(c)])),
    };
  }
  return { code, grid: { lat: round4(grid.lat), lon: round4(grid.lon) }, seasons: out };
}

const TrendSchema = z.object({
  perModel: z.record(z.string(), z.number()),
  median: z.number(),
  agreeing: z.number().int(),
  models: z.number().int(),
  applied: z.boolean(),
});

export const SeasonOutlookSchema = z.object({
  seasonId: z.string(),
  label: z.string(),
  fromYear: z.number().int(),
  toYear: z.number().int(),
  years: z.number().int(),
  lowMm: z.number(),
  usualMm: z.number(),
  highMm: z.number(),
  dryBelowMm: z.number(),
  dryYears: z.number().int(),
  driest: z.array(z.object({ year: z.number().int(), mm: z.number() })),
  trend: TrendSchema.nullable(),
});

export const CountyRainOutlookSchema = z.object({
  countyCode: z.string(),
  /** The years the model trend is about. */
  modelWindow: Window,
  seasons: z.array(SeasonOutlookSchema),
});
export type CountyRainOutlook = z.infer<typeof CountyRainOutlookSchema>;

/** What GET /api/rain-outlook returns, and what the phone keeps for offline use. */
export const RainOutlookSchema = z.object({
  countyCode: z.string(),
  /** Null until the county is in rain-climatology.json. */
  years: CountyRainOutlookSchema.nullable(),
  /** Null when the seasonal forecast never came. Months already gone are left out. */
  months: z
    .array(z.object({ month: z.string(), lean: z.enum(['drier', 'usual', 'wetter']).nullable(), change: z.number().nullable() }))
    .nullable(),
  /** ISO timestamp of the seasonal fetch. */
  monthsFetchedAt: z.string().nullable(),
  /** True when Open-Meteo failed and the months are an older copy. */
  monthsStale: z.boolean(),
});
export type RainOutlook = z.infer<typeof RainOutlookSchema>;

/**
 * The 1–5 year outlook for one county, from the file and today's params. Null for a county the
 * file doesn't have yet. A season whose months changed since the build is left out.
 */
export function countyRainOutlook(
  file: RainClimatology,
  countyCode: string,
  params: RainOutlookParams,
): CountyRainOutlook | null {
  const county = file.counties.find((c) => c.code === countyCode);
  if (!county) return null;
  const seasons: CountyRainOutlook['seasons'] = [];
  for (const season of params.seasons.items) {
    const built = file.meta.seasons.find((s) => s.id === season.id);
    if (!built || built.from_month !== season.from_month || built.to_month !== season.to_month) continue;
    const entry = county.seasons[season.id];
    if (!entry) continue;
    const totals = new Map(Object.entries(entry.totals).map(([y, mm]) => [Number(y), mm]));
    const trend = trendFromChanges(entry.models, params.models_agree_min.value);
    const outlook = outlookFromTotals(totals, season.id, trend, params);
    if (outlook) seasons.push({ ...outlook, label: season.label_ro });
  }
  return { countyCode, modelWindow: file.meta.model_window, seasons };
}

// ── Rain and the county's harvests (docs/rain-outlook-plan.md, step 6) ───────

export interface RainYieldLink {
  cropId: string;
  /** Correlation of season rain with the county's yield, after the yearly trend is taken out. */
  r: number;
  /** Years with both a yield and a complete season. */
  years: number;
  /** INS years whose season was dry (below the history's dry percentile). */
  dryYears: number[];
  /** Median yield in those years, and in the others, kg/ha as INS gives it. */
  dryYieldKgHa: number | null;
  otherYieldKgHa: number | null;
  /** True when the link is strong enough to tell the farmer. */
  shown: boolean;
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

/** Takes out the straight-line rise of yields over the years (seeds, machines), so rain is compared with what's left. */
function detrend(years: number[], values: number[]): number[] {
  const n = years.length;
  const mx = years.reduce((a, b) => a + b, 0) / n;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (years[i]! - mx) * (values[i]! - my);
    den += (years[i]! - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return values.map((v, i) => v - slope * (years[i]! - mx));
}

/**
 * How much the county's harvest of a crop follows the rain of its season, from the INS yields
 * (crops-reference.json → county_history) and the rain file. Null when the county or crop has
 * no season, no INS row, or fewer than `minYears` years with both.
 */
export function rainYieldLink(
  county: RainCounty,
  cropId: string,
  history: CropsFile['county_history'],
  params: RainOutlookParams,
  minYears: number,
): RainYieldLink | null {
  const season = county.seasons[cropId];
  const series = history.data[county.code]?.[cropId];
  if (!season || !series) return null;
  const allRain = Object.values(season.totals);
  if (allRain.length === 0) return null;
  const dryBelow = percentile(allRain, params.dry_percentile.value);

  const years: number[] = [];
  const rain: number[] = [];
  const yields: number[] = [];
  series.forEach((kg, i) => {
    const year = history.first_year + i;
    const mm = season.totals[String(year)];
    if (kg === null || kg === undefined || mm === undefined) return;
    years.push(year);
    rain.push(mm);
    yields.push(kg);
  });
  if (years.length < minYears) return null;

  const median = (xs: number[]) => (xs.length ? Math.round(percentile(xs, 50)) : null);
  const dryIdx = rain.flatMap((mm, i) => (mm < dryBelow ? [i] : []));
  const otherIdx = rain.flatMap((mm, i) => (mm >= dryBelow ? [i] : []));
  const r = pearson(rain, detrend(years, yields));
  return {
    cropId,
    r: Math.round(r * 100) / 100,
    years: years.length,
    dryYears: dryIdx.map((i) => years[i]!),
    dryYieldKgHa: median(dryIdx.map((i) => yields[i]!)),
    otherYieldKgHa: median(otherIdx.map((i) => yields[i]!)),
    shown: r >= params.yield_link_min_r.value && dryIdx.length >= params.yield_link_min_dry_years.value && otherIdx.length > 0,
  };
}
