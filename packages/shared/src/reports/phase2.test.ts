import { describe, expect, it } from 'vitest';
import fuelJson from '../../../../docs/data/fuel-excise.json';
import { op, plot, season } from '../plots/fixtures';
import { capFor, FuelExciseSchema, fuelCapCl, fuelLines, fuelRefundBani, litresToCl, rateOn } from './fuel';
import { landOf, treatmentsOf } from './land';
import type { ReportRecord } from './ledger';
import { periodOf } from './period';

const rate = FuelExciseSchema.parse(fuelJson);

describe('diesel excise', () => {
  it('picks the rate of the day the diesel was bought', () => {
    expect(rateOn('2026-03-10', rate.rates)!.bani_per_10_l).toBe(2697);
    expect(rateOn('2026-05-10', rate.rates)!.bani_per_10_l).toBe(2397);
    expect(rateOn('2026-09-10T08:00:00Z', rate.rates)!.bani_per_10_l).toBe(1996);
    expect(rateOn('2025-03-01', rate.rates)!.bani_per_10_l).toBe(2213);
    // the edges belong to their own period
    expect(rateOn('2026-04-06', rate.rates)!.bani_per_10_l).toBe(2697);
    expect(rateOn('2026-04-07', rate.rates)!.bani_per_10_l).toBe(2397);
    // December 2026 isn't known yet, and nothing before 2025 is in the file
    expect(rateOn('2026-12-05', rate.rates)).toBeNull();
    expect(rateOn('2024-06-01', rate.rates)).toBeNull();
  });

  it('has no gaps or overlaps between the rates', () => {
    const sorted = [...rate.rates].sort((a, b) => a.from.localeCompare(b.from));
    for (let i = 1; i < sorted.length; i++) {
      const next = new Date(`${sorted[i - 1]!.to}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      expect(sorted[i]!.from).toBe(next.toISOString().slice(0, 10));
    }
  });

  it('keeps litres as whole hundredths and refunds in whole bani', () => {
    expect(litresToCl(120.5)).toBe(12050);
    expect(litresToCl(0.1 + 0.2)).toBe(30);
    // 100 l × 2,697 lei = 269,70 lei
    expect(fuelRefundBani(10000, 2697)).toBe(26970);
    // 1 l → 269,7 bani, rounded
    expect(fuelRefundBani(100, 2697)).toBe(270);
  });

  it('refunds each line at its own rate and leaves out days with no known rate', () => {
    const rows: ReportRecord[] = [
      { id: 'mar', date: '2026-03-10', kind: 'expense', category: 'diesel', amountBani: -70000, fuelLitersCl: 10000 },
      { id: 'may', date: '2026-05-10', kind: 'expense', category: 'diesel', amountBani: -70000, fuelLitersCl: 10000 },
      { id: 'sep', date: '2026-09-10', kind: 'expense', category: 'diesel', amountBani: -70000, fuelLitersCl: 10000 },
      { id: 'dec', date: '2026-12-10', kind: 'expense', category: 'diesel', amountBani: -70000, fuelLitersCl: 10000 },
    ];
    const f = fuelLines(rows, rate);
    expect(f.lines.map((l) => l.refundBani)).toEqual([26970, 23970, 19960, null]);
    expect(f.refundBani).toBe(26970 + 23970 + 19960);
    expect(f.noRate.map((r) => r.id)).toEqual(['dec']);
    expect(f.litresCl).toBe(40000);
    expect(f.rates.map((r) => r.bani_per_10_l)).toEqual([2697, 2397, 1996]);
    // the crisis rate is still to check
    expect(f.unverified).toBe(true);
  });

  it('rounds once per rate, not once per line', () => {
    const rows: ReportRecord[] = [1, 2, 3].map((i) => ({ id: `r${i}`, date: '2026-02-0' + i, kind: 'expense' as const, category: 'diesel', amountBani: -100, fuelLitersCl: 1 }));
    // 3 × 0,01 l × 269,7 bani = 8,09 → 8 bani, while each line alone rounds to 3
    expect(fuelLines(rows, rate).refundBani).toBe(8);
  });

  it('finds the litre cap of a crop by code, then group, then section', () => {
    const caps = rate.caps_l_per_ha;
    expect(capFor({ code: 101, heading: 'CEREALE PENTRU BOABE', section: 'I. TEREN ARABIL – TA' }, caps)!.value).toBe(78);
    // porumb siloz sits among the cereals, but has the fodder cap
    expect(capFor({ code: 131, heading: 'CEREALE PENTRU BOABE', section: 'I. TEREN ARABIL – TA' }, caps)!.value).toBe(130);
    expect(capFor({ code: 604, heading: null, section: 'II. PAJIŞTE PERMANENTĂ – PP' }, caps)!.value).toBe(30);
    expect(capFor({ code: 970, heading: null, section: 'I. TEREN ARABIL – TA' }, caps)).toBeNull();
  });

  it('adds up the yearly cap by hectares, and cuts it for an acord asked during the year', () => {
    const parcels = [
      { code: 101, heading: 'CEREALE PENTRU BOABE', section: 'I.', areaHa: 8, name: 'Grâu' },
      { code: 108, heading: 'CEREALE PENTRU BOABE', section: 'I.', areaHa: 7, name: 'Porumb' },
      { code: 970, heading: null, section: 'I.', areaHa: 0.5, name: 'Teren necultivat' },
    ];
    // 15 ha × 78 l = 1.170 l
    expect(fuelCapCl(parcels, rate.caps_l_per_ha)).toEqual({ capCl: 117000, uncapped: ['Teren necultivat'] });
    // acord in March: April–December, 9 months of 12
    expect(fuelCapCl(parcels, rate.caps_l_per_ha, 3).capCl).toBe(87750);
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
    // July 2026: the full rate
    expect(f.refundBani).toBe(fuelRefundBani(150050, 2697));
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
