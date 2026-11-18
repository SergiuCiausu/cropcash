import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { ageFromCnp, countyFromText, filesProblem, mergePaperHa, normalizeReading, parseAreaText, parseLeiText, type DocumentExtraction } from './index';

const data = loadData();
const TODAY = '2026-11-15';

const raw = (over: Partial<DocumentExtraction> = {}): DocumentExtraction => ({
  kind: 'invoice',
  year: null,
  crops: [],
  amount: null,
  date: null,
  category: null,
  crop_id: null,
  applicant: null,
  total_area: null,
  ...over,
});

describe('parseLeiText', () => {
  it.each([
    ['12.345,67 lei', 1_234_567],
    ['12345,67', 1_234_567],
    ['12,345.67', 1_234_567],
    ['1.234', 123_400],
    ['1.234.567', 123_456_700],
    ['950', 95_000],
    ['950,5', 95_050],
    ['2 500,00 RON', 250_000],
  ])('reads %s', (text, bani) => {
    expect(parseLeiText(text)).toBe(bani);
  });

  it.each([[null], [undefined], [''], ['o sută'], ['0'], ['-12,00'], ['12,34,56x']])('gives up on %s', (text) => {
    expect(parseLeiText(text)).toBeNull();
  });

  it('stays exact where a float would drift', () => {
    expect(parseLeiText('1.234,57')).toBe(123_457);
    expect(parseLeiText('0,07')).toBe(7);
  });
});

describe('parseAreaText', () => {
  it.each([
    ['8,50', 850],
    ['8.5', 850],
    ['3.125 ha', 313],
    ['15', 1500],
    ['0,30', 30],
  ])('reads %s', (text, ari) => {
    expect(parseAreaText(text)).toBe(ari);
  });

  it.each([[''], ['mult'], ['0'], [null]])('gives up on %s', (text) => {
    expect(parseAreaText(text)).toBeNull();
  });
});

describe('normalizeReading', () => {
  it('adds a crop up across parcels, in code', () => {
    const r = normalizeReading(
      raw({
        kind: 'apia_cerere',
        year: '2026',
        crops: [
          { code: null, crop_id: 'grau', name: 'Grâu comun', area: '5,25' },
          { code: null, crop_id: 'grau', name: 'Grâu comun', area: '2,75' },
          { code: null, crop_id: 'porumb', name: 'Porumb', area: '7' },
        ],
      }),
      data,
      TODAY,
    );
    expect(r.year).toBe(2026);
    expect(r.parcels).toEqual([{ cropId: 'grau', areaAri: 800 }, { cropId: 'porumb', areaAri: 700 }]);
  });

  it('names a crop it does not know, and never invents an id', () => {
    const r = normalizeReading(raw({ kind: 'apia_cerere', crops: [{ code: null, crop_id: 'lucerna-x', name: 'Lucernă', area: '2' }] }), data, TODAY);
    expect(r.parcels).toEqual([]);
    expect(r.unknownCrops).toEqual(['Lucernă']);
  });

  it('takes the amount from a decision, and none from a cerere', () => {
    expect(normalizeReading(raw({ kind: 'apia_decizie', year: '2026', amount: '16.900,50' }), data, TODAY).amountBani).toBe(1_690_050);
    expect(normalizeReading(raw({ kind: 'apia_cerere', amount: '16.900,50' }), data, TODAY).amountBani).toBeNull();
  });

  it('keeps an invoice to what the form takes', () => {
    const r = normalizeReading(raw({ amount: '1.200,00', date: '2026-10-03', category: 'diesel', crop_id: 'grau', crops: [{ code: null, crop_id: 'grau', name: 'x', area: '1' }] }), data, TODAY);
    expect(r).toMatchObject({ amountBani: 120_000, date: '2026-10-03', category: 'diesel', cropId: null, parcels: [] });
  });

  it('drops an impossible date, an unknown crop and a year that is not one', () => {
    const r = normalizeReading(raw({ kind: 'sale_paper', date: '2026-13-40', crop_id: 'banane' }), data, TODAY);
    expect(r.date).toBeNull();
    expect(r.cropId).toBeNull();
    expect(normalizeReading(raw({ kind: 'apia_decizie', year: 'anul 2026' }), data, TODAY).year).toBeNull();
  });

  it('keeps nothing from a paper it does not recognise', () => {
    const r = normalizeReading(raw({ kind: 'other', amount: '100', date: '2026-01-01', category: 'other', year: '2026' }), data, TODAY);
    expect(r).toMatchObject({ amountBani: null, date: null, category: null, year: null, applicant: null, totalAri: null });
  });

  it('matches a cerere row by its APIA code, whatever the AI guessed', () => {
    const r = normalizeReading(
      raw({
        kind: 'apia_cerere',
        crops: [
          { code: '101', crop_id: null, name: 'GRÂU COMUN DE TOAMNĂ', area: '5,25' },
          { code: '1020', crop_id: 'porumb', name: 'GRÂU DUR DE PRIMĂVARĂ', area: '1' },
          { code: '117', crop_id: null, name: 'PORUMB-HIBRID/SOI TARDIV', area: '7,20' },
          { code: '109', crop_id: 'porumb', name: 'PORUMB ZAHARAT', area: '0,50' },
          { code: '201', crop_id: null, name: 'FLOAREA SOARELUI', area: '3,5' },
        ],
      }),
      data,
      TODAY,
    );
    expect(r.parcels).toEqual([
      { cropId: 'grau', areaAri: 525 },
      { cropId: 'apia-1020', areaAri: 100 },
      { cropId: 'apia-117', areaAri: 720 },
      { cropId: 'floarea-soarelui', areaAri: 350 },
    ]);
    // No figures for sweet corn: it keeps its APIA name and code, and doesn't count as maize.
    expect(r.unknownCrops).toEqual(['Porumb zaharat (cod 109)']);
  });

  it('reads who the cerere is for, without the CNP', () => {
    const r = normalizeReading(
      raw({
        kind: 'apia_cerere',
        applicant: { first_name: 'ION', last_name: 'POPESCU', cnp: '1660315340010', county_farm: null, county_home: 'TELEORMAN' },
        total_area: '15,95',
      }),
      data,
      TODAY,
    );
    expect(r.applicant).toEqual({ firstName: 'Ion', fullName: 'Ion Popescu', age: 60, county: 'TR' });
    expect(r.totalAri).toBe(1595);
    expect(JSON.stringify(r)).not.toContain('1660315340010');
  });

  it('takes the county of the farm before the one of the home', () => {
    const applicant = { first_name: 'Ana-Maria', last_name: null, cnp: null, county_farm: 'Jud. Dâmbovița', county_home: 'Teleorman' };
    const r = normalizeReading(raw({ kind: 'apia_cerere', applicant }), data, TODAY);
    expect(r.applicant).toEqual({ firstName: 'Ana-Maria', fullName: 'Ana-Maria', age: null, county: 'DB' });
  });

  it('reads no applicant and no total from a decision or an invoice', () => {
    const applicant = { first_name: 'Ion', last_name: 'Popescu', cnp: '1660315340010', county_farm: 'Teleorman', county_home: null };
    for (const kind of ['apia_decizie', 'invoice'] as const) {
      const r = normalizeReading(raw({ kind, applicant, total_area: '15' }), data, TODAY);
      expect(r.applicant).toBeNull();
      expect(r.totalAri).toBeNull();
    }
  });
});

describe('ageFromCnp', () => {
  it('reads the age on the day, by the century in the first digit', () => {
    expect(ageFromCnp('1660315340010', TODAY)).toBe(60);
    expect(ageFromCnp('5030101340046', TODAY)).toBe(23);
    expect(ageFromCnp(' 1660315 340010 ', TODAY)).toBe(60);
  });

  it('counts a birthday only from that day (young farmer is under 40)', () => {
    expect(ageFromCnp('2861115340027', TODAY)).toBe(40);
    expect(ageFromCnp('1861116340036', TODAY)).toBe(39);
  });

  it('works out the century for a resident (7, 8, 9)', () => {
    expect(ageFromCnp('7860315400052', TODAY)).toBe(40);
  });

  it('gives no age for a wrong digit, an impossible date, or an age no farmer has', () => {
    expect(ageFromCnp('1660315340011', TODAY)).toBeNull();
    expect(ageFromCnp('1660230340014', TODAY)).toBeNull();
    expect(ageFromCnp('5120101340011', TODAY)).toBeNull();
    expect(ageFromCnp('166031534001', TODAY)).toBeNull();
    expect(ageFromCnp(null, TODAY)).toBeNull();
  });
});

describe('countyFromText', () => {
  it('matches names however they are printed', () => {
    expect(countyFromText('TELEORMAN', data)).toBe('TR');
    expect(countyFromText('Judetul Bistrita Nasaud', data)).toBe('BN');
    expect(countyFromText('jud. Caraş-Severin', data)).toBe('CS');
    expect(countyFromText('Vâlcea', data)).toBe('VL');
    expect(countyFromText('TR', data)).toBe('TR');
  });

  it('puts București and its sectors on B', () => {
    expect(countyFromText('Mun. București', data)).toBe('B');
    expect(countyFromText('Sector 3', data)).toBe('B');
  });

  it('gives null for anything else', () => {
    expect(countyFromText('Teleorman Vest', data)).toBeNull();
    expect(countyFromText('', data)).toBeNull();
    expect(countyFromText(null, data)).toBeNull();
  });
});

describe('mergePaperHa', () => {
  it('adds what is missing, replaces what differs, keeps what the paper does not list', () => {
    const m = mergePaperHa({ grau: 800, porumb: 700, 'floarea-soarelui': 0, orz: 200 }, [
      { cropId: 'grau', areaAri: 800 },
      { cropId: 'porumb', areaAri: 720 },
      { cropId: 'floarea-soarelui', areaAri: 350 },
    ]);
    expect(m.next).toEqual({ grau: 800, porumb: 720, 'floarea-soarelui': 350, orz: 200 });
    expect(m.added).toEqual([{ cropId: 'floarea-soarelui', areaAri: 350 }]);
    expect(m.changed).toEqual([{ cropId: 'porumb', fromAri: 700, toAri: 720 }]);
    expect(m.kept).toEqual(['orz']);
  });

  it('changes nothing when the paper agrees', () => {
    const m = mergePaperHa({ grau: 800 }, [{ cropId: 'grau', areaAri: 800 }]);
    expect(m).toEqual({ next: { grau: 800 }, added: [], changed: [], kept: [] });
  });
});

describe('filesProblem', () => {
  const jpeg = (size: number) => ({ mediaType: 'image/jpeg' as const, data: `/9j/${'A'.repeat(size)}` });
  const limits = data.params.documents;

  it('accepts real files within the limits', () => {
    expect(filesProblem([jpeg(100), { mediaType: 'application/pdf', data: 'JVBERi0xLjQ=' }], data)).toBeNull();
  });

  it('refuses a file that is not what it says', () => {
    expect(filesProblem([{ mediaType: 'application/pdf', data: '/9j/AAAA' }], data)).toBe('bad_file');
    expect(filesProblem([{ mediaType: 'image/png', data: 'iVBORw<script>' }], data)).toBe('bad_file');
  });

  it('holds to the limits in docs/data', () => {
    expect(filesProblem(Array.from({ length: limits.max_pages.value + 1 }, () => jpeg(10)), data)).toBe('too_many');
    expect(filesProblem([jpeg(Math.ceil((limits.max_mb.value * 1024 * 1024 * 4) / 3) + 8)], data)).toBe('too_large');
  });
});

describe('the invoice number (migration 027)', () => {
  it('is kept on invoices and sale papers, trimmed, and never on APIA papers', () => {
    expect(normalizeReading(raw({ doc_no: '  AGR   0012345 ' }), data, TODAY).docNo).toBe('AGR 0012345');
    expect(normalizeReading(raw({ doc_no: null }), data, TODAY).docNo).toBeUndefined();
    expect(normalizeReading(raw({ kind: 'apia_decizie', doc_no: '123' }), data, TODAY).docNo).toBeUndefined();
  });
});
