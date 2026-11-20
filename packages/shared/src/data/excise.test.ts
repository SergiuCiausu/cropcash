import { describe, expect, it } from 'vitest';
import exciseJson from '../../../../docs/data/excise-schemes.json';
import fuelJson from '../../../../docs/data/fuel-excise.json';
import { FuelExciseSchema } from '../reports/fuel';
import { exciseActiveOn, exciseEnrollmentRefusal, ExciseSchemesFileSchema, groupExcise, SetExciseEnrollmentInputSchema, type ExciseScheme } from './excise';

const file = ExciseSchemesFileSchema.parse(exciseJson);
const fuel = FuelExciseSchema.parse(fuelJson);
const scheme = (id: string) => file.schemes.find((s) => s.id === id)!;
/** The details files a scheme may point to, imported so a rename breaks the build. */
const DETAILS: Record<string, unknown> = { 'fuel-excise.json': fuelJson };

const base: ExciseScheme = scheme('motorina-hg1174');
const parseOne = (patch: Partial<ExciseScheme>) =>
  ExciseSchemesFileSchema.safeParse({ meta: { read_on: '2026-11-20' }, schemes: [{ ...base, ...patch }] });

describe('docs/data/excise-schemes.json', () => {
  it('parses, with the diesel refund as the only money that comes in', () => {
    const { revenue, savings } = groupExcise(file);
    expect(revenue.map((s) => s.id)).toEqual(['motorina-hg1174']);
    expect(savings.map((s) => s.id)).toEqual(['motorina-pompa-2027', 'energie-regenerabila-art399', 'tuica-gospodarie']);
  });

  it('points only to data files that exist', () => {
    for (const s of file.schemes) if (s.details_file) expect(DETAILS[s.details_file], s.details_file).toBeDefined();
  });

  it('ends the diesel refund when fuel-excise.json says it ends, and watches the same law', () => {
    expect(base.valid_to).toBe(fuel.scheme_end.value);
    expect(fuel.watch_urls).toContain(base.watch_urls[0]);
    expect(base.legal_basis[0]!.url).toBe(fuel.legal_basis[0]!.url);
  });

  it('keeps a proposal out of force and out of the money', () => {
    const pump = scheme('motorina-pompa-2027');
    expect(pump.status).toBe('propunere');
    expect(exciseActiveOn(pump, '2027-06-01')).toBe(false);
    expect(pump.replaces).toBe('motorina-hg1174');
  });

  it('knows when the diesel refund is in force', () => {
    expect(exciseActiveOn(base, '2026-11-20')).toBe(true);
    expect(exciseActiveOn(base, '2026-12-31')).toBe(true);
    expect(exciseActiveOn(base, '2027-01-01')).toBe(false);
  });

  it('has a source for every figure it states', () => {
    for (const s of file.schemes) {
      if (s.status === 'propunere') expect(s.press_urls?.length).toBeGreaterThan(0);
      else expect(s.legal_basis.length).toBeGreaterThan(0);
    }
  });
});

describe('ExciseSchemesFileSchema rules', () => {
  it('refuses an exemption that counts as revenue', () => {
    expect(parseOne({ kind: 'exemption' }).success).toBe(false);
  });

  it('refuses a refund with no payment delay', () => {
    expect(parseOne({ payment_lag_months: null }).success).toBe(false);
  });

  it('refuses a proposal that counts as revenue', () => {
    expect(parseOne({ status: 'propunere' }).success).toBe(false);
  });

  it('refuses a link to an unknown scheme and a duplicate id', () => {
    expect(parseOne({ replaced_by: 'nu-exista' }).success).toBe(false);
    const twice = ExciseSchemesFileSchema.safeParse({ meta: { read_on: '2026-11-20' }, schemes: [base, base] });
    expect(twice.success).toBe(false);
  });
});

describe('exciseEnrollmentRefusal', () => {
  const refuse = (schemeId: string, year: number, status: 'interested' | 'acord_filed' | 'approved' | 'left') =>
    exciseEnrollmentRefusal(file, { schemeId, year, status });

  it('lets a farm follow or leave any scheme, a proposal too', () => {
    expect(refuse('motorina-pompa-2027', 2027, 'interested')).toBeNull();
    expect(refuse('tuica-gospodarie', 2026, 'left')).toBeNull();
  });

  it('takes an acord only for a scheme with a way to join, in force that year', () => {
    expect(refuse('motorina-hg1174', 2026, 'approved')).toBeNull();
    expect(refuse('motorina-hg1174', 2027, 'acord_filed')).toBe('not_in_force');
    expect(refuse('motorina-hg1174', 2014, 'acord_filed')).toBe('not_in_force');
    expect(refuse('motorina-pompa-2027', 2027, 'acord_filed')).toBe('cannot_join');
    expect(refuse('energie-regenerabila-art399', 2026, 'approved')).toBe('cannot_join');
    expect(refuse('nu-exista', 2026, 'interested')).toBe('unknown_scheme');
  });

  it('keeps the acord day only with an acord', () => {
    const ok = SetExciseEnrollmentInputSchema.safeParse({ schemeId: 'motorina-hg1174', year: '2026', status: 'acord_filed', acordOn: '2025-12-19' });
    expect(ok.success && ok.data.year).toBe(2026);
    expect(SetExciseEnrollmentInputSchema.safeParse({ schemeId: 'motorina-hg1174', year: 2026, status: 'interested', acordOn: '2025-12-19' }).success).toBe(false);
    expect(SetExciseEnrollmentInputSchema.parse({ schemeId: 'motorina-hg1174', year: 2026, status: 'interested' }).acordOn).toBeNull();
  });
});
