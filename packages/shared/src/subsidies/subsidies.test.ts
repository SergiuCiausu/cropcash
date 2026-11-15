import { describe, expect, it } from 'vitest';
import { CropsFileSchema, FALLOW_CROP_ID, isFallow, loadData } from '../data';
import { computeRangeFactors, computeSubsidies, type FarmInput } from './index';

const data = loadData();
const RATE = { exchangeRates: { FEGA: 5.28, FEADR: 5.28 } };

const eligibleCodes = (farm: FarmInput) =>
  computeSubsidies(farm, data, RATE).schemes.map((s) => s.code).sort();

/** Ion: 15 ha in two crops, 55 years old, no animals (docs/03-subsidies.md §8). */
const ion: FarmInput = {
  parcels: [
    { cropId: 'grau', areaHa: 8 },
    { cropId: 'porumb', areaHa: 7 },
  ],
  age: 55,
};

describe('data files', () => {
  it('all docs/data JSON files validate', () => {
    expect(data.subsidies.schemes.length).toBeGreaterThan(0);
    expect(data.calendar.events.length).toBeGreaterThan(0);
    expect(data.crops.crops.filter((c) => !c.family).map((c) => c.id)).toEqual(['grau', 'porumb', 'floarea-soarelui', 'teren-necultivat']);
  });

  it('crop expense shares sum to 100%', () => {
    for (const crop of data.crops.crops.filter((c) => !isFallow(c))) {
      expect(crop.expense_months.reduce((s, m) => s + m.share_pct, 0)).toBe(100);
    }
  });
});

describe('computeSubsidies — reference test case', () => {
  const tc = data.subsidies.test_cases[0]!;
  const result = computeSubsidies(ion, data, { exchangeRates: { FEGA: tc.exchange_rate_param } });

  it('the farm matches the test case profile', () => {
    expect(tc.input.total_ha).toBe(15);
    expect(tc.input.distinct_crops).toBe(2);
  });

  it('eligible schemes are exactly PD-01, PD-02, PD-04', () => {
    expect(result.schemes.map((s) => s.code).sort()).toEqual([...tc.expected_schemes].sort());
  });

  it('per-scheme euros are exact', () => {
    for (const s of result.schemes) {
      expect(s.eur.probable).toBe(Math.round(tc.expected_by_scheme_eur[s.code]! * 100));
    }
  });

  it('total is exactly 3,195.00 EUR', () => {
    expect(result.totals.eur.probable).toBe(319500);
    expect(result.totals.eur.probable).toBe(Math.round(tc.expected_total_eur * 100));
  });

  it('total in lei = 16,865.77 at 5.2788 and advance = 12,649.32 lei', () => {
    expect(result.totals.lei.probable).toBe(Math.round(tc.expected_total_lei * 100));
    expect(result.totals.advanceLei).toBe(Math.round(tc.expected_advance_lei * 100));
    expect(result.totals.advanceEur).toBe(239625);
  });

  it('advance + balance = total', () => {
    expect(result.totals.advanceLei + result.totals.balanceLei.probable).toBe(result.totals.lei.probable);
  });

  it('min <= probable <= max', () => {
    const { min, probable, max } = result.totals.eur;
    expect(min).toBeLessThanOrEqual(probable);
    expect(probable).toBeLessThanOrEqual(max);
    expect(min).toBeLessThan(probable);
  });

  it('lei total depends on the exchange-rate parameter', () => {
    const other = computeSubsidies(ion, data, { exchangeRates: { FEGA: 5.0806 } });
    expect(other.totals.eur.probable).toBe(319500);
    expect(other.totals.lei.probable).toBe(Math.round(3195 * 5.0806 * 100));
  });

  it('explains why PD-03 and PD-05 do not apply', () => {
    const pd03 = result.notEligible.find((n) => n.code === 'PD-03')!;
    expect(pd03.failed[0]).toMatchObject({ field: 'age', op: '<', expected: 40, actual: 55 });
    const pd05 = result.notEligible.find((n) => n.code === 'PD-05')!;
    expect(pd05.failed[0]).toMatchObject({ field: 'total_ha', op: '<=', expected: 10, actual: 15 });
  });

  it('flags DE-VERIFICAT rules that were used (CRISS 50 ha cap)', () => {
    const criss = result.schemes.find((s) => s.code === 'PD-02')!;
    expect(criss.unverified.some((u) => u.field === 'total_ha' && u.value === 50)).toBe(true);
  });
});

describe('computeSubsidies — default exchange rate', () => {
  it('uses the official 2026 FEGA rate, and the default for FEADR until it is confirmed', () => {
    const r = computeSubsidies(ion, data);
    expect(r.rates.FEGA).toEqual({ value: 5.2788, confirmed: true });
    expect(r.rates.FEADR).toEqual({ value: 5.2788, confirmed: false });
  });

  it('an override is not an official rate', () => {
    expect(computeSubsidies(ion, data, RATE).rates.FEGA).toEqual({ value: 5.28, confirmed: false });
  });
});

describe('range factors', () => {
  it('BISS factors come from 2023–2025 actual vs planned', () => {
    const f = computeRangeFactors(data.history, 'PD-01');
    expect(f.min).toBeCloseTo(89.34 / 99.27, 6);
    expect(f.max).toBeCloseTo(97.57 / 96.47, 6);
    expect(f.isFallback).toBe(false);
  });

  it('schemes without history fall back to BISS', () => {
    const f = computeRangeFactors(data.history, 'PD-04');
    expect(f).toMatchObject({ basedOn: 'PD-01', isFallback: true });
  });
});

describe('eligibility boundaries', () => {
  const twoCrops = (ha: number): FarmInput => ({
    parcels: [
      { cropId: 'grau', areaHa: ha / 2 },
      { cropId: 'porumb', areaHa: ha / 2 },
    ],
    age: 55,
  });

  it('PD-04: 10.00 ha no, 10.01 ha yes', () => {
    expect(eligibleCodes(twoCrops(10))).not.toContain('PD-04');
    expect(
      eligibleCodes({
        parcels: [
          { cropId: 'grau', areaHa: 5 },
          { cropId: 'porumb', areaHa: 5.01 },
        ],
        age: 55,
      }),
    ).toContain('PD-04');
  });

  it('PD-04: 15 ha with a single crop does not qualify', () => {
    expect(eligibleCodes({ parcels: [{ cropId: 'grau', areaHa: 15 }], age: 55 })).not.toContain('PD-04');
  });

  it('PD-04: a 0.29 ha parcel does not count', () => {
    const r = computeSubsidies(
      {
        parcels: [
          { cropId: 'grau', areaHa: 10 },
          { cropId: 'porumb', areaHa: 0.29 },
        ],
        age: 55,
      },
      data,
      RATE,
    );
    expect(r.schemes.map((s) => s.code)).not.toContain('PD-04');
    const pd04 = r.notEligible.find((n) => n.code === 'PD-04')!;
    expect(pd04.failed.map((f) => f.field)).toContain('arable_ha');
  });

  it('PD-04: 0.30 ha parcel counts toward area', () => {
    const r = computeSubsidies(
      {
        parcels: [
          { cropId: 'grau', areaHa: 9.71 },
          { cropId: 'porumb', areaHa: 0.3 },
        ],
        age: 55,
      },
      data,
      RATE,
    );
    expect(r.schemes.find((s) => s.code === 'PD-04')?.units).toBe(1001);
  });

  it('PD-02 (CRISS): 50 ha yes, 51 ha no', () => {
    expect(eligibleCodes(twoCrops(50))).toContain('PD-02');
    expect(eligibleCodes(twoCrops(51))).not.toContain('PD-02');
  });

  it('PD-03: 39 years yes, 40 years no', () => {
    expect(eligibleCodes({ ...ion, age: 39 })).toContain('PD-03');
    expect(eligibleCodes({ ...ion, age: 40 })).not.toContain('PD-03');
  });

  it('PD-05: farms up to 10 ha', () => {
    expect(eligibleCodes(twoCrops(8))).toContain('PD-05');
    expect(eligibleCodes(twoCrops(10.5))).not.toContain('PD-05');
  });

  it('PD-04 above 30 ha flags the unverified diversification rule', () => {
    const r = computeSubsidies(twoCrops(40), data, RATE);
    const pd04 = r.schemes.find((s) => s.code === 'PD-04')!;
    expect(pd04.unverified.some((u) => u.field === 'arable_ha' && u.op === '>' && u.value === 30)).toBe(true);
  });

  it('disabled schemes (animals, future plan) are ignored entirely', () => {
    const r = computeSubsidies({ ...ion, dairyCows: 3, beefCattle: 2 }, data, RATE);
    const codes = [...r.schemes, ...r.notEligible, ...r.excluded].map((s) => s.code);
    expect(codes).not.toContain('CPL-VACI-LAPTE');
    expect(codes).not.toContain('CPL-VITA-CARNE');
    expect(r.totals.eur.probable).toBe(319500);
  });

  it('PD-28 is estimated at the 2025 amount, on all arable land, and stays out of the totals', () => {
    const r = computeSubsidies({ ...ion, unproductiveHa: 1 }, data, RATE);
    expect(r.excluded).toEqual([]);
    expect(r.estimated).toHaveLength(1);
    const pd28 = r.estimated[0]!;
    expect(pd28).toMatchObject({ code: 'PD-28', units: 1500, amountEurPerUnit: 32.9366, advanceEur: 0 });
    expect(pd28.estimate).toMatchObject({ basisYear: 2025, status: 'din-2025' });
    expect(r.totals.eur.probable).toBe(319500);
  });

  it('rejects non-positive parcel areas', () => {
    expect(() => computeSubsidies({ parcels: [{ cropId: 'grau', areaHa: 0 }], age: 50 }, data)).toThrow();
  });
});

describe('teren necultivat (fallow land)', () => {
  const pd28 = (farm: FarmInput) => computeSubsidies(farm, data, RATE).estimated.find((x) => x.code === 'PD-28');
  const fallow = (areaHa: number) => ({ cropId: FALLOW_CROP_ID, areaHa });

  it('is in docs/data as the one fallow crop', () => {
    const crop = data.crops.crops.find((c) => c.id === FALLOW_CROP_ID)!;
    expect(crop.kind).toBe('fallow');
    expect(data.crops.crops.filter((c) => c.kind === 'fallow')).toHaveLength(1);
  });

  it('the data check refuses a fallow crop with costs or a second fallow crop', () => {
    const raw: typeof data.crops = JSON.parse(JSON.stringify(data.crops));
    const withCost = { ...raw, crops: raw.crops.map((c) => (isFallow(c) ? { ...c, cost_lei_per_ha: { min: 1, mean: 1, max: 1 } } : c)) };
    expect(CropsFileSchema.safeParse(withCost).success).toBe(false);
    const twice = { ...raw, crops: raw.crops.map((c) => (c.id === 'grau' ? { ...c, kind: 'fallow' as const } : c)) };
    expect(CropsFileSchema.safeParse(twice).success).toBe(false);
  });

  it('counts as arable land and as a crop of its own for PD-04', () => {
    const oneCrop: FarmInput = { age: 55, parcels: [{ cropId: 'grau', areaHa: 15 }] };
    expect(eligibleCodes(oneCrop)).not.toContain('PD-04');
    const withFallow: FarmInput = { ...oneCrop, parcels: [...oneCrop.parcels, fallow(1)] };
    expect(eligibleCodes(withFallow)).toContain('PD-04');
    const pd01 = computeSubsidies(withFallow, data, RATE).schemes.find((x) => x.code === 'PD-01')!;
    expect(pd01.units).toBe(1600);
  });

  it('PD-28 needs at least 2% of the arable land uncultivated', () => {
    // 0.3 of 15.3 ha is 1.96%: not enough.
    expect(pd28({ ...ion, parcels: [...ion.parcels, fallow(0.3)] })).toBeUndefined();
    // 1 of 16 ha is 6.25%: paid on all 16 ha.
    expect(pd28({ ...ion, parcels: [...ion.parcels, fallow(1)] })?.units).toBe(1600);
  });

  it('field margins without a parcel count too, exactly at the threshold', () => {
    expect(pd28({ ...ion, unproductiveHa: 0.3 })?.units).toBe(1500); // 0.3 / 15 = 2.00%
    expect(pd28({ ...ion, unproductiveHa: 0.29 })).toBeUndefined();
  });

  it('a failed share reads back in %', () => {
    const r = computeSubsidies({ ...ion, parcels: [...ion.parcels, fallow(0.3)] }, data, RATE);
    expect(r.notEligible.find((n) => n.code === 'PD-28')?.failed).toEqual([{ field: 'unproductive_pct', op: '>=', expected: 2, actual: 1.96 }]);
  });

  it('the totals are the counted schemes alone', () => {
    const r = computeSubsidies({ ...ion, parcels: [...ion.parcels, fallow(1)] }, data, RATE);
    expect(r.estimated.map((x) => x.code)).toEqual(['PD-28']);
    expect(r.totals.eur.probable).toBe(r.schemes.reduce((sum, x) => sum + x.eur.probable, 0));
  });
});
