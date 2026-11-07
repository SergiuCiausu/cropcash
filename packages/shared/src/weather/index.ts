import { z } from 'zod';
import type { IsoDate } from '../cashflow';
import type { AppData, PlanParamsFile } from '../data';

export type WeatherParams = PlanParamsFile['weather'];
export type County = AppData['counties']['counties'][number];

const DAILY_VARIABLES = [
  'temperature_2m_min',
  'temperature_2m_max',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
] as const;

const Values = z.array(z.number().nullable());

const OpenMeteoResponseSchema = z.object({
  daily: z.object({
    time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
    temperature_2m_min: Values,
    temperature_2m_max: Values,
    precipitation_sum: Values,
    precipitation_probability_max: Values,
    wind_speed_10m_max: Values,
  }),
});

export const WeatherDaySchema = z.object({
  date: z.string(),
  tempMinC: z.number().nullable(),
  tempMaxC: z.number().nullable(),
  rainMm: z.number().nullable(),
  rainChancePct: z.number().nullable(),
  windMaxKmh: z.number().nullable(),
});
export type WeatherDay = z.infer<typeof WeatherDaySchema>;

/** What GET /api/weather returns, and what the phone keeps for offline use. */
export const WeatherForecastSchema = z.object({
  countyCode: z.string(),
  /** ISO timestamp of the fetch from Open-Meteo. */
  fetchedAt: z.string(),
  /** True when Open-Meteo failed and this is an older copy. */
  stale: z.boolean(),
  days: z.array(WeatherDaySchema),
});
export type WeatherForecast = z.infer<typeof WeatherForecastSchema>;

export interface WeatherAlert {
  kind: 'frost' | 'wind';
  dates: IsoDate[];
}

/** The request for one county. Pure, so the API and its tests build the same URL. */
export function openMeteoUrl(baseUrl: string, county: County, params: WeatherParams, apiKey?: string): string {
  const query: Record<string, string> = {
    latitude: String(county.lat),
    longitude: String(county.lon),
    daily: DAILY_VARIABLES.join(','),
    timezone: 'Europe/Bucharest',
    forecast_days: String(params.forecast_days.value),
  };
  if (apiKey) query.apikey = apiKey;
  const encoded = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return `${baseUrl.replace(/\/+$/, '')}/v1/forecast?${encoded.join('&')}`;
}

/** Turns an Open-Meteo response into days. Throws on a shape we do not expect. */
export function parseOpenMeteo(raw: unknown): WeatherDay[] {
  const { daily } = OpenMeteoResponseSchema.parse(raw);
  const n = daily.time.length;
  if (DAILY_VARIABLES.some((v) => daily[v].length !== n)) throw new Error('open_meteo_uneven_lengths');
  return daily.time.map((date, i) => ({
    date,
    tempMinC: daily.temperature_2m_min[i] ?? null,
    tempMaxC: daily.temperature_2m_max[i] ?? null,
    rainMm: daily.precipitation_sum[i] ?? null,
    rainChancePct: daily.precipitation_probability_max[i] ?? null,
    windMaxKmh: daily.wind_speed_10m_max[i] ?? null,
  }));
}

/** Drops days already gone, so an old offline copy never shows yesterday as a forecast. */
export function upcomingWeather(days: WeatherDay[], today: IsoDate): WeatherDay[] {
  return days.filter((d) => d.date >= today);
}

export function isFrost(day: WeatherDay, params: WeatherParams): boolean {
  return day.tempMinC !== null && day.tempMinC <= params.frost_min_c.value;
}

/** Plain warnings. The wind one stays off until its limit has a source. */
export function weatherAlerts(days: WeatherDay[], params: WeatherParams): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  const frost = days.filter((d) => isFrost(d, params)).map((d) => d.date);
  if (frost.length > 0) alerts.push({ kind: 'frost', dates: frost });

  const limit = params.spray_wind_max_kmh.value;
  if (limit !== null) {
    const windy = days.filter((d) => d.windMaxKmh !== null && d.windMaxKmh > limit).map((d) => d.date);
    if (windy.length > 0) alerts.push({ kind: 'wind', dates: windy });
  }
  return alerts;
}
