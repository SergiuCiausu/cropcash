import { describe, expect, it } from 'vitest';
import { loadRainClimatology } from './rain-climatology-data';
import { loadData } from '../data';
import {
  buildRainCounty,
  countyRainOutlook,
  rainYieldLink,
  type RainClimatology,
} from './rain-climatology';
import { percentile, type DailyRain, type RainOutlookParams, type RainSeason } from './rain-outlook';

const data = loadData();
const params = data.params.rain_outlook;

function series(years: number[], mmFor: (year: number, month: number) => number | null): DailyRain[] {
  const out: DailyRain[] = [];
  for (const y of years) {
    for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 1)) {
      out.push({ date: d.toISOString().slice(0, 10), mm: mmFor(y, d.getUTCMonth() + 1) });
    }
  }
  return out;
}
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const aprMay: RainSeason = { id: 'test', from_month: 4, to_month: 5, label_ro: 'Test' };
const windows = { history: { from: 2011, to: 2020 }, reference: { from: 2001, to: 2002 }, future: { from: 2031, to: 2032 } };
const modelYears = [2001, 2002, 2031, 2032];

describe('buildRainCounty', () => {
  const history = series(range(2009, 2021), (y) => (y - 2010) / 10);
  const models = {
    WET: series(modelYears, (y) => (y > 2020 ? 1.2 : 1)),
    DRY: series(modelYears, (y) => (y > 2020 ? 0.9 : 1)),
  };
  const entry = buildRainCounty('XX', { lat: 44.123456, lon: 25.987654 }, history, models, [aprMay], windows);

  it('keeps only the history window and rounds to 0.1 mm', () => {
    const years = Object.keys(entry.seasons.test!.totals);
    expect(years[0]).toBe('2011');
    expect(years.at(-1)).toBe('2020');
    expect(entry.seasons.test!.totals['2013']).toBe(18.3); // 0.3 mm × 61 days
  });

  it('stores each model change and the grid point', () => {
    expect(entry.seasons.test!.models).toEqual({ WET: 0.2, DRY: -0.1 });
    expect(entry.grid).toEqual({ lat: 44.1235, lon: 25.9877 });
  });
});

describe('countyRainOutlook', () => {
  const p: RainOutlookParams = {
    ...params,
    history_from_year: { ...params.history_from_year, value: 2011 },
    models_agree_min: { ...params.models_agree_min, value: 2 },
    seasons: { ...params.seasons, items: [aprMay] },
  };
  const file = (models: Record<string, number>, months = { from_month: 4, to_month: 5 }): RainClimatology => ({
    meta: {
      built_at: '2026-11-20T00:00:00Z',
      history_years: windows.history,
      model_reference: windows.reference,
      model_window: { from: 2027, to: 2036 },
      seasons: [{ id: 'test', ...months }],
      sources: [],
      attribution: '',
      missing: [],
    },
    counties: [
      {
        code: 'XX',
        grid: { lat: 44, lon: 25 },
        seasons: { test: { totals: Object.fromEntries(range(2011, 2020).map((y) => [String(y), (y - 2010) * 10])), models } },
      },
    ],
  });

  it('computes the range live from the stored totals', () => {
    const o = countyRainOutlook(file({ A: 0.1, B: -0.1 }), 'XX', p)!;
    expect(o.modelWindow).toEqual({ from: 2027, to: 2036 });
    expect(o.seasons).toHaveLength(1);
    expect(o.seasons[0]).toMatchObject({ seasonId: 'test', label: 'Test', usualMm: 55, years: 10 });
    expect(o.seasons[0]!.trend?.applied).toBe(false);
  });

  it('moves the range when enough models agree, using today’s agreement rule', () => {
    expect(countyRainOutlook(file({ A: 0.1, B: 0.3 }), 'XX', p)!.seasons[0]!.usualMm).toBe(Math.round(55 * 1.2));
    const stricter = { ...p, models_agree_min: { ...p.models_agree_min, value: 3 } };
    expect(countyRainOutlook(file({ A: 0.1, B: 0.3 }), 'XX', stricter)!.seasons[0]!.usualMm).toBe(55);
  });

  it('leaves out a season whose months changed since the build', () => {
    expect(countyRainOutlook(file({}, { from_month: 3, to_month: 5 }), 'XX', p)!.seasons).toEqual([]);
  });

  it('returns null for a county not built yet', () => {
    expect(countyRainOutlook(file({}), 'YY', p)).toBeNull();
  });
});

describe('docs/data/rain-climatology.json', () => {
  // Built by npm run weather:climatology. A run stopped by the rate limit lists the rest as missing.
  const file = loadRainClimatology();

  it('accounts for every county: built, or listed as missing', () => {
    const built = file.counties.map((c) => c.code);
    const all = data.counties.counties.map((c) => c.code);
    expect([...built, ...file.meta.missing].sort()).toEqual([...all].sort());
    expect(built.filter((c) => file.meta.missing.includes(c))).toEqual([]);
  });

  it('was built with the seasons now in plan-params', () => {
    expect(file.meta.seasons).toEqual(params.seasons.items.map(({ id, from_month, to_month }) => ({ id, from_month, to_month })));
    for (const county of file.counties) {
      for (const s of params.seasons.items) expect(Object.keys(county.seasons[s.id]!.totals).length).toBeGreaterThan(0);
    }
  });
});

describe('rainYieldLink', () => {
  const years = range(2011, 2025);
  const history = (series: (number | null)[]) => ({ ...data.crops.county_history, first_year: 2011, data: { XX: { porumb: series } } });
  /** Rain 100…240 mm in 2011–2025; a longer history 1991–2010 sets the dry threshold. */
  const rainByYear = (y: number) => (y < 2011 ? 200 + (y - 1991) * 5 : 100 + ((y * 7) % 15) * 10);
  const county = {
    code: 'XX',
    grid: { lat: 0, lon: 0 },
    seasons: {
      porumb: { totals: Object.fromEntries(range(1991, 2025).map((y) => [String(y), rainByYear(y)])), models: {} },
    },
  };
  const minYears = data.params.yield_history.min_years.value;

  it('shows the link when yield follows the rain, with the dry years and their median', () => {
    // Yield = 20 kg/ha per mm, plus a steady rise of 50 kg/ha a year that detrending removes.
    const link = rainYieldLink(county, 'porumb', history(years.map((y) => rainByYear(y) * 20 + (y - 2011) * 50)), params, minYears)!;
    expect(link.years).toBe(15);
    expect(link.r).toBeGreaterThan(0.8);
    expect(link.shown).toBe(true);
    const dryBelow = percentile(Object.values(county.seasons.porumb.totals), params.dry_percentile.value);
    expect(link.dryYears).toEqual(years.filter((y) => rainByYear(y) < dryBelow));
    expect(link.dryYieldKgHa!).toBeLessThan(link.otherYieldKgHa!);
  });

  it('stays quiet when yield does not follow the rain', () => {
    const flat = rainYieldLink(county, 'porumb', history(years.map((y) => 4000 + ((y * 13) % 7) * 100)), params, minYears)!;
    expect(flat.r).toBeLessThan(params.yield_link_min_r.value);
    expect(flat.shown).toBe(false);
  });

  it('skips years INS left empty, and needs enough years', () => {
    const gaps = years.map((y, i) => (i < 5 ? null : rainByYear(y) * 20));
    expect(rainYieldLink(county, 'porumb', history(gaps), params, minYears)).toBeNull();
    expect(rainYieldLink(county, 'porumb', history(gaps), params, 10)!.years).toBe(10);
  });

  it('returns null without a season or an INS row', () => {
    expect(rainYieldLink(county, 'grau', history([]), params, minYears)).toBeNull();
    expect(rainYieldLink({ ...county, code: 'YY' }, 'porumb', history([]), params, minYears)).toBeNull();
  });

  it('on the real Teleorman data: maize follows the rain, wheat does not (step 6)', () => {
    const tr = loadRainClimatology().counties.find((c) => c.code === 'TR')!;
    const h = data.crops.county_history;
    const maize = rainYieldLink(tr, 'porumb', h, params, minYears)!;
    const wheat = rainYieldLink(tr, 'grau', h, params, minYears)!;
    expect(maize.shown).toBe(true);
    expect(maize.dryYears).toEqual([2015, 2024, 2025]);
    expect(maize.dryYieldKgHa!).toBeLessThan(maize.otherYieldKgHa! / 2);
    expect(wheat.shown).toBe(false);
  });
});
