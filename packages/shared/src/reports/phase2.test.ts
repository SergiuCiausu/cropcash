import { describe, expect, it } from 'vitest';
import fuelJson from '../../../../docs/data/fuel-excise.json';
import { op, plot, season } from '../plots/fixtures';
import { FuelExciseSchema, fuelLines, fuelRefundBani, litresToCl } from './fuel';
import { landOf, treatmentsOf } from './land';
import type { ReportRecord } from './ledger';
import { periodOf } from './period';

const rate = FuelExciseSchema.parse(fuelJson);

describe('diesel excise', () => {
  it('reads the rate from docs/data, marked as still to check', () => {
    expect(rate.refund_bani_per_10_l.value).toBe(2213);
    expect(rate.refund_bani_per_10_l.status).toBe('DE-VERIFICAT');
  });

  it('keeps litres as whole hundredths and refunds in whole bani', () => {
    expect(litresToCl(120.5)).toBe(12050);
    expect(litresToCl(0.1 + 0.2)).toBe(30);
    // 100 l × 2,213 lei = 221,30 lei
    expect(fuelRefundBani(10000, rate)).toBe(22130);
    // 1 l → 221,3 bani, rounded
    expect(fuelRefundBani(100, rate)).toBe(221);
  });

  it('counts only diesel expenses with litres, and lists the others to complete', () => {
    const rows: ReportRecord[] = [
      { id: 'a', date: '2026-07-01', kind: 'expense', category: 'diesel', amountBani: -700000, fuelLitersCl: 100000 },
      { id: 'b', date: '2026-07-02', kind: 'expense', category: 'diesel', amountBani: -350050, fuelLitersCl: 50050 },
      { id: 'c', date: '2026-07-03', kind: 'expense', category: 'diesel', amountBani: -9000 },
      { id: 'd', date: '2026-07-04', kind: 'expense', category: 'seeds', amountBani: -9000, fuelLitersCl: 100 },
    ];
    const f = fuelLines(rows, rate);
    expect(f.lines.map((l) => l.record.id)).toEqual(['a', 'b']);
    expect(f.missing.map((r) => r.id)).toEqual(['c']);
    expect(f.litresCl).toBe(150050);
    expect(f.paidBani).toBe(1050050);
    expect(f.refundBani).toBe(fuelRefundBani(150050, rate));
  });
});

describe('land and treatments', () => {
  const fp = {
    plots: [plot('p1', { name: 'La drum' }), plot('p2', { name: 'Balta' }), plot('old', { archived_at: '2026-01-01T00:00:00Z' })],
    seasons: [season('p1', 'grau', 800, { harvest_year: 2027 }), season('p2', 'porumb', 700, { harvest_year: 2027 }), season('p2', 'grau', 700, { harvest_year: 2026 }), season('old', 'grau', 100, { harvest_year: 2027 })],
    operations: [
      op('t1', 'p1', { harvest_year: 2027, kind: 'herbicide', status: 'done', on_date: '2027-04-10', product: 'X', dose: '1 l/ha' }),
      op('t2', 'p2', { harvest_year: 2027, kind: 'fungicide', status: 'planned', on_date: '2027-05-10' }),
      op('t3', 'p2', { harvest_year: 2027, kind: 'sowing', status: 'done', on_date: '2027-04-01' }),
      op('t4', 'p2', { harvest_year: 2027, kind: 'insecticide', status: 'done', on_date: '2027-03-02' }),
      op('t5', 'p1', { harvest_year: 2027, kind: 'fungicide', status: 'done', on_date: null }),
    ],
  };

  it('lists the parcels in use that year, without archived ones, with hectares per crop', () => {
    const l = landOf(fp, 2027);
    expect(l.rows.map((r) => [r.plot.id, r.season.crop_id])).toEqual([
      ['p1', 'grau'],
      ['p2', 'porumb'],
    ]);
    expect(l.crops).toEqual([
      { cropId: 'grau', ari: 800 },
      { cropId: 'porumb', ari: 700 },
    ]);
    expect(l.totalAri).toBe(1500);
  });

  it('keeps only treatments that were done, with the parcel’s crop that year', () => {
    const t = treatmentsOf(fp, periodOf('harvest', '2027'));
    expect(t.map((r) => r.operation.id)).toEqual(['t4', 't1', 't5']);
    expect(t[1]?.season?.crop_id).toBe('grau');
  });

  it('goes by the day for other periods, leaving out treatments with no day', () => {
    expect(treatmentsOf(fp, periodOf('quarter', '2027-Q2')).map((r) => r.operation.id)).toEqual(['t1']);
  });
});
