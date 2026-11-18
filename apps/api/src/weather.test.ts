import { describe, expect, it, vi } from 'vitest';
import { loadData } from '@cropcash/shared';
import { createWeatherService, WeatherUnavailableError } from './weather';

const data = loadData();
const { cache_hours, retry_minutes } = data.params.weather;
const HOUR = 3_600_000;

const body = {
  daily: {
    time: ['2026-11-07'],
    temperature_2m_min: [2],
    temperature_2m_max: [10],
    precipitation_sum: [0],
    precipitation_probability_max: [0],
    wind_speed_10m_max: [12],
  },
};
const ok = () => new Response(JSON.stringify(body), { status: 200 });

function setup(fetchImpl: () => Promise<Response>) {
  let time = Date.parse('2026-11-07T10:00:00Z');
  const fetchFn = vi.fn(fetchImpl);
  const service = createWeatherService({
    data,
    fetchFn: fetchFn as unknown as typeof fetch,
    now: () => new Date(time),
  });
  return { service, fetchFn, advance: (ms: number) => (time += ms) };
}

describe('weather service', () => {
  it('fetches a county once while the copy is fresh', async () => {
    const { service, fetchFn, advance } = setup(async () => ok());
    const first = await service.get('TR');
    advance(cache_hours.value * HOUR - 1);
    await service.get('TR');
    expect(first).toMatchObject({ countyCode: 'TR', stale: false, days: [{ date: '2026-11-07', tempMaxC: 10 }] });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    advance(1);
    await service.get('TR');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('keeps counties apart', async () => {
    const { service, fetchFn } = setup(async () => ok());
    await service.get('TR');
    await service.get('DJ');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('shares one download between concurrent requests', async () => {
    const { service, fetchFn } = setup(async () => ok());
    await Promise.all([service.get('TR'), service.get('TR'), service.get('TR')]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('returns null for an unknown county without calling out', async () => {
    const { service, fetchFn } = setup(async () => ok());
    expect(await service.get('XX')).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('serves the old copy, marked, when Open-Meteo fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let up = true;
    const { service, advance } = setup(async () => (up ? ok() : new Response('', { status: 429 })));
    const fresh = await service.get('TR');
    up = false;
    advance(cache_hours.value * HOUR);
    const old = await service.get('TR');
    expect(old).toMatchObject({ stale: true, fetchedAt: fresh!.fetchedAt });
    error.mockRestore();
  });

  it('waits before retrying, then recovers', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let up = false;
    const { service, fetchFn, advance } = setup(async () =>
      up ? ok() : new Response('{"error":true}', { status: 200 }),
    );
    await expect(service.get('TR')).rejects.toBeInstanceOf(WeatherUnavailableError);
    await expect(service.get('TR')).rejects.toBeInstanceOf(WeatherUnavailableError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    up = true;
    advance(retry_minutes.value * 60_000);
    expect(await service.get('TR')).toMatchObject({ stale: false });
    error.mockRestore();
  });
});
