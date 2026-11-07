import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { isFrost, openMeteoUrl, parseOpenMeteo, upcomingWeather, weatherAlerts, type WeatherParams } from '.';

const data = loadData();
const params = data.params.weather;
const teleorman = data.counties.counties.find((c) => c.code === 'TR')!;
const withWind = (value: number): WeatherParams => ({
  ...params,
  spray_wind_max_kmh: { ...params.spray_wind_max_kmh, value },
});

const raw = {
  daily: {
    time: ['2026-11-07', '2026-11-08', '2026-11-09'],
    temperature_2m_min: [2.6, -0.1, null],
    temperature_2m_max: [10, 9.7, 9.6],
    precipitation_sum: [0, 0, 1.4],
    precipitation_probability_max: [0, 0, 35],
    wind_speed_10m_max: [12.6, 30, null],
  },
};

describe('weather data', () => {
  it('has coordinates for every county', () => {
    expect(data.counties.counties).toHaveLength(42);
    expect(teleorman).toMatchObject({ seat_ro: 'Alexandria', lat: 43.98, lon: 25.33 });
  });

  it('keeps the wind limit unset until it has a source', () => {
    expect(params.spray_wind_max_kmh.value).toBeNull();
  });
});

describe('openMeteoUrl', () => {
  it('asks for the county in Romanian time, with at most 10 variables', () => {
    const url = openMeteoUrl('https://api.open-meteo.com/', teleorman, params);
    expect(url.startsWith('https://api.open-meteo.com/v1/forecast?latitude=43.98&longitude=25.33&')).toBe(true);
    expect(url).toContain('timezone=Europe%2FBucharest');
    expect(url).toContain(`forecast_days=${params.forecast_days.value}`);
    const variables = decodeURIComponent(url.match(/daily=([^&]+)/)![1]!).split(',');
    expect(variables.length).toBeLessThanOrEqual(10);
    expect(url).not.toContain('apikey');
  });

  it('adds the key only when there is one', () => {
    expect(openMeteoUrl('https://customer-api.open-meteo.com', teleorman, params, 'k1')).toContain('apikey=k1');
  });
});

describe('parseOpenMeteo', () => {
  it('maps the columns to days and keeps missing values as null', () => {
    const days = parseOpenMeteo(raw);
    expect(days).toHaveLength(3);
    expect(days[1]).toEqual({
      date: '2026-11-08',
      tempMinC: -0.1,
      tempMaxC: 9.7,
      rainMm: 0,
      rainChancePct: 0,
      windMaxKmh: 30,
    });
    expect(days[2]!.tempMinC).toBeNull();
  });

  it('rejects an unexpected response', () => {
    expect(() => parseOpenMeteo({ error: true, reason: 'limit' })).toThrow();
    expect(() => parseOpenMeteo({ daily: { ...raw.daily, time: [] } })).toThrow();
    expect(() => parseOpenMeteo({ daily: { ...raw.daily, precipitation_sum: [0] } })).toThrow('uneven');
  });
});

describe('alerts', () => {
  const days = parseOpenMeteo(raw);

  it('warns of frost at the limit and below, and not on a missing value', () => {
    expect(isFrost({ ...days[0]!, tempMinC: params.frost_min_c.value }, params)).toBe(true);
    expect(isFrost(days[0]!, params)).toBe(false);
    expect(isFrost(days[2]!, params)).toBe(false);
    expect(weatherAlerts(days, params)).toEqual([{ kind: 'frost', dates: ['2026-11-08'] }]);
  });

  it('gives no wind warning while the limit is unset', () => {
    expect(weatherAlerts(days, params).some((a) => a.kind === 'wind')).toBe(false);
  });

  it('warns of wind above a sourced limit', () => {
    expect(weatherAlerts(days, withWind(25))).toContainEqual({ kind: 'wind', dates: ['2026-11-08'] });
  });

  it('drops past days from an old copy', () => {
    expect(upcomingWeather(days, '2026-11-08').map((d) => d.date)).toEqual(['2026-11-08', '2026-11-09']);
  });
});
