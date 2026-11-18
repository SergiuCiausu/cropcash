import { describe, expect, it } from 'vitest';
import { buildFarmPlan, type PlanFarm } from '../cashflow/farm-plan';
import {
  applyOverrides,
  applyValidOverrides,
  crossChecks,
  EDITABLE_FACTORS,
  factorFor,
  listFactors,
  loadData,
  OverrideError,
  OverrideSchema,
  parsePath,
  formatPath,
  RAW_FILES,
  type Override,
  type OverrideErrorCode,
  type RawFiles,
} from './index';

const change = (path: string, value: Override['value']): Override => ({ path, value, reason: 'test: o sursă nouă' });
const WHEAT_PRICE = 'crops.crops[id=grau].price_lei_per_kg.mean';
const wheat = (data = loadData()) => data.crops.crops.filter((c) => (c.family ?? c.id) === 'grau');

function fails(overrides: Override[], code: OverrideErrorCode, raw: RawFiles = RAW_FILES) {
  try {
    applyOverrides(overrides, raw);
  } catch (e) {
    expect(e).toBeInstanceOf(OverrideError);
    expect((e as OverrideError).code).toBe(code);
    return e as OverrideError;
  }
  throw new Error(`expected ${code}, but the changes applied`);
}

const ion: PlanFarm = {
  county: 'TR',
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  demo_now: '2026-11-15T00:00:00Z',
  salary_bani: null,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
  transactions: [],
};

describe('paths', () => {
  it('read and write back the same', () => {
    for (const p of [WHEAT_PRICE, 'subsidies.schemes[code=PD-02].eligibility.rules[field=total_ha,op=<=].value', 'history.schemes.PD-01.actual[year=2025].value'])
      expect(formatPath(parsePath(p))).toBe(p);
  });

  it('never pick an item by position', () => {
    expect(() => parsePath('crops.crops[0].price_lei_per_kg.mean')).toThrow(OverrideError);
    expect(() => parsePath('crops.crops[id=grau.price')).toThrow(OverrideError);
  });

  it('only the listed figures are editable', () => {
    expect(factorFor(WHEAT_PRICE)?.label).toMatch(/Preț/);
    expect(factorFor('crops.crops[id=grau].name_ro')).toBeNull();
    expect(factorFor('params.network.read_timeout_s.value')).toBeNull();
  });
});

describe('the files as written', () => {
  it('pass the cross checks', () => {
    expect(crossChecks(RAW_FILES)).toEqual([]);
  });

  it('list every kind of factor, each pattern at least once', () => {
    const listed = listFactors();
    const paths = listed.map((f) => f.path);
    expect(paths).toContain(WHEAT_PRICE);
    expect(paths).toContain('subsidies.schemes[code=PD-01].amount_eur');
    expect(paths).toContain('subsidies.schemes[code=PD-02].eligibility.rules[field=total_ha,op=>=].value');
    expect(paths).toContain('subsidies.schemes[code=PD-02].eligibility.rules[field=total_ha,op=<=].value');
    expect(paths).toContain('subsidies.schemes[code=PD-04].eligibility.rules[if.field=arable_ha,if.op=<=].if.value');
    expect(paths).toContain('subsidies.exchange_rates[campaign=2026,fund=FEGA].value');
    expect(paths).toContain('history.schemes.PD-01.actual[year=2025].value');
    expect(paths).toContain('params.forecast.years.bad.yield');
    expect(listed.find((f) => f.path === WHEAT_PRICE)?.value).toBe(wheat()[0]!.price_lei_per_kg.mean);
    for (const factor of EDITABLE_FACTORS) expect(listed.some((f) => f.factor === factor), factor.pattern).toBe(true);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('every listed value is one the panel would accept', () => {
    const same = listFactors().map((f) => change(f.path, f.value as Override['value']));
    expect(() => applyOverrides(same)).not.toThrow();
  });

  it('give loadData() back when nothing is changed', () => {
    expect(applyOverrides([])).toBe(loadData());
  });
});

describe('applyOverrides', () => {
  it('changes the figure on every APIA line of the crop, and nothing in docs/data', () => {
    const before = wheat()[0]!.price_lei_per_kg.mean;
    const data = applyOverrides([change(WHEAT_PRICE, 1.1)]);
    expect(wheat(data).length).toBeGreaterThan(0);
    expect(wheat(data).every((c) => c.price_lei_per_kg.mean === 1.1)).toBe(true);
    expect(wheat()[0]!.price_lei_per_kg.mean).toBe(before);
    expect(applyOverrides([])).toBe(loadData());
  });

  it('finds the crop by id after the file is reordered', () => {
    const crops = RAW_FILES.crops as { crops: unknown[] };
    const reordered: RawFiles = { ...RAW_FILES, crops: { ...crops, crops: [...crops.crops].reverse() } };
    expect(wheat(applyOverrides([change(WHEAT_PRICE, 1.1)], reordered))[0]!.price_lei_per_kg.mean).toBe(1.1);
  });

  it('changes what a kind of year means, and the catalogue is rebuilt with the data', () => {
    const data = applyOverrides([change('params.forecast.years.bad.price', 'min'), change('subsidies.schemes[code=PD-01].amount_eur', 110)]);
    expect(data.params.forecast.years.bad.price).toBe('min');
    expect(data.subsidies.schemes.find((s) => s.code === 'PD-01')!.amount_eur).toBe(110);
    expect(data.catalogue.length).toBe(loadData().catalogue.length);
  });

  it('keeps money in whole bani after a change', () => {
    const data = applyOverrides([change(WHEAT_PRICE, 1.13), change('subsidies.exchange_rates[campaign=2026,fund=FEGA].value', 5.1234)]);
    const plan = buildFarmPlan(ion, data, { month: '2026-11' });
    const values = plan.timelines.medium.months.flatMap((m) => [m.balanceEnd, ...m.entries.map((e) => e.value)]);
    expect(values.every(Number.isInteger)).toBe(true);
  });

  it('refuses paths that lead nowhere or may not be changed', () => {
    fails([change('crops.crops[id=ananas].price_lei_per_kg.mean', 1)], 'unknown_path');
    fails([change('crops.crops[id=grau].name_ro', 'Orz')], 'not_editable');
    fails([change('crops.crops[0].price_lei_per_kg.mean', 1)], 'bad_path');
    fails([change(WHEAT_PRICE, 1.1), change(WHEAT_PRICE, 1.2)], 'duplicate_path');
  });

  it('refuses values of the wrong kind', () => {
    fails([change(WHEAT_PRICE, 'scump')], 'invalid_value');
    fails([change(WHEAT_PRICE, -1)], 'invalid_value');
    fails([change(WHEAT_PRICE, 1.005)], 'invalid_value');
    fails([change(WHEAT_PRICE, null)], 'invalid_value');
    fails([change('params.forecast.years.bad.yield', 'worst')], 'invalid_value');
    fails([change('history.range_policy.fallback_scheme', 'PD-99')], 'invalid_value');
    fails([change('params.forecast.entry_day.value', 29)], 'invalid_value');
  });

  it('refuses figures that no longer hold together', () => {
    const e = fails([change(WHEAT_PRICE, 5)], 'check_failed');
    expect(e.path).toBe('crops.crops[id=grau].price_lei_per_kg');
    fails([change('crops.crops[id=grau].expense_months[month=3].share_pct', 50)], 'check_failed');
    fails([change('params.yield_history.extreme_years.value', 8)], 'check_failed');
  });

  it('refuses what the file schema refuses', () => {
    fails([change('subsidies.schemes[code=PD-01].amount_eur', 0)], 'invalid_data');
  });

  it('refuses a path that picks two items, and leaves it out of the list', () => {
    const history = RAW_FILES.history as unknown as { schemes: Record<string, { actual: { year: number; value: number }[] }> };
    const pd01 = history.schemes['PD-01']!;
    const twice: RawFiles = {
      ...RAW_FILES,
      history: { ...history, schemes: { ...history.schemes, 'PD-01': { ...pd01, actual: [...pd01.actual, { year: 2025, value: 1 }] } } },
    };
    fails([change('history.schemes.PD-01.actual[year=2025].value', 90)], 'ambiguous_path', twice);
    expect(listFactors(twice).some((f) => f.path === 'history.schemes.PD-01.actual[year=2025].value')).toBe(false);
  });
});

describe('applyValidOverrides', () => {
  it('keeps the changes that still apply and reports the others', () => {
    const good = change(WHEAT_PRICE, 1.1);
    const stale = change('crops.crops[id=orz-vechi].price_lei_per_kg.mean', 1);
    const { data, applied, rejected } = applyValidOverrides([stale, good]);
    expect(applied).toEqual([good]);
    expect(rejected.map((r) => [r.override, r.error.code])).toEqual([[stale, 'unknown_path']]);
    expect(wheat(data)[0]!.price_lei_per_kg.mean).toBe(1.1);
  });
});

describe('OverrideSchema', () => {
  it('needs a reason', () => {
    expect(OverrideSchema.safeParse({ path: WHEAT_PRICE, value: 1.1, reason: '  ' }).success).toBe(false);
    expect(OverrideSchema.safeParse(change(WHEAT_PRICE, 1.1)).success).toBe(true);
  });
});
