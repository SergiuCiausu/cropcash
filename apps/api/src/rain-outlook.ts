import {
  countyRainOutlook,
  parseSeasonalMonthly,
  seasonalUrl,
  upcomingMonths,
  type AppData,
  type RainClimatology,
  type RainOutlook,
  type SeasonalMonth,
} from '@cropcash/shared';
import { loadRainClimatology } from '@cropcash/shared/rain-climatology';

const PUBLIC_SEASONAL_URL = 'https://seasonal-api.open-meteo.com';
const CUSTOMER_SEASONAL_URL = 'https://customer-seasonal-api.open-meteo.com';

export class RainOutlookUnavailableError extends Error {
  constructor() {
    super('rain_outlook_unavailable');
  }
}

export interface RainOutlookService {
  /** Null for a county we do not know. Throws RainOutlookUnavailableError with nothing at all to show. */
  get(countyCode: string): Promise<RainOutlook | null>;
}

export interface RainOutlookDeps {
  data: AppData;
  /** Defaults to docs/data/rain-climatology.json. */
  climatology?: RainClimatology;
  /** Defaults to the public server, or the customer one when there's a key. */
  baseUrl?: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

interface Fetched {
  months: SeasonalMonth[];
  fetchedAt: string;
}

/**
 * The rain outlook for a county (docs/rain-outlook-plan.md, step 4). The years come from the
 * built file, so they never need the network. The months come from the Seasonal API, cached per
 * county like the 7-day forecast: an old copy when Open-Meteo fails, and no months (but still the
 * years) when there was never a copy.
 */
export function createRainOutlookService({
  data,
  climatology = loadRainClimatology(),
  apiKey,
  baseUrl = apiKey ? CUSTOMER_SEASONAL_URL : PUBLIC_SEASONAL_URL,
  fetchFn = fetch,
  now = () => new Date(),
}: RainOutlookDeps): RainOutlookService {
  const params = data.params.rain_outlook;
  const ttlMs = params.seasonal_cache_hours.value * 3_600_000;
  const retryMs = data.params.weather.retry_minutes.value * 60_000;
  const timeoutMs = data.params.weather.timeout_seconds.value * 1000;

  const cache = new Map<string, Fetched>();
  const failedAt = new Map<string, number>();
  const pending = new Map<string, Promise<Fetched>>();

  async function download(code: string, point: { lat: number; lon: number }): Promise<Fetched> {
    const res = await fetchFn(seasonalUrl(baseUrl, point, apiKey), { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`open_meteo_seasonal_${res.status}`);
    const fetched = { months: parseSeasonalMonthly(await res.json()), fetchedAt: now().toISOString() };
    cache.set(code, fetched);
    failedAt.delete(code);
    return fetched;
  }

  /** The months and whether they're an old copy; null when there's no copy at all. */
  async function months(code: string, point: { lat: number; lon: number }): Promise<{ fetched: Fetched; stale: boolean } | null> {
    const time = now().getTime();
    const cached = cache.get(code);
    if (cached && time - Date.parse(cached.fetchedAt) < ttlMs) return { fetched: cached, stale: false };

    const failed = failedAt.get(code);
    if (failed !== undefined && time - failed < retryMs) return cached ? { fetched: cached, stale: true } : null;

    // Concurrent requests for one county share the same download.
    let request = pending.get(code);
    if (!request) {
      request = download(code, point).finally(() => pending.delete(code));
      pending.set(code, request);
    }
    try {
      return { fetched: await request, stale: false };
    } catch (err) {
      console.error('[rain-outlook]', code, err);
      failedAt.set(code, time);
      return cached ? { fetched: cached, stale: true } : null;
    }
  }

  return {
    async get(countyCode) {
      const county = data.counties.counties.find((c) => c.code === countyCode);
      if (!county) return null;

      const years = countyRainOutlook(climatology, county.code, params);
      const got = await months(county.code, county);
      if (!years && !got) throw new RainOutlookUnavailableError();

      const today = now().toISOString().slice(0, 10);
      return {
        countyCode: county.code,
        years,
        months: got ? upcomingMonths(got.fetched.months, today, params) : null,
        monthsFetchedAt: got?.fetched.fetchedAt ?? null,
        monthsStale: got?.stale ?? false,
      };
    },
  };
}
