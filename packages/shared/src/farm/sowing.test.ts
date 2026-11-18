import { describe, expect, it } from 'vitest';
import { HarvestsInputSchema } from './harvests';
import { SowingSchema, measureText, readMeasure, sowingOrNothing, toMillimetres } from './sowing';

const doc = (parcel: object) => ({ years: [{ year: 2027, status: 'open', openingBani: 0, parcels: [{ cropId: 'grau', areaHa: 8, ...parcel }] }], gathered: [] });

describe('how a crop was sown', () => {
  it('reads a number with a comma or a dot, and refuses blanks, zero and words', () => {
    expect(readMeasure('12,5', 'cm')).toEqual({ value: 12.5, unit: 'cm' });
    expect(readMeasure(' 4 ', 'mm')).toEqual({ value: 4, unit: 'mm' });
    for (const bad of ['', '0', 'patru', '4 cm', '-3', '1,2,3']) expect(readMeasure(bad, 'cm')).toBeNull();
  });

  it('converts each unit to millimetres and writes the number back with a comma', () => {
    expect(toMillimetres({ value: 4, unit: 'cm' })).toBe(40);
    expect(toMillimetres({ value: 0.7, unit: 'm' })).toBe(700);
    expect(toMillimetres({ value: 35, unit: 'mm' })).toBe(35);
    expect(measureText({ value: 12.5, unit: 'cm' })).toBe('12,5 cm');
  });

  it('takes any one, two or all three fields, but not none', () => {
    const depth = { value: 4, unit: 'cm' as const };
    const row = { value: 12.5, unit: 'cm' as const };
    const plant = { value: 3, unit: 'cm' as const };
    for (const s of [{ depth }, { rowSpacing: row }, { plantSpacing: plant }, { depth, rowSpacing: row }, { depth, rowSpacing: row, plantSpacing: plant }]) {
      expect(SowingSchema.safeParse(s).success).toBe(true);
    }
    expect(SowingSchema.safeParse({}).success).toBe(false);
    expect(sowingOrNothing({})).toBeUndefined();
    expect(sowingOrNothing({ depth, rowSpacing: undefined })).toEqual({ depth });
  });

  it('refuses a depth or spacing that is surely a wrong unit', () => {
    expect(SowingSchema.safeParse({ depth: { value: 4, unit: 'm' } }).success).toBe(false);
    expect(SowingSchema.safeParse({ rowSpacing: { value: 70, unit: 'm' } }).success).toBe(false);
    expect(SowingSchema.safeParse({ depth: { value: 4, unit: 'in' } }).success).toBe(false);
  });

  it('is saved on a harvest crop, and documents without it stay valid', () => {
    expect(HarvestsInputSchema.safeParse(doc({})).success).toBe(true);
    expect(HarvestsInputSchema.safeParse(doc({ sowing: { depth: { value: 4, unit: 'cm' } } })).success).toBe(true);
    expect(HarvestsInputSchema.safeParse(doc({ sowing: {} })).success).toBe(false);
  });
});
