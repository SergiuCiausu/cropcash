import { describe, expect, it } from 'vitest';
import { FertilizerUseSchema, NewFertilizerProductSchema, fertilizerProductId, type NitrogenLimitsFile } from './model';
import { harvestNitrogen, nitrogenGrams, nitrogenKgPerHa, nitrogenVerdict } from './nitrogen';

// Test fixtures, not reference figures.
const urea = { form: 'solid' as const, n_total_bp: 4600, density_kg_l: null };
const uan = { form: 'liquid' as const, n_total_bp: 3000, density_kg_l: 1.3 };
const noDensity = { form: 'liquid' as const, n_total_bp: 3000, density_kg_l: null };
const unknownN = { form: 'solid' as const, n_total_bp: null, density_kg_l: null };

const limits: NitrogenLimitsFile = {
  meta: { description: 'test' },
  manure_n_cap_kg_ha: { value: 170, status: 'confirmat' },
  crops: {
    grau: { max_n_kg_ha: 100, status: 'confirmat' },
    porumb: { max_n_kg_ha: 999, status: 'DE-VERIFICAT' },
  },
};

describe('nitrogenGrams', () => {
  it('works out N in kg of a solid', () => {
    expect(nitrogenGrams(urea, 100, 'kg')).toBe(46_000);
  });
  it('turns litres of a liquid into kg with its density', () => {
    // 100 l × 1.30 kg/l × 30 % = 39 kg
    expect(nitrogenGrams(uan, 100, 'l')).toBe(39_000);
    expect(nitrogenGrams(uan, 100, 'kg')).toBe(30_000);
  });
  it("is null when it can't be known", () => {
    expect(nitrogenGrams(noDensity, 100, 'l')).toBeNull();
    expect(nitrogenGrams(urea, 100, 'l')).toBeNull();
    expect(nitrogenGrams(unknownN, 100, 'kg')).toBeNull();
  });
});

describe('nitrogenKgPerHa', () => {
  it('divides by hectares', () => {
    expect(nitrogenKgPerHa(460_000, 500)).toBe(92); // 460 kg N on 5 ha
    expect(nitrogenKgPerHa(1, 0)).toBeNull();
  });
});

describe('nitrogenVerdict', () => {
  it('judges only with both figures', () => {
    expect(nitrogenVerdict(101, 100)).toBe('over');
    expect(nitrogenVerdict(100, 100)).toBe('ok');
    expect(nitrogenVerdict(100, null)).toBe('unknown');
  });
});

describe('harvestNitrogen', () => {
  type P = { form: 'solid' | 'liquid'; n_total_bp: number | null; density_kg_l: number | null };
  const products = new Map<string, P>([
    ['urea', urea],
    ['uan', uan],
    ['mystery', unknownN],
  ]);
  const parcels = [
    { crop_id: 'grau', area_ari: 500 },
    { crop_id: 'porumb', area_ari: 1000 },
  ];
  const exp = (over: object) => ({ kind: 'expense', category: 'fertilizer', occurred_at: '2027-03-10', harvest_year: 2027, ...over });

  it('adds up each crop and applies only confirmed limits', () => {
    const r = harvestNitrogen(
      2027,
      [
        exp({ crop_id: 'grau', fertilizer_product_id: 'urea', fertilizer_qty: 1000, fertilizer_unit: 'kg' }),
        exp({ crop_id: 'grau', fertilizer_product_id: 'uan', fertilizer_qty: 100, fertilizer_unit: 'l' }),
        exp({ crop_id: 'porumb', fertilizer_product_id: 'urea', fertilizer_qty: 500, fertilizer_unit: 'kg' }),
        exp({ crop_id: null, fertilizer_product_id: 'urea', fertilizer_qty: 10, fertilizer_unit: 'kg' }),
        exp({ crop_id: 'grau', fertilizer_product_id: 'urea', fertilizer_qty: 1000, fertilizer_unit: 'kg', harvest_year: 2026 }),
        { kind: 'expense', category: 'seeds', crop_id: 'grau', occurred_at: '2027-03-10', harvest_year: 2027 },
      ],
      parcels,
      products,
      limits,
    );
    const grau = r.crops.find((c) => c.cropId === 'grau')!;
    // (460 + 39) kg N on 5 ha
    expect(grau).toMatchObject({ grams: 499_000, kgPerHa: 100, limitKgHa: 100, verdict: 'ok' });
    const porumb = r.crops.find((c) => c.cropId === 'porumb')!;
    expect(porumb).toMatchObject({ kgPerHa: 23, limitKgHa: null, verdict: 'unknown' });
    expect(r.farmWideGrams).toBe(4600);
  });

  it("doesn't call a crop ok when a record's N is unknown", () => {
    const r = harvestNitrogen(
      2027,
      [exp({ crop_id: 'grau', fertilizer_product_id: 'mystery', fertilizer_qty: 100, fertilizer_unit: 'kg' })],
      parcels,
      products,
      limits,
    );
    expect(r.crops.find((c) => c.cropId === 'grau')).toMatchObject({ verdict: 'unknown', unknownRecords: 1 });
  });
});

describe('catalogue input', () => {
  it('makes ids from manufacturer and brand', () => {
    expect(fertilizerProductId('Azomureș', 'Nitrocalcar 27')).toBe('azomures-nitrocalcar-27');
    expect(fertilizerProductId(null, 'UAN 32%')).toBe('uan-32');
  });
  it('refuses N forms adding up to more than the total, and a solid with a density', () => {
    const base = { type_id: null, brand: 'X', manufacturer: null, form: 'solid', n_total_bp: 2700 };
    expect(NewFertilizerProductSchema.safeParse(base).success).toBe(true);
    expect(NewFertilizerProductSchema.safeParse({ ...base, n_nitric_bp: 2000, n_ammoniacal_bp: 1000 }).success).toBe(false);
    expect(NewFertilizerProductSchema.safeParse({ ...base, density_kg_l: 1.3 }).success).toBe(false);
  });
  it('takes whole quantities only', () => {
    expect(FertilizerUseSchema.safeParse({ productId: 'urea', qty: 1.5, unit: 'kg' }).success).toBe(false);
  });
});
