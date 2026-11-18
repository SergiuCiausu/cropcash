import { openMeteoUrl, parseOpenMeteo, type AppData, type County, type WeatherForecast } from '@cropcash/shared';

const PUBLIC_BASE_URL = 'https://api.open-meteo.com';

export class WeatherUnavailableError extends Error {
  constructor() {
    super('weather_unavailable');
  }
}

export interface WeatherService {
  /** Null for a county we do not know. Throws WeatherUnavailableError with nothing to show. */
  get(countyCode: string): Promise<WeatherForecast | null>;
}

export interface WeatherDeps {
  data: AppData;
  baseUrl?: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

/**
 * Caches one forecast per county, so calls to Open-Meteo depend on the counties in use and
 * not on the number of farmers. The cache lives in memory: a restart only means a fresh fetch.
 */
export function createWeatherService({
  data,
  baseUrl = PUBLIC_BASE_URL,
  apiKey,
  fetchFn = fetch,
  now = () => new Date(),
}: WeatherDeps): WeatherService {
  const params = data.params.weather;
  const ttlMs = params.cache_hours.value * 3_600_000;
  const retryMs = params.retry_minutes.value * 60_000;
  const timeoutMs = params.timeout_seconds.value * 1000;

  const cache = new Map<string, WeatherForecast>();
  const failedAt = new Map<string, number>();
  const pending = new Map<string, Promise<WeatherForecast>>();

  async function download(county: County): Promise<WeatherForecast> {
    const res = await fetchFn(openMeteoUrl(baseUrl, county, params, apiKey), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`open_meteo_${res.status}`);
    const forecast: WeatherForecast = {
      countyCode: county.code,
      fetchedAt: now().toISOString(),
      stale: false,
      days: parseOpenMeteo(await res.json()),
    };
    cache.set(county.code, forecast);
    failedAt.delete(county.code);
    return forecast;
  }

  const oldCopy = (code: string): WeatherForecast => {
    const cached = cache.get(code);
    if (!cached) throw new WeatherUnavailableError();
    return { ...cached, stale: true };
  };

  return {
    async get(countyCode) {
      const county = data.counties.counties.find((c) => c.code === countyCode);
      if (!county) return null;

      const time = now().getTime();
      const cached = cache.get(county.code);
      if (cached && time - Date.parse(cached.fetchedAt) < ttlMs) return cached;

      const failed = failedAt.get(county.code);
      if (failed !== undefined && time - failed < retryMs) return oldCopy(county.code);

      // Concurrent requests for one county share the same download.
      let request = pending.get(county.code);
      if (!request) {
        request = download(county).finally(() => pending.delete(county.code));
        pending.set(county.code, request);
      }
      try {
        return await request;
      } catch (err) {
        console.error('[weather]', county.code, err);
        failedAt.set(county.code, time);
        return oldCopy(county.code);
      }
    },
  };
}
