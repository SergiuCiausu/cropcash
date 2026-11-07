import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { computeSubsidies } from '../subsidies';
import {
  OnboardingInputSchema,
  birthYearFromAge,
  farmInputFromOnboarding,
  farmInputFromStored,
  validateOnboarding,
  type OnboardingInput,
} from './index';

const data = loadData();
const ion: OnboardingInput = {
  name: 'Ion',
  county: 'TR',
  age: 55,
  parcels: [
    { cropId: 'grau', areaHa: 8 },
    { cropId: 'porumb', areaHa: 7 },
  ],
};

describe('onboarding input', () => {
  it('accepts Ion', () => {
    expect(OnboardingInputSchema.safeParse(ion).success).toBe(true);
    expect(validateOnboarding(ion, data)).toEqual([]);
  });

  it('rejects empty farms, zero areas and 3 decimals', () => {
    expect(OnboardingInputSchema.safeParse({ ...ion, parcels: [] }).success).toBe(false);
    expect(OnboardingInputSchema.safeParse({ ...ion, parcels: [{ cropId: 'grau', areaHa: 0 }] }).success).toBe(false);
    expect(OnboardingInputSchema.safeParse({ ...ion, parcels: [{ cropId: 'grau', areaHa: 1.234 }] }).success).toBe(
      false,
    );
    expect(OnboardingInputSchema.safeParse({ ...ion, parcels: [{ cropId: 'grau', areaHa: 10.01 }] }).success).toBe(
      true,
    );
  });

  it('rejects blank names and unrealistic ages', () => {
    expect(OnboardingInputSchema.safeParse({ ...ion, name: '   ' }).success).toBe(false);
    expect(OnboardingInputSchema.safeParse({ ...ion, age: 7 }).success).toBe(false);
  });

  it('checks counties and crops against reference data', () => {
    expect(validateOnboarding({ ...ion, county: 'XX' }, data)).toContain('unknown_county');
    expect(validateOnboarding({ ...ion, parcels: [{ cropId: 'orez', areaHa: 1 }] }, data)).toContain('unknown_crop');
    expect(
      validateOnboarding(
        {
          ...ion,
          parcels: [
            { cropId: 'grau', areaHa: 1 },
            { cropId: 'grau', areaHa: 2 },
          ],
        },
        data,
      ),
    ).toContain('duplicate_crop');
  });

  it('has all 42 counties including Teleorman', () => {
    expect(data.counties.counties).toHaveLength(42);
    expect(data.counties.counties.find((c) => c.code === 'TR')?.name_ro).toBe('Teleorman');
  });
});

describe('stored farm round-trip', () => {
  it('onboarding and stored farm produce the same subsidy', () => {
    const year = data.subsidies.meta.campaign_year;
    const stored = {
      birth_year: birthYearFromAge(ion.age, year),
      parcels: [
        { crop_id: 'grau', area_ari: 800, is_arable: true },
        { crop_id: 'porumb', area_ari: 700, is_arable: true },
      ],
    };
    const a = computeSubsidies(farmInputFromOnboarding(ion), data);
    const b = computeSubsidies(farmInputFromStored(stored, year), data);
    expect(b.totals).toEqual(a.totals);
    expect(a.totals.eur.probable).toBe(319500);
  });
});
