import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { filesProblem, normalizeReading, parseAreaText, parseLeiText, type DocumentExtraction } from './index';

const data = loadData();

const raw = (over: Partial<DocumentExtraction> = {}): DocumentExtraction => ({
  kind: 'invoice',
  year: null,
  crops: [],
  amount: null,
  date: null,
  category: null,
  crop_id: null,
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
          { crop_id: 'grau', name: 'Grâu comun', area: '5,25' },
          { crop_id: 'grau', name: 'Grâu comun', area: '2,75' },
          { crop_id: 'porumb', name: 'Porumb', area: '7' },
        ],
      }),
      data,
    );
    expect(r.year).toBe(2026);
    expect(r.parcels).toEqual([{ cropId: 'grau', areaAri: 800 }, { cropId: 'porumb', areaAri: 700 }]);
  });

  it('names a crop it does not know, and never invents an id', () => {
    const r = normalizeReading(raw({ kind: 'apia_cerere', crops: [{ crop_id: 'lucerna-x', name: 'Lucernă', area: '2' }] }), data);
    expect(r.parcels).toEqual([]);
    expect(r.unknownCrops).toEqual(['Lucernă']);
  });

  it('takes the amount from a decision, and none from a cerere', () => {
    expect(normalizeReading(raw({ kind: 'apia_decizie', year: '2026', amount: '16.900,50' }), data).amountBani).toBe(1_690_050);
    expect(normalizeReading(raw({ kind: 'apia_cerere', amount: '16.900,50' }), data).amountBani).toBeNull();
  });

  it('keeps an invoice to what the form takes', () => {
    const r = normalizeReading(raw({ amount: '1.200,00', date: '2026-10-03', category: 'diesel', crop_id: 'grau', crops: [{ crop_id: 'grau', name: 'x', area: '1' }] }), data);
    expect(r).toMatchObject({ amountBani: 120_000, date: '2026-10-03', category: 'diesel', cropId: null, parcels: [] });
  });

  it('drops an impossible date, an unknown crop and a year that is not one', () => {
    const r = normalizeReading(raw({ kind: 'sale_paper', date: '2026-13-40', crop_id: 'banane' }), data);
    expect(r.date).toBeNull();
    expect(r.cropId).toBeNull();
    expect(normalizeReading(raw({ kind: 'apia_decizie', year: 'anul 2026' }), data).year).toBeNull();
  });

  it('keeps nothing from a paper it does not recognise', () => {
    const r = normalizeReading(raw({ kind: 'other', amount: '100', date: '2026-01-01', category: 'other', year: '2026' }), data);
    expect(r).toMatchObject({ amountBani: null, date: null, category: null, year: null });
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
