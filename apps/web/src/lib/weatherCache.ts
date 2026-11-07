import { WeatherForecastSchema, type WeatherForecast } from '@cropcash/shared';

const CACHE_KEY = 'cropcash.weather';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Null when nothing usable is saved. Storage can be blocked, so nothing here may throw. */
export function readCachedWeather(store: Store, countyCode: string): WeatherForecast | null {
  try {
    const parsed = WeatherForecastSchema.safeParse(JSON.parse(store.getItem(CACHE_KEY) ?? 'null'));
    return parsed.success && parsed.data.countyCode === countyCode ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveWeather(store: Store, forecast: WeatherForecast) {
  try {
    store.setItem(CACHE_KEY, JSON.stringify(forecast));
  } catch {
    // Only the offline copy is lost.
  }
}

/** Runs on sign-out. Step 9b moves this into the shared offline cache. */
export function clearWeatherCache(store?: Store) {
  try {
    (store ?? localStorage).removeItem(CACHE_KEY);
  } catch {
    // Nothing was saved.
  }
}
