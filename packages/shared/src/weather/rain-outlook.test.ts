import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import {
  modelTrend,
  modelWindow,
  monthLean,
  parseClimateModels,
  parseDailyRain,
  parseSeasonalMonthly,
  percentile,
  seasonOutlook,
  seasonTotals,
  upcomingMonths,
  type DailyRain,
  type RainOutlookParams,
  type RainSeason,
} from './rain-outlook';

const params = loadData().params.rain_outlook;
const season = (id: string): RainSeason => params.seasons.items.find((s) => s.id === id)!;
const APR_MAY = { from_month: 4, to_month: 5 };

/** Every day of the given years, with `mmFor(year, month)` rain each day. */
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

describe('rain outlook params', () => {
  it('has a season for every crop with a county history, plus the whole year', () => {
    const ids = params.seasons.items.map((s) => s.id);
    expect(ids).toContain('an');
    for (const crop of ['grau', 'porumb', 'floarea-soarelui']) expect(ids).toContain(crop);
  });

  it('asks fewer models to agree than the Climate API offers', () => {
    expect(params.models_agree_min.value).toBeLessThanOrEqual(7);
  });
});

describe('parsing', () => {
  it('reads the Historical API and keeps gaps as null', () => {
    const days = parseDailyRain({ daily: { time: ['2024-01-01', '2024-01-02'], precipitation_sum: [1.5, null] } });
    expect(days).toEqual([
      { date: '2024-01-01', mm: 1.5 },
      { date: '2024-01-02', mm: null },
    ]);
  });

  it('refuses columns of different lengths', () => {
    expect(() => parseDailyRain({ daily: { time: ['2024-01-01'], precipitation_sum: [] } })).toThrow('uneven');
  });

  it('splits the Climate API into one series per model, ignoring other columns', () => {
    const models = parseClimateModels({
      daily: {
        time: ['2030-01-01'],
        precipitation_sum_EC_Earth3P_HR: [2],
        precipitation_sum_MRI_AGCM3_2_S: [null],
        temperature_2m_max_EC_Earth3P_HR: [5],
      },
      daily_units: {},
    });
    expect(Object.keys(models).sort()).toEqual(['EC_Earth3P_HR', 'MRI_AGCM3_2_S']);
    expect(models.MRI_AGCM3_2_S).toEqual([{ date: '2030-01-01', mm: null }]);
  });

  it('fails when the Climate API sent no rain at all', () => {
    expect(() => parseClimateModels({ daily: { time: ['2030-01-01'] } })).toThrow('no_models');
  });

  it('reads the Seasonal API monthly mean and anomaly', () => {
    // Shape and values from the real Teleorman response on 2026-11-20.
    const months = parseSeasonalMonthly({
      monthly: {
        time: ['2026-11-01', '2026-12-01'],
        precipitation_mean: [102.8, 43.6],
        precipitation_anomaly: [61.9, 3.2],
      },
    });
    expect(months).toEqual([
      { month: '2026-11', meanMm: 102.8, anomalyMm: 61.9 },
      { month: '2026-12', meanMm: 43.6, anomalyMm: 3.2 },
    ]);
  });
});

describe('seasonTotals', () => {
  it('sums only the season months', () => {
    const totals = seasonTotals(series([2023], (_, m) => (m === 4 ? 1 : m === 5 ? 2 : 100)), APR_MAY);
    expect(totals.get(2023)).toBe(30 * 1 + 31 * 2);
  });

  it('leaves out a year with a missing or null day, so a gap never looks like a drought', () => {
    const withNull = series([2022, 2023], (y, m) => (y === 2023 && m === 5 ? null : 1));
    expect([...seasonTotals(withNull, APR_MAY).keys()]).toEqual([2022]);
    const cut = series([2024], () => 1).filter((d) => d.date < '2024-05-20');
    expect(seasonTotals(cut, APR_MAY).size).toBe(0);
  });

  it('counts 29 days in a leap February', () => {
    const totals = seasonTotals(series([2024, 2025], () => 1), { from_month: 2, to_month: 2 });
    expect(totals.get(2024)).toBe(29);
    expect(totals.get(2025)).toBe(28);
  });
});

describe('percentile', () => {
  it('interpolates between values', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
    expect(percentile([40, 10, 30, 20], 0)).toBe(10);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 10)).toBe(2);
  });

  it('refuses an empty list', () => {
    expect(() => percentile([], 50)).toThrow();
  });
});

describe('modelTrend', () => {
  const ref = { from: 2001, to: 2002 };
  const fut = { from: 2031, to: 2032 };
  const years = [2001, 2002, 2031, 2032];
  /** One model per change: 1 mm a day in the reference years, (1 + change) after. */
  const models = (changes: number[]) =>
    Object.fromEntries(changes.map((c, i) => [`M${i}`, series(years, (y) => (y > 2020 ? 1 + c : 1))]));

  it('compares each model only with itself', () => {
    const t = modelTrend(
      { WET: series(years, (y) => (y > 2020 ? 11 : 10)), DRY: series(years, (y) => (y > 2020 ? 1.1 : 1)) },
      APR_MAY, ref, fut, 2,
    )!;
    expect(t.perModel.WET).toBeCloseTo(0.1);
    expect(t.perModel.DRY).toBeCloseTo(0.1);
    expect(t.applied).toBe(true);
  });

  it('applies the median only when enough models go the same way', () => {
    const agree = modelTrend(models([-0.1, -0.05, -0.2, 0.02]), APR_MAY, ref, fut, 3)!;
    expect(agree.agreeing).toBe(3);
    expect(agree.applied).toBe(true);
    expect(agree.median).toBeCloseTo(-0.075);

    // The real spread for Teleorman, the whole year, 2027–2031 (build step 1).
    const teleorman = modelTrend(models([0.12, -0.21, 0.12, 0.04, 0.03, 0.2, 0.14]), APR_MAY, ref, fut, 6)!;
    expect(teleorman.agreeing).toBe(6);
    expect(teleorman.applied).toBe(true);
    const split = modelTrend(models([0.03, -0.11, 0.19, 0.11, -0.19, 0.12, 0.2]), APR_MAY, ref, fut, 6)!;
    expect(split.agreeing).toBe(5);
    expect(split.applied).toBe(false);
  });

  it('skips a model missing a year of either window', () => {
    const partial = series([2001, 2031, 2032], () => 1);
    const t = modelTrend({ ...models([0.1]), PARTIAL: partial }, APR_MAY, ref, fut, 1)!;
    expect(Object.keys(t.perModel)).toEqual(['M0']);
    expect(t.models).toBe(1);
  });

  it('returns null when no model covers both windows', () => {
    expect(modelTrend({ A: series([2001], () => 1) }, APR_MAY, ref, fut, 1)).toBeNull();
  });

  it('treats a median of zero as no direction', () => {
    const t = modelTrend(models([-0.1, 0, 0.1]), APR_MAY, ref, fut, 1)!;
    expect(t.agreeing).toBe(0);
    expect(t.applied).toBe(false);
  });
});

describe('seasonOutlook', () => {
  // 10 years, the April–May total of year i is i × 61 mm (1 mm a day × i).
  const years = range(2011, 2020);
  const history = series(years, (y) => y - 2010);
  const p: RainOutlookParams = {
    ...params,
    history_from_year: { ...params.history_from_year, value: 2011 },
    low_percentile: { ...params.low_percentile, value: 10 },
    high_percentile: { ...params.high_percentile, value: 90 },
    dry_percentile: { ...params.dry_percentile, value: 20 },
  };
  const aprMay: RainSeason = { id: 'test', from_month: 4, to_month: 5, label_ro: 'Test' };
  const trend = (median: number, applied: boolean) => ({ perModel: {}, median, agreeing: 0, models: 7, applied });

  it('gives the history range when there is no trend', () => {
    const o = seasonOutlook(history, aprMay, null, p)!;
    expect(o).toMatchObject({ fromYear: 2011, toYear: 2020, years: 10 });
    expect(o.usualMm).toBe(Math.round(5.5 * 61));
    expect(o.lowMm).toBe(Math.round(1.9 * 61));
    expect(o.highMm).toBe(Math.round(9.1 * 61));
    expect(o.dryYears).toBe(2);
    expect(o.driest).toEqual([
      { year: 2011, mm: 61 },
      { year: 2012, mm: 122 },
      { year: 2013, mm: 183 },
    ]);
  });

  it('moves the range only when the trend is applied', () => {
    const plain = seasonOutlook(history, aprMay, null, p)!;
    const ignored = seasonOutlook(history, aprMay, trend(-0.2, false), p)!;
    const moved = seasonOutlook(history, aprMay, trend(-0.2, true), p)!;
    expect(ignored.usualMm).toBe(plain.usualMm);
    expect(moved.usualMm).toBe(Math.round(5.5 * 61 * 0.8));
    // P20 of 61…610 is 2.8 × 61 = 170.8; moved by −20%.
    expect(plain.dryBelowMm).toBe(171);
    expect(moved.dryBelowMm).toBe(Math.round(170.8 * 0.8));
    // Past dry years are still counted against the history threshold.
    expect(moved.dryYears).toBe(plain.dryYears);
    expect(moved.trend?.applied).toBe(true);
  });

  it('ignores years before history_from_year', () => {
    const o = seasonOutlook(history, aprMay, null, { ...p, history_from_year: { ...p.history_from_year, value: 2016 } })!;
    expect(o.fromYear).toBe(2016);
    expect(o.years).toBe(5);
  });

  it('returns null with no complete year', () => {
    expect(seasonOutlook([], aprMay, null, p)).toBeNull();
  });

  it('works on the real seasons from plan-params', () => {
    const o = seasonOutlook(series(range(1991, 2025), () => 1), season('porumb'), null, params)!;
    expect(o.usualMm).toBe(30 + 31 + 30 + 31 + 31);
    expect(o.fromYear).toBe(params.history_from_year.value);
  });
});

describe('modelWindow', () => {
  it('starts at the first outlook year', () => {
    const w = modelWindow(2027, params);
    expect(w.from).toBe(2027);
    expect(w.to - w.from + 1).toBe(params.model_window_years.value);
  });
});

describe('monthLean', () => {
  const band = (pct: number): RainOutlookParams => ({
    ...params,
    seasonal_usual_band_pct: { ...params.seasonal_usual_band_pct, value: pct },
  });

  it('compares with the model usual, which is mean minus anomaly', () => {
    // Teleorman, November 2026: 102.8 mean, +61.9 → usual 40.9, about +151%.
    const nov = monthLean({ month: '2026-11', meanMm: 102.8, anomalyMm: 61.9 }, band(15));
    expect(nov.lean).toBe('wetter');
    expect(nov.change).toBeCloseTo(61.9 / 40.9);
    // December: +3.2 on 40.4 is +8%, inside the band.
    expect(monthLean({ month: '2026-12', meanMm: 43.6, anomalyMm: 3.2 }, band(15)).lean).toBe('usual');
    expect(monthLean({ month: '2027-07', meanMm: 30, anomalyMm: -20 }, band(15)).lean).toBe('drier');
  });

  it('says nothing without data or with a zero usual', () => {
    expect(monthLean({ month: '2027-01', meanMm: null, anomalyMm: 1 }, band(15)).lean).toBeNull();
    expect(monthLean({ month: '2027-08', meanMm: 5, anomalyMm: 5 }, band(15)).lean).toBeNull();
  });

  it('keeps the band edge as usual', () => {
    expect(monthLean({ month: '2027-03', meanMm: 115, anomalyMm: 15 }, band(15)).lean).toBe('usual');
  });
});

describe('upcomingMonths', () => {
  it('starts with next month: the current one is partly gone and the 7-day forecast covers it', () => {
    const months = [
      { month: '2026-10', meanMm: 10, anomalyMm: 0 },
      { month: '2026-11', meanMm: 10, anomalyMm: 0 },
      { month: '2026-12', meanMm: 10, anomalyMm: 0 },
    ];
    expect(upcomingMonths(months, '2026-11-20', params).map((m) => m.month)).toEqual(['2026-12']);
    expect(upcomingMonths(months, '2026-11-01', params).map((m) => m.month)).toEqual(['2026-12']);
  });
});
