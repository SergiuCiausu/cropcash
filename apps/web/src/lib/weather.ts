import { useEffect, useState } from 'react';
import { WeatherForecastSchema, type WeatherForecast } from '@cropcash/shared';
import { api } from '../api/client';
import { readCachedWeather, saveWeather } from './weatherCache';

export interface WeatherState {
  forecast: WeatherForecast | null;
  loading: boolean;
  /** The last request failed, so `forecast` (if any) is the saved copy. */
  failed: boolean;
}

/** Shows the saved copy at once, then refreshes it when there is internet. */
export function useWeather(countyCode: string): WeatherState {
  const [forecast, setForecast] = useState(() => readCachedWeather(localStorage, countyCode));
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    api<unknown>('/api/weather')
      .then((raw) => {
        if (!active) return;
        const fresh = WeatherForecastSchema.parse(raw);
        saveWeather(localStorage, fresh);
        setForecast(fresh);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [countyCode]);

  return { forecast, loading, failed };
}
