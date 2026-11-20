import { describe, expect, it, vi } from 'vitest';
import { loadData, RainOutlookSchema, type RainClimatology } from '@cropcash/shared';
import { createRainOutlookService, RainOutlookUnavailableError } from './rain-outlook';

const data = loadData();
const { seasonal_cache_hours } = data.params.rain_outlook;
const { retry_minutes } = data.params.weather;
const HOUR = 3_600_000;
const seasons = data.params.rain_outlook.seasons.items;

/** Teleorman built, every season with 1991–2025 totals of 100…440 mm and models that disagree. */
const climatology: RainClimatology = {
  meta: {
    built_at: '2026-11-20T00:00:00Z',
    history_years: { from: 1991, to: 2025 },
    model_reference: { from: 1991, to: 2020 },
    model_window: { from: 2027, to: 2036 },
    seasons: seasons.map(({ id, from_month, to_month }) => ({ id, from_month, to_month })),
    sources: [],
    attribution: '',
    missing: data.counties.counties.map((c) => c.code).filter((c) => c !== 'TR'),
  },
  counties: [
    {
      code: 'TR',
      grid: { lat: 43.97, lon: 25.27 },
      seasons: Object.fromEntries(
        seasons.map((s) => [
          s.id,
          {
            totals: Object.fromEntries(Array.from({ length: 35 }, (_, i) => [String(1991 + i), 100 + i * 10])),
            models: { A: 0.1, B: -0.1, C: 0.05 },
          },
        ]),
      ),
    },
  ],
};

// Real shape: the Seasonal API's monthly answer for Teleorman on 2026-11-20.
const body = {
  monthly: {
    time: ['2026-11-01', '2026-12-01', '2027-01-01'],
    precipitation_mean: [102.8, 43.6, 35.9],
    precipitation_anomaly: [61.9, 3.2, 0.7],
  },
};
const ok = () => new Response(JSON.stringify(body), { status: 200 });

function setup(fetchImpl: (url: string) => Promise<Response>, start = '2026-12-02T10:00:00Z', apiKey?: string) {
  let time = Date.parse(start);
  const fetchFn = vi.fn(fetchImpl);
  const service = createRainOutlookService({
    data,
    climatology,
    apiKey,
    fetchFn: fetchFn as unknown as typeof fetch,
    now: () => new Date(time),
  });
  return { service, fetchFn, advance: (ms: number) => (time += ms) };
}

describe('rain outlook service', () => {
  it('gives the years from the file and the months still to come', async () => {
    const { service, fetchFn } = setup(async () => ok());
    const out = await service.get('TR');
    expect(() => RainOutlookSchema.parse(out)).not.toThrow();
    expect(out!.years!.seasons.map((s) => s.seasonId)).toEqual(seasons.map((s) => s.id));
    expect(out!.years!.seasons[0]).toMatchObject({ years: 35, usualMm: 270 });
    // 2 December: November is gone, December is the current month, so January on.
    expect(out!.months!.map((m) => [m.month, m.lean])).toEqual([['2027-01', 'usual']]);
    expect(out).toMatchObject({ monthsStale: false, monthsFetchedAt: '2026-12-02T10:00:00.000Z' });
    const url = fetchFn.mock.calls[0]![0];
    expect(url).toContain('https://seasonal-api.open-meteo.com/v1/seasonal?latitude=43.98&longitude=25.33');
    expect(url).toContain('monthly=precipitation_mean%2Cprecipitation_anomaly');
    expect(url).not.toContain('apikey');
  });

  it('uses the customer server with a key', async () => {
    const { service, fetchFn } = setup(async () => ok(), undefined, 'k1');
    await service.get('TR');
    expect(fetchFn.mock.calls[0]![0]).toMatch(/^https:\/\/customer-seasonal-api\.open-meteo\.com\/.*apikey=k1/);
  });

  it('fetches a county once while the copy is fresh, and keeps counties apart', async () => {
    const { service, fetchFn, advance } = setup(async () => ok());
    await service.get('TR');
    advance(seasonal_cache_hours.value * HOUR - 1);
    await service.get('TR');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await service.get('TM');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    advance(1);
    await service.get('TR');
    expect(fetchFn).toHaveBeenCalledTimes(3);
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

  it('serves the old months, marked, when Open-Meteo fails, then waits before retrying', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let up = true;
    const { service, fetchFn, advance } = setup(async () => (up ? ok() : new Response('', { status: 429 })));
    const fresh = await service.get('TR');
    up = false;
    advance(seasonal_cache_hours.value * HOUR);
    const old = await service.get('TR');
    expect(old).toMatchObject({ monthsStale: true, monthsFetchedAt: fresh!.monthsFetchedAt });
    await service.get('TR');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    up = true;
    advance(retry_minutes.value * 60_000);
    expect(await service.get('TR')).toMatchObject({ monthsStale: false });
    error.mockRestore();
  });

  it('still gives the years when the months never came', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { service } = setup(async () => new Response('{"error":true}', { status: 200 }));
    const out = await service.get('TR');
    expect(out).toMatchObject({ months: null, monthsFetchedAt: null, monthsStale: false });
    expect(out!.years).not.toBeNull();
    error.mockRestore();
  });

  it('still gives the months for a county not built yet', async () => {
    const { service } = setup(async () => ok());
    const out = await service.get('TM');
    expect(out!.years).toBeNull();
    expect(out!.months).not.toBeNull();
  });

  it('throws only when there is nothing at all to show', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { service } = setup(async () => {
      throw new Error('offline');
    });
    await expect(service.get('TM')).rejects.toBeInstanceOf(RainOutlookUnavailableError);
    error.mockRestore();
  });
});
